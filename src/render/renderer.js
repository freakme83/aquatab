/**
 * Canvas renderer.
 * Responsibility: draw-only layers for tank, water ambiance, and fish visuals.
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
    this.waterParticles = this.#createParticles(100);

    this.vignetteCanvas = document.createElement('canvas');
    this.grainCanvas = document.createElement('canvas');
    this.causticsSprite = this.#createCausticsSprite();

    this.causticSeeds = this.#createCausticSeeds();
    this.causticsState = this.causticSeeds.map(() => ({ x: 0, y: 0, r: 0, a: 0 }));
    this.causticsLastUpdate = 0;
  }

  setQuality(quality) {
    this.quality = quality;
  }

  resize(width, height) {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.floor(width * this.dpr);
    this.canvas.height = Math.floor(height * this.dpr);

    const margin = Math.max(12, Math.min(width, height) * 0.035);
    this.tankRect = {
      x: margin,
      y: margin,
      width: Math.max(100, width - margin * 2),
      height: Math.max(100, height - margin * 2)
    };

    this.#buildStaticOverlays();

    for (const p of this.waterParticles) {
      p.x = Math.min(width, Math.max(0, p.x));
      p.y = Math.min(height, Math.max(0, p.y));
    }
  }

  render(time, delta) {
    const ctx = this.ctx;
    const w = this.canvas.width / this.dpr;
    const h = this.canvas.height / this.dpr;

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    this.#drawTankDropShadow(ctx);

    ctx.save();
    this.#clipTankWater(ctx);
    this.#drawWaterBase(ctx);
    this.#drawCaustics(ctx, time);
    this.#drawWaterParticles(ctx, delta);
    this.#drawBubbles(ctx);
    this.#drawFishSchool(ctx, time);
    this.#drawCachedVignette(ctx);
    this.#drawCachedGrain(ctx, time);
    ctx.restore();

    this.#drawInnerEdge(ctx);
    this.#drawGlassSheen(ctx, time);
    this.#drawTankFrame(ctx);
  }

  #createParticles(count) {
    return Array.from({ length: count }, () => ({
      x: rand(0, this.canvas.width || 900),
      y: rand(0, this.canvas.height || 640),
      r: rand(0.4, 1.4),
      alpha: rand(0.03, 0.1),
      speed: rand(3, 10)
    }));
  }

  #buildStaticOverlays() {
    const w = Math.max(1, Math.floor(this.tankRect.width));
    const h = Math.max(1, Math.floor(this.tankRect.height));

    this.vignetteCanvas.width = w;
    this.vignetteCanvas.height = h;
    const vctx = this.vignetteCanvas.getContext('2d');
    const v = vctx.createRadialGradient(w * 0.5, h * 0.46, w * 0.2, w * 0.5, h * 0.46, w * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.16)');
    vctx.clearRect(0, 0, w, h);
    vctx.fillStyle = v;
    vctx.fillRect(0, 0, w, h);

    this.grainCanvas.width = w;
    this.grainCanvas.height = h;
    const gctx = this.grainCanvas.getContext('2d');
    const img = gctx.createImageData(w, h);
    for (let i = 0; i < img.data.length; i += 4) {
      const g = Math.floor(rand(95, 165));
      img.data[i] = g;
      img.data[i + 1] = g;
      img.data[i + 2] = g;
      img.data[i + 3] = 255;
    }
    gctx.putImageData(img, 0, 0);
  }

  #createCausticsSprite() {
    const c = document.createElement('canvas');
    c.width = 256;
    c.height = 256;
    const ctx = c.getContext('2d');
    const g = ctx.createRadialGradient(128, 128, 24, 128, 128, 128);
    g.addColorStop(0, 'rgba(200,236,255,0.55)');
    g.addColorStop(1, 'rgba(200,236,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, 256, 256);
    return c;
  }

  #createCausticSeeds() {
    return [
      { phaseX: rand(0, TAU), phaseY: rand(0, TAU), size: 0.48, alpha: 0.13, speed: 0.00011 },
      { phaseX: rand(0, TAU), phaseY: rand(0, TAU), size: 0.36, alpha: 0.12, speed: 0.00014 },
      { phaseX: rand(0, TAU), phaseY: rand(0, TAU), size: 0.42, alpha: 0.1, speed: 0.0001 }
    ];
  }

  #drawTankDropShadow(ctx) {
    const { x, y, width, height } = this.tankRect;
    const g = ctx.createRadialGradient(x + width * 0.5, y + height + 8, width * 0.2, x + width * 0.5, y + height + 8, width * 0.8);
    g.addColorStop(0, 'rgba(0,0,0,0.22)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - 8, y + height - 8, width + 16, Math.max(18, height * 0.18));
  }

  #clipTankWater(ctx) {
    const { x, y, width, height } = this.tankRect;
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
  }

  #drawWaterBase(ctx) {
    const { x, y, width, height } = this.tankRect;
    const deep = ctx.createLinearGradient(0, y, 0, y + height);
    deep.addColorStop(0, '#11324b');
    deep.addColorStop(0.5, '#0c2c45');
    deep.addColorStop(1, '#071a2a');
    ctx.fillStyle = deep;
    ctx.fillRect(x, y, width, height);

    const topGlow = ctx.createRadialGradient(x + width * 0.3, y + height * 0.08, 20, x + width * 0.3, y + height * 0.08, width * 0.8);
    topGlow.addColorStop(0, 'rgba(200,235,255,0.11)');
    topGlow.addColorStop(1, 'rgba(200,235,255,0.01)');
    ctx.fillStyle = topGlow;
    ctx.fillRect(x, y, width, height);
  }

  #drawCaustics(ctx, time) {
    if (time - this.causticsLastUpdate > 33) {
      this.causticsLastUpdate = time;
      const { x, y, width, height } = this.tankRect;
      this.causticSeeds.forEach((seed, i) => {
        this.causticsState[i].x = x + width * (0.5 + Math.sin(time * seed.speed + seed.phaseX) * 0.27);
        this.causticsState[i].y = y + height * (0.33 + Math.cos(time * (seed.speed * 0.92) + seed.phaseY) * 0.18);
        this.causticsState[i].r = Math.max(width, height) * seed.size;
        this.causticsState[i].a = seed.alpha;
      });
    }

    for (const c of this.causticsState) {
      const diameter = c.r * 2;
      ctx.globalAlpha = this.quality === 'high' ? c.a : c.a * 0.55;
      ctx.drawImage(this.causticsSprite, c.x - c.r, c.y - c.r, diameter, diameter);
    }
    ctx.globalAlpha = 1;
  }

  #drawWaterParticles(ctx, delta) {
    if (this.quality === 'low') return;

    const { x, y, width, height } = this.tankRect;
    for (const p of this.waterParticles) {
      p.y -= p.speed * delta;
      if (p.y < y - 4 || p.x < x || p.x > x + width) {
        p.y = y + height + rand(1, 30);
        p.x = x + rand(0, width);
      }

      ctx.beginPath();
      ctx.fillStyle = `rgba(185,229,255,${p.alpha})`;
      ctx.arc(p.x, p.y, p.r, 0, TAU);
      ctx.fill();
    }
  }

  #drawBubbles(ctx) {
    const sx = this.tankRect.width / this.world.bounds.width;
    const sy = this.tankRect.height / this.world.bounds.height;

    for (const b of this.world.bubbles) {
      const bx = this.tankRect.x + b.x * sx;
      const by = this.tankRect.y + b.y * sy;

      ctx.beginPath();
      ctx.strokeStyle = 'rgba(196,236,255,0.38)';
      ctx.fillStyle = 'rgba(175,220,248,0.1)';
      ctx.lineWidth = 1;
      ctx.arc(bx, by, b.radius, 0, TAU);
      ctx.fill();
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

  #drawFish(ctx, fish, position, time) {
    const heading = fish.heading();
    const bodyLength = fish.size * 1.32;
    const bodyHeight = fish.size * 0.73;
    const tailWag = Math.sin(time * 0.004 + position.x * 0.008) * fish.size * 0.13;

    const tint = Math.sin((fish.colorHue + fish.size) * 0.14) * 3;
    const light = 53 + Math.sin(fish.size * 0.33) * 4;

    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(heading);

    const bodyPath = new Path2D();
    bodyPath.ellipse(0, 0, bodyLength * 0.5, bodyHeight * 0.5, 0, 0, TAU);

    const body = ctx.createLinearGradient(-bodyLength * 0.5, 0, bodyLength * 0.5, 0);
    body.addColorStop(0, `hsl(${fish.colorHue + tint + 4}deg 58% ${light + 7}%)`);
    body.addColorStop(0.6, `hsl(${fish.colorHue + tint}deg 52% ${light}%)`);
    body.addColorStop(1, `hsl(${fish.colorHue + tint - 5}deg 48% ${light - 8}%)`);

    ctx.fillStyle = body;
    ctx.fill(bodyPath);

    ctx.save();
    ctx.clip(bodyPath);
    this.#drawFishTexture(ctx, bodyLength, bodyHeight, fish);
    ctx.restore();

    ctx.lineWidth = 0.8;
    ctx.strokeStyle = 'rgba(205, 230, 245, 0.14)';
    ctx.stroke(bodyPath);

    ctx.fillStyle = `hsl(${fish.colorHue + tint - 7}deg 42% ${light - 12}%)`;
    ctx.beginPath();
    ctx.moveTo(-bodyLength * 0.52, 0);
    ctx.lineTo(-bodyLength * 0.84, bodyHeight * 0.35 + tailWag);
    ctx.lineTo(-bodyLength * 0.84, -bodyHeight * 0.35 - tailWag);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.7)';
    ctx.beginPath();
    ctx.arc(bodyLength * 0.22, -bodyHeight * 0.12, fish.size * 0.07, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#0c1f2f';
    ctx.beginPath();
    ctx.arc(bodyLength * 0.24, -bodyHeight * 0.12, fish.size * 0.034, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  #drawFishTexture(ctx, bodyLength, bodyHeight, fish) {
    const seed = Math.sin(fish.size * 1.7 + fish.colorHue * 0.1) * 0.5 + 0.5;

    ctx.globalAlpha = this.quality === 'high' ? 0.1 : 0.05;
    ctx.strokeStyle = 'rgba(255,255,255,0.78)';
    ctx.lineWidth = 1;

    for (let i = 0; i < 4; i += 1) {
      const t = i / 3;
      const y = (t - 0.5) * bodyHeight * 0.84;
      const wave = Math.sin(seed * 9 + i * 1.6) * bodyLength * 0.03;
      ctx.beginPath();
      ctx.moveTo(-bodyLength * 0.3, y);
      ctx.quadraticCurveTo(0, y + wave, bodyLength * 0.34, y * 0.72);
      ctx.stroke();
    }

    if (this.quality === 'high') {
      ctx.globalAlpha = 0.07;
      for (let i = 0; i < 6; i += 1) {
        ctx.fillStyle = 'rgba(255,255,255,0.5)';
        ctx.fillRect(rand(-bodyLength * 0.35, bodyLength * 0.32), rand(-bodyHeight * 0.3, bodyHeight * 0.3), 1, 1);
      }
    }

    ctx.globalAlpha = 1;
  }

  #drawCachedVignette(ctx) {
    const { x, y } = this.tankRect;
    ctx.drawImage(this.vignetteCanvas, x, y);
  }

  #drawCachedGrain(ctx, time) {
    if (this.quality === 'low') return;
    const { x, y } = this.tankRect;
    const shiftX = ((time * 0.02) % 4) | 0;
    const shiftY = ((time * 0.017) % 4) | 0;

    ctx.globalAlpha = 0.045;
    ctx.drawImage(this.grainCanvas, x + shiftX - 2, y + shiftY - 2);
    ctx.globalAlpha = 1;
  }

  #drawInnerEdge(ctx) {
    const { x, y, width, height } = this.tankRect;
    const edge = ctx.createLinearGradient(x, y, x + width, y + height);
    edge.addColorStop(0, 'rgba(0,0,0,0.11)');
    edge.addColorStop(0.25, 'rgba(0,0,0,0)');
    edge.addColorStop(0.75, 'rgba(0,0,0,0)');
    edge.addColorStop(1, 'rgba(0,0,0,0.16)');
    ctx.fillStyle = edge;
    ctx.fillRect(x, y, width, height);
  }

  #drawGlassSheen(ctx, time) {
    const { x, y, width, height } = this.tankRect;
    const drift = Math.sin(time * 0.0002) * width * 0.018;

    const sheen = ctx.createLinearGradient(x + width * 0.52 + drift, y, x + width + drift, y + height * 0.76);
    sheen.addColorStop(0, 'rgba(255,255,255,0.14)');
    sheen.addColorStop(0.34, 'rgba(255,255,255,0.035)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.save();
    this.#clipTankWater(ctx);
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }

  #drawTankFrame(ctx) {
    const { x, y, width, height } = this.tankRect;

    ctx.strokeStyle = 'rgba(224, 241, 255, 0.31)';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

    ctx.strokeStyle = 'rgba(255,255,255,0.11)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, width - 4, height - 4);
  }
}
