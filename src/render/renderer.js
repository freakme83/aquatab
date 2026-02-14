/**
 * Canvas renderer (Safari-friendly).
 * Draw-only. Optimized for stable FPS.
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

    // Cache: water base (gradient + vignette baked once on resize/quality)
    this.baseCanvas = document.createElement('canvas');
    this.baseCtx = this.baseCanvas.getContext('2d');

    // Grain pattern (small tile)
    this.grainTile = this.#createGrainTile(96);
    this.grainPattern = null;

    // Caustics sprite (cheap)
    this.causticsSprite = this.#createCausticsSprite();
    this.causticSeeds = this.#createCausticSeeds(); // 2 patches
    this.causticsState = this.causticSeeds.map(() => ({ x: 0, y: 0, r: 0, a: 0 }));
    this.causticsLastUpdate = 0;

    // Subtle particles (optional)
    this.waterParticles = this.#createParticles(60);

    this._needsBaseRebuild = true;
  }

  setQuality(quality) {
    this.quality = quality === 'low' ? 'low' : 'high';
    // scale particles
    this.waterParticles = this.#createParticles(this.quality === 'low' ? 25 : 60);
    this._needsBaseRebuild = true;
  }

  resize(width, height) {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);

    // "tank object" with margins (negative space feel)
    const margin = Math.max(12, Math.min(width, height) * 0.035);
    this.tankRect = {
      x: margin,
      y: margin,
      width: Math.max(100, width - margin * 2),
      height: Math.max(100, height - margin * 2)
    };

    // patterns
    try {
      this.grainPattern = this.ctx.createPattern(this.grainTile, 'repeat');
    } catch {
      this.grainPattern = null;
    }

    this._needsBaseRebuild = true;

    // keep particles inside
    const { x, y, width: tw, height: th } = this.tankRect;
    for (const p of this.waterParticles) {
      p.x = x + rand(0, tw);
      p.y = y + rand(0, th);
    }
  }

  render(time, delta) {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // build cached base once
    if (this._needsBaseRebuild) this.#rebuildBase();

    // Tank shadow (cheap)
    this.#drawTankDropShadow(ctx);

    // Clip to tank
    ctx.save();
    this.#clipTankWater(ctx);

    // Cached water base
    ctx.drawImage(this.baseCanvas, this.tankRect.x, this.tankRect.y, this.tankRect.width, this.tankRect.height);

    // Caustics (30fps motion update)
    this.#drawCaustics(ctx, time);

    // Particles
    this.#drawWaterParticles(ctx, delta);

    // Bubbles from world
    this.#drawBubbles(ctx);

    // Fish
    this.#drawFishSchool(ctx, time);

    // Grain overlay (tile)
    this.#drawGrain(ctx, time);

    ctx.restore();

    // Frame & glass
    this.#drawInnerEdge(ctx);
    this.#drawGlassSheen(ctx, time);
    this.#drawTankFrame(ctx);
  }

  /* ----------------------- Cached base (big win) ----------------------- */

  #rebuildBase() {
    const { width, height } = this.tankRect;

    // hiDPI offscreen for crispness
    this.baseCanvas.width = Math.floor(width * this.dpr);
    this.baseCanvas.height = Math.floor(height * this.dpr);

    const ctx = this.baseCtx;
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);

    // Water gradient (once)
    const deep = ctx.createLinearGradient(0, 0, 0, height);
    deep.addColorStop(0, '#11324b');
    deep.addColorStop(0.55, '#0c2c45');
    deep.addColorStop(1, '#071a2a');
    ctx.fillStyle = deep;
    ctx.fillRect(0, 0, width, height);

    // Top glow (once)
    const topGlow = ctx.createRadialGradient(width * 0.3, height * 0.08, 20, width * 0.3, height * 0.08, width * 0.85);
    topGlow.addColorStop(0, 'rgba(200,235,255,0.09)');
    topGlow.addColorStop(1, 'rgba(200,235,255,0.00)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(0, 0, width, height);

    // Vignette (once)
    const v = ctx.createRadialGradient(width * 0.5, height * 0.46, width * 0.2, width * 0.5, height * 0.46, width * 0.85);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, this.quality === 'low' ? 'rgba(0,0,0,0.10)' : 'rgba(0,0,0,0.14)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, width, height);

    this._needsBaseRebuild = false;
  }

  /* ---------------------------- Layers ---------------------------- */

  #drawTankDropShadow(ctx) {
    const { x, y, width, height } = this.tankRect;
    // Cheap rectangle shadow (no gradients)
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = 'black';
    ctx.fillRect(x + 10, y + height + 6, width - 20, 16);
    ctx.restore();
  }

  #clipTankWater(ctx) {
    const { x, y, width, height } = this.tankRect;
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
  }

  #drawCaustics(ctx, time) {
    if (this.quality === 'low') return;

    // update positions at ~30fps
    if (time - this.causticsLastUpdate > 33) {
      this.causticsLastUpdate = time;
      const { x, y, width, height } = this.tankRect;

      this.causticSeeds.forEach((seed, i) => {
        this.causticsState[i].x = x + width * (0.5 + Math.sin(time * seed.speed + seed.phaseX) * 0.25);
        this.causticsState[i].y = y + height * (0.33 + Math.cos(time * seed.speed * 0.92 + seed.phaseY) * 0.18);
        this.causticsState[i].r = Math.max(width, height) * seed.size;
        this.causticsState[i].a = seed.alpha;
      });
    }

    for (const c of this.causticsState) {
      const d = c.r * 2;
      ctx.globalAlpha = c.a;
      ctx.drawImage(this.causticsSprite, c.x - c.r, c.y - c.r, d, d);
    }
    ctx.globalAlpha = 1;
  }

  #drawWaterParticles(ctx, delta) {
    if (this.quality === 'low') return;

    const { x, y, width, height } = this.tankRect;
    ctx.fillStyle = 'rgb(185,229,255)';

    for (const p of this.waterParticles) {
      p.y -= p.speed * delta;
      if (p.y < y - 4) {
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

  #drawBubbles(ctx) {
    const sx = this.tankRect.width / this.world.bounds.width;
    const sy = this.tankRect.height / this.world.bounds.height;

    for (const b of this.world.bubbles) {
      const bx = this.tankRect.x + b.x * sx;
      const by = this.tankRect.y + b.y * sy;

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(196,236,255,0.30)';
      ctx.lineWidth = 1;
      ctx.arc(bx, by, b.radius, 0, TAU);
      ctx.stroke();
    }
  }

  #drawFishSchool(ctx, time) {
    const sx = this.tankRect.width / this.world.bounds.width;
    const sy = this.tankRect.height / this.world.bounds.height;

    for (const fish of this.world.fish) {
      const pos = {
        x: this.tankRect.x + fish.position.x * sx,
        y: this.tankRect.y + fish.position.y * sy
      };
      this.#drawFish(ctx, fish, pos, time);
    }
  }

  // Cheap fish: no shadowBlur, no per-fish gradient
  #drawFish(ctx, fish, position, time) {
    const heading = fish.heading();
    const bodyLength = fish.size * 1.32;
    const bodyHeight = fish.size * 0.73;
    const tailWag = Math.sin(time * 0.004 + position.x * 0.008) * fish.size * 0.13;

    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(heading);

    // Body
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = `hsl(${fish.colorHue}deg 58% 55%)`;
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyLength * 0.5, bodyHeight * 0.5, 0, 0, TAU);
    ctx.fill();

    // Highlight
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.ellipse(-bodyLength * 0.08, -bodyHeight * 0.12, bodyLength * 0.25, bodyHeight * 0.22, 0, 0, TAU);
    ctx.fill();

    // Tail
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = `hsl(${fish.colorHue - 8}deg 55% 42%)`;
    ctx.beginPath();
    ctx.moveTo(-bodyLength * 0.52, 0);
    ctx.lineTo(-bodyLength * 0.86, bodyHeight * 0.4 + tailWag);
    ctx.lineTo(-bodyLength * 0.86, -bodyHeight * 0.4 - tailWag);
    ctx.closePath();
    ctx.fill();

    // Eye
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#06131d';
    ctx.beginPath();
    ctx.arc(bodyLength * 0.26, -bodyHeight * 0.12, Math.max(1.2, fish.size * 0.06), 0, TAU);
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
    ctx.globalAlpha = 0.035;
    ctx.translate(x + shiftX, y + shiftY);
    ctx.fillStyle = this.grainPattern;
    ctx.fillRect(-shiftX, -shiftY, width + 96, height + 96);
    ctx.restore();
  }

  #drawInnerEdge(ctx) {
    const { x, y, width, height } = this.tankRect;
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = 'black';
    ctx.lineWidth = 5;
    ctx.strokeRect(x + 5, y + 5, width - 10, height - 10);
    ctx.restore();
  }

  #drawGlassSheen(ctx, time) {
    const { x, y, width, height } = this.tankRect;
    ctx.save();
    ctx.globalAlpha = 0.07;
    ctx.strokeStyle = 'white';
    ctx.lineWidth = 2;

    const t = (Math.sin(time * 0.0003) * 0.5 + 0.5);
    const sx = x + width * (0.58 + t * 0.10);
    const sy = y + height * 0.10;

    ctx.beginPath();
    ctx.moveTo(sx, sy);
    ctx.lineTo(x + width * 0.96, y + height * 0.44);
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

  /* ---------------------------- Assets ---------------------------- */

  #createParticles(count) {
    const { x, y, width, height } = this.tankRect.width ? this.tankRect : { x: 0, y: 0, width: 900, height: 640 };
    return Array.from({ length: count }, () => ({
      x: x + rand(0, width),
      y: y + rand(0, height),
      r: rand(0.4, 1.4),
      alpha: rand(0.03, 0.10),
      speed: rand(6, 18)
    }));
  }

  #createGrainTile(size) {
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const gctx = c.getContext('2d');
    const img = gctx.createImageData(size, size);
    for (let i = 0; i < img.data.length; i += 4) {
      const g = (Math.random() * 90 + 90) | 0; // 90..180
      img.data[i] = g;
      img.data[i + 1] = g;
      img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
    gctx.putImageData(img, 0, 0);
    return c;
  }

  #createCausticsSprite() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const cctx = c.getContext('2d');
    const g = cctx.createRadialGradient(128, 128, 24, 128, 128, 128);
    g.addColorStop(0, 'rgba(200,236,255,0.48)');
    g.addColorStop(1, 'rgba(200,236,255,0)');
    cctx.fillStyle = g;
    cctx.fillRect(0, 0, 256, 256);
    return c;
  }

  #createCausticSeeds() {
    return [
      { phaseX: rand(0, TAU), phaseY: rand(0, TAU), size: 0.46, alpha: 0.06, speed: 0.00011 },
      { phaseX: rand(0, TAU), phaseY: rand(0, TAU), size: 0.34, alpha: 0.05, speed: 0.00014 }
    ];
  }
}
