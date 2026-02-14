/**
 * Canvas renderer.
 * Responsibility: draw-only layers for tank, water ambiance, and fish visuals.
 */

const TAU = Math.PI * 2;
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const BUILD_STAMP = new Date().toISOString();

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.world = world;

    this.dpr = window.devicePixelRatio || 1;
    this.tankRect = { x: 0, y: 0, width: 0, height: 0 };
    this.quality = 'high';
    this.debugBounds = false;

    this.sandPalette = {
      base: '#c3a06a',
      shade: '#b08955',
      highlight: '#d8bb86',
      speck: 'rgba(102, 77, 38, 0.26)'
    };

    this.waterParticles = this.#createParticles(70);

    this.backgroundCanvas = document.createElement('canvas');
    this.vignetteCanvas = document.createElement('canvas');
  }

  setQuality(quality) {
    this.quality = quality;
  }

  setDebugBounds(enabled) {
    this.debugBounds = Boolean(enabled);
  }

  setSandPalette(palette = {}) {
    this.sandPalette = { ...this.sandPalette, ...palette };
    this.#buildStaticLayers();
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

    this.#buildStaticLayers();

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
    this.#drawCachedBackground(ctx);
    this.#drawWaterParticles(ctx, delta);
    this.#drawBubbles(ctx);
    this.#drawFishSchool(ctx, time);
    this.#drawCachedVignette(ctx);
    this.#drawRuntimeStamp(ctx);
    ctx.restore();

    this.#drawTankFrame(ctx);
    if (this.debugBounds) this.#drawDebugBounds(ctx);
  }

  #createParticles(count) {
    return Array.from({ length: count }, () => ({
      x: rand(0, this.canvas.width || 900),
      y: rand(0, this.canvas.height || 640),
      r: rand(0.4, 1.3),
      alpha: rand(0.03, 0.09),
      speed: rand(3, 9)
    }));
  }

  #buildStaticLayers() {
    const w = Math.max(1, Math.floor(this.tankRect.width));
    const h = Math.max(1, Math.floor(this.tankRect.height));

    this.backgroundCanvas.width = w;
    this.backgroundCanvas.height = h;
    const bctx = this.backgroundCanvas.getContext('2d');
    const bg = bctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#0f3550');
    bg.addColorStop(0.5, '#0a2a42');
    bg.addColorStop(1, '#061a2c');
    bctx.fillStyle = bg;
    bctx.fillRect(0, 0, w, h);

    this.#drawSandLayer(bctx, w, h);

    this.vignetteCanvas.width = w;
    this.vignetteCanvas.height = h;
    const vctx = this.vignetteCanvas.getContext('2d');
    const v = vctx.createRadialGradient(w * 0.5, h * 0.48, w * 0.24, w * 0.5, h * 0.48, w * 0.75);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.11)');
    vctx.clearRect(0, 0, w, h);
    vctx.fillStyle = v;
    vctx.fillRect(0, 0, w, h);
  }

  #sandHeightPixels() {
    const worldHeight = Math.max(1, this.world.bounds.height);
    const sandHeight = Math.max(0, this.world.bounds.sandHeight || 0);
    return (sandHeight / worldHeight) * this.tankRect.height;
  }

  #drawSandLayer(ctx, width, height) {
    const sandHeight = clamp(this.#sandHeightPixels(), 18, height * 0.34);
    const topY = Math.max(0, height - sandHeight);

    const path = new Path2D();
    path.moveTo(0, topY);

    const wave1 = Math.max(3, sandHeight * 0.08);
    const wave2 = Math.max(4, sandHeight * 0.1);
    path.bezierCurveTo(width * 0.2, topY - wave1, width * 0.37, topY + wave2, width * 0.52, topY + wave1);
    path.bezierCurveTo(width * 0.68, topY - wave2, width * 0.84, topY + wave1, width, topY - wave1 * 0.5);
    path.lineTo(width, height);
    path.lineTo(0, height);
    path.closePath();

    const sandGradient = ctx.createLinearGradient(0, topY - 3, 0, height);
    sandGradient.addColorStop(0, this.sandPalette.highlight);
    sandGradient.addColorStop(0.45, this.sandPalette.base);
    sandGradient.addColorStop(1, this.sandPalette.shade);

    ctx.fillStyle = sandGradient;
    ctx.fill(path);

    ctx.strokeStyle = 'rgba(255, 239, 189, 0.22)';
    ctx.lineWidth = 1.2;
    ctx.stroke(path);

    const grains = Math.floor((width * sandHeight) / 1400);
    ctx.fillStyle = this.sandPalette.speck;
    for (let i = 0; i < grains; i += 1) {
      const gx = rand(0, width);
      const gy = rand(topY + 2, height);
      const gr = rand(0.35, 1.1);
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, TAU);
      ctx.fill();
    }
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

  #drawCachedBackground(ctx) {
    const { x, y } = this.tankRect;
    ctx.drawImage(this.backgroundCanvas, x, y);
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
    const orientation = fish.heading();
    const bodyLength = fish.size * 1.32;
    const bodyHeight = fish.size * 0.73;
    const tailWag = Math.sin(time * 0.004 + position.x * 0.008) * fish.size * 0.13;

    const tint = Math.sin((fish.colorHue + fish.size) * 0.14) * 3;
    const light = 54 + Math.sin(fish.size * 0.33) * 4;

    ctx.save();
    ctx.translate(position.x, position.y);
    ctx.rotate(orientation.tilt);
    ctx.scale(orientation.facing, 1);

    const bodyPath = new Path2D();
    bodyPath.ellipse(0, 0, bodyLength * 0.5, bodyHeight * 0.5, 0, 0, TAU);

    ctx.fillStyle = `hsl(${fish.colorHue + tint}deg 52% ${light}%)`;
    ctx.fill(bodyPath);

    if (this.quality === 'high') {
      this.#drawFishTexture(ctx, bodyLength, bodyHeight, fish);
    }

    ctx.lineWidth = 0.7;
    ctx.strokeStyle = 'rgba(205, 230, 245, 0.13)';
    ctx.stroke(bodyPath);

    ctx.fillStyle = `hsl(${fish.colorHue + tint - 8}deg 40% ${light - 12}%)`;
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
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = 'rgba(255,255,255,0.7)';
    ctx.lineWidth = 1;

    for (let i = 0; i < 3; i += 1) {
      const t = i / 2;
      const y = (t - 0.5) * bodyHeight * 0.75;
      const wave = Math.sin(seed * 8 + i * 1.4) * bodyLength * 0.025;
      ctx.beginPath();
      ctx.moveTo(-bodyLength * 0.24, y);
      ctx.quadraticCurveTo(0, y + wave, bodyLength * 0.25, y * 0.72);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  #drawCachedVignette(ctx) {
    const { x, y } = this.tankRect;
    ctx.drawImage(this.vignetteCanvas, x, y);
  }

  #drawRuntimeStamp(ctx) {
    const { x, y } = this.tankRect;
    ctx.font = '600 11px Inter, Segoe UI, sans-serif';
    ctx.fillStyle = 'rgba(230, 245, 255, 0.76)';
    ctx.fillText('RENDERER: CLEAN_BASE v1', x + 10, y + 18);
    ctx.fillText(`BUILD: ${BUILD_STAMP}`, x + 10, y + 34);
  }


  #drawDebugBounds(ctx) {
    const { x, y, width, height } = this.tankRect;

    ctx.save();
    ctx.strokeStyle = 'rgba(255, 209, 102, 0.9)';
    ctx.lineWidth = 1;
    ctx.setLineDash([6, 4]);
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

    const sampleFish = this.world.fish[0];
    if (sampleFish && typeof sampleFish.debugMovementBounds === 'function') {
      const bounds = sampleFish.debugMovementBounds();
      const sx = width / this.world.bounds.width;
      const sy = height / this.world.bounds.height;

      ctx.strokeStyle = 'rgba(123, 255, 182, 0.9)';
      ctx.strokeRect(
        x + bounds.x * sx + 0.5,
        y + bounds.y * sy + 0.5,
        Math.max(0, bounds.width * sx - 1),
        Math.max(0, bounds.height * sy - 1)
      );
    }

    ctx.setLineDash([]);
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
