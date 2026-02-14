/**
 * Canvas renderer (optimized for stable FPS).
 * Responsibility: draw-only layers for tank, water ambiance, and fish visuals.
 *
 * Key optimizations:
 * - Pre-render static water background + vignette into an offscreen canvas on resize/quality change.
 * - Use a small tiled grain pattern (not full-size ImageData).
 * - Avoid expensive per-fish gradients/Path2D; draw simple shapes with a small highlight.
 * - Keep caustics as a cached sprite and update motion at ~30fps.
 */

const TAU = Math.PI * 2;
const rand = (min, max) => min + Math.random() * (max - min);

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.world = world;

    this.dpr = window.devicePixelRatio || 1;
    this.tankRect = { x: 0, y: 0, width: 0, height: 0 };

    this.quality = 'high';

    // Particles (very cheap, subtle)
    this.waterParticles = this.#createParticles(70);

    // Cached sprites / offscreen buffers
    this.baseCanvas = document.createElement('canvas');   // tank water base + vignette
    this.baseCtx = this.baseCanvas.getContext('2d');

    this.grainTile = this.#createGrainTile(96);
    this.grainPattern = null;

    this.causticsSprite = this.#createCausticsSprite();
    this.causticSeeds = this.#createCausticSeeds();
    this.causticsState = this.causticSeeds.map(() => ({ x: 0, y: 0, s: 0, a: 0 }));
    this.causticsLastUpdate = 0;

    this._needsBaseRebuild = true;
  }

  setQuality(quality) {
    this.quality = quality === 'low' ? 'low' : 'high';

    // Scale particle budget with quality
    const target = this.quality === 'low' ? 35 : 70;
    if (this.waterParticles.length !== target) {
      this.waterParticles = this.#createParticles(target);
    }

    this._needsBaseRebuild = true;
  }

  resize(width, height) {
    this.dpr = window.devicePixelRatio || 1;

    // Physical canvas size (HiDPI)
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);

    // Tank as an "object" with margins (negative space)
    const margin = Math.max(18, Math.min(width, height) * 0.06);
    this.tankRect = {
      x: margin,
      y: margin,
      width: Math.max(240, width - margin * 2),
      height: Math.max(180, height - margin * 2)
    };

    this._needsBaseRebuild = true;
    this.#rebuildPatterns();
    this.#reseedParticles();
  }

  render(time, delta) {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    // Draw in CSS pixels
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // Static pre-rendered base (water + vignette)
    if (this._needsBaseRebuild) this.#rebuildTankBase();
    this.#drawTankDropShadow(ctx);
    this.#drawTankBase(ctx);

    // Clip tank contents
    ctx.save();
    this.#clipTankWater(ctx);

    // Subtle caustics (sprite-based, motion updates at ~30fps)
    this.#drawCaustics(ctx, time);

    // Cheap particles
    this.#drawWaterParticles(ctx, delta);

    // Fish
    this.#drawFishSchool(ctx, time);

    // Grain overlay (tiled)
    this.#drawGrain(ctx, time);

    ctx.restore();

    // Glass + frame on top
    this.#drawInnerEdge(ctx);
    this.#drawGlassSheen(ctx, time);
    this.#drawTankFrame(ctx);
  }

  /* ----------------------------- Build helpers ---------------------------- */

  #rebuildPatterns() {
    // (Re)create tiled grain pattern on the main context (fast)
    try {
      this.grainPattern = this.ctx.createPattern(this.grainTile, 'repeat');
    } catch {
      this.grainPattern = null;
    }
  }

  #reseedParticles() {
    const { x, y, width, height } = this.tankRect;
    for (const p of this.waterParticles) {
      p.x = x + rand(0, width);
      p.y = y + rand(0, height);
    }
  }

  #createParticles(count) {
    return Array.from({ length: count }, () => ({
      x: 0,
      y: 0,
      r: rand(0.4, 1.4),
      alpha: rand(0.04, 0.12),
      speed: rand(6, 18)
    }));
  }

  #createGrainTile(size) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const ctx = c.getContext('2d');

    // Small ImageData once (tile), not full tank size
    const img = ctx.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const g = (Math.random() * 90 + 90) | 0; // 90..180
      img.data[i] = g;
      img.data[i + 1] = g;
      img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  #createCausticsSprite() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 20, 128, 128, 128);
    g.addColorStop(0, 'rgba(200,236,255,0.52)');
    g.addColorStop(1, 'rgba(200,236,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return c;
  }

  #createCausticSeeds() {
    // 2 patches are enough
    return [
      { speed: 0.00022, phaseX: rand(0, 10), phaseY: rand(0, 10), scale: 0.9 },
      { speed: 0.00016, phaseX: rand(0, 10), phaseY: rand(0, 10), scale: 0.7 }
    ];
  }

  #rebuildTankBase() {
    const { width, height } = this.tankRect;
    const bw = Math.max(1, Math.floor(width * this.dpr));
    const bh = Math.max(1, Math.floor(height * this.dpr));

    this.baseCanvas.width = bw;
    this.baseCanvas.height = bh;

    const ctx = this.baseCtx;
    // draw in CSS pixels for predictable gradients
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Water base gradient (static)
    const deep = ctx.createLinearGradient(0, 0, 0, height);
    deep.addColorStop(0, '#11324b');
    deep.addColorStop(0.5, '#0c2c45');
    deep.addColorStop(1, '#071a2a');
    ctx.fillStyle = deep;
    ctx.fillRect(0, 0, width, height);

    // Top glow (static)
    const topGlow = ctx.createRadialGradient(
      width * 0.3, height * 0.12, 20,
      width * 0.3, height * 0.12, Math.max(220, width * 0.75)
    );
    topGlow.addColorStop(0, 'rgba(115,210,255,0.16)');
    topGlow.addColorStop(1, 'rgba(115,210,255,0)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, width, height);

    // Vignette (static)
    const vig = ctx.createRadialGradient(
      width * 0.5, height * 0.48, Math.min(width, height) * 0.18,
      width * 0.5, height * 0.48, Math.max(width, height) * 0.7
    );
    vig.addColorStop(0, 'rgba(0,0,0,0)');
    vig.addColorStop(1, this.quality === 'low' ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.16)');
    ctx.fillStyle = vig;
    ctx.fillRect(0, 0, width, height);

    this._needsBaseRebuild = false;
  }

  /* ------------------------------ Draw layers ----------------------------- */

  #drawTankBase(ctx) {
    const { x, y, width, height } = this.tankRect;
    ctx.drawImage(this.baseCanvas, x, y, width, height);
  }

  #clipTankWater(ctx) {
    const { x, y, width, height } = this.tankRect;
    const inset = 8;
    const rx = x + inset;
    const ry = y + inset;
    const rw = Math.max(1, width - inset * 2);
    const rh = Math.max(1, height - inset * 2);
    const r = 10;

    ctx.beginPath();
    ctx.moveTo(rx + r, ry);
    ctx.lineTo(rx + rw - r, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + r);
    ctx.lineTo(rx + rw, ry + rh - r);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - r, ry + rh);
    ctx.lineTo(rx + r, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - r);
    ctx.lineTo(rx, ry + r);
    ctx.quadraticCurveTo(rx, ry, rx + r, ry);
    ctx.closePath();
    ctx.clip();
  }

  #drawCaustics(ctx, time) {
    if (this.quality === 'low') return;

    // Update positions at ~30fps
    if (time - this.causticsLastUpdate > 33) {
      this.causticsLastUpdate = time;
      const { x, y, width, height } = this.tankRect;

      this.causticSeeds.forEach((seed, i) => {
        const cx = x + width * (0.5 + Math.sin(time * seed.speed + seed.phaseX) * 0.26);
        const cy = y + height * (0.35 + Math.cos(time * (seed.speed * 1.08) + seed.phaseY) * 0.20);
        const s = Math.max(220, Math.min(width, height) * 0.9) * seed.scale;
        this.causticsState[i].x = cx;
        this.causticsState[i].y = cy;
        this.causticsState[i].s = s;
        this.causticsState[i].a = 0.06 * seed.scale;
      });
    }

    for (const c of this.causticsState) {
      if (!c.s) continue;
      ctx.globalAlpha = c.a;
      ctx.drawImage(this.causticsSprite, c.x - c.s * 0.5, c.y - c.s * 0.5, c.s, c.s);
    }
    ctx.globalAlpha = 1;
  }

  #drawWaterParticles(ctx, delta) {
    if (this.quality === 'low') return;

    const { x, y, width, height } = this.tankRect;

    ctx.fillStyle = 'rgb(185,229,255)';
    for (const p of this.waterParticles) {
      p.y -= p.speed * delta;

      if (p.y < y - 8) {
        p.y = y + height + rand(6, 40);
        p.x = x + rand(0, width);
      }

      ctx.globalAlpha = p.alpha;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  #drawFishSchool(ctx, time) {
    const ctx = this.ctx;
    const fish = this.world.fish || [];
    for (let i = 0; i < fish.length; i++) {
      const f = fish[i];
      const pos = typeof f.position === 'function' ? f.position() : (f.pos || { x: 0, y: 0 });
      this.#drawFish(ctx, f, pos, time);
    }
  }

  #drawFish(ctx, fish, position, time) {
    const heading = fish.heading ? fish.heading() : 0;
    const size = fish.size || 10;

    const bodyL = size * 1.35;
    const bodyH = size * 0.75;

    const tailWag = Math.sin(time * 0.004 + position.x * 0.01) * size * 0.12;
    const hue = fish.colorHue ?? 28;

    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(heading);

    // Body
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = `hsl(${hue}deg 58% 56%)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyL * 0.5, bodyH * 0.5, 0, 0, TAU);
    ctx.fill();

    // Soft highlight
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.ellipse(-bodyL * 0.10, -bodyH * 0.12, bodyL * 0.26, bodyH * 0.22, 0, 0, TAU);
    ctx.fill();

    // Tail
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = `hsl(${hue - 6}deg 52% 48%)`;
    ctx.beginPath();
    ctx.moveTo(-bodyL * 0.52, 0);
    ctx.lineTo(-bodyL * 0.82, -bodyH * 0.26 + tailWag);
    ctx.lineTo(-bodyL * 0.82, bodyH * 0.26 + tailWag);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'black';
    ctx.beginPath();
    ctx.arc(bodyL * 0.22, -bodyH * 0.10, Math.max(1.2, size * 0.06), 0, TAU);
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.restore();
  }

  #drawGrain(ctx, time) {
    if (this.quality === 'low' || !this.grainPattern) return;

    const { x, y, width, height } = this.tankRect;
    const shiftX = ((time * 0.02) % 96) | 0;
    const shiftY = ((time * 0.017) % 96) | 0;

    ctx.save();
    ctx.globalAlpha = 0.04;
    ctx.translate(x + shiftX, y + shiftY);
    ctx.fillStyle = this.grainPattern;
    ctx.fillRect(-shiftX, -shiftY, width + 96, height + 96);
    ctx.restore();
  }

  #drawTankDropShadow(ctx) {
    const { x, y, width, height } = this.tankRect;
    // Simple & cheap
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'black';
    ctx.fillRect(x + 10, y + height + 8, width - 20, 18);
    ctx.restore();
  }

  #drawInnerEdge(ctx) {
    const { x, y, width, height } = this.tankRect;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 6;
    ctx.strokeRect(x + 6, y + 6, width - 12, height - 12);
    ctx.restore();
  }

  #drawGlassSheen(ctx, time) {
    const { x, y, width, height } = this.tankRect;
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;

    const t = (Math.sin(time * 0.0003) * 0.5 + 0.5);
    const sx = x + width * (0.55 + t * 0.12);
    const sy = y + height * 0.08;
    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(x + width * 0.95, y + height * 0.42);
    ctx.stroke();
    ctx.restore();
  }

  #drawTankFrame(ctx) {
    const { x, y, width, height } = this.tankRect;

    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = 2;
    ctx.strokeRect(x, y, width, height);

    ctx.strokeStyle = 'rgba(0,0,0,0.22)';
    ctx.lineWidth = 1;
    ctx.strokeRect(x + 3, y + 3, width - 6, height - 6);
    ctx.restore();
  }
}
