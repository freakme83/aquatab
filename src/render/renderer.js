/**
 * Canvas renderer.
 * Responsibility: all drawing logic (water, particles, bubbles, fish) decoupled from simulation.
 */

const rand = (min, max) => min + Math.random() * (max - min);
const TAU = Math.PI * 2;

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;

    this.waterParticles = this.#createParticles(120);
    this.tankRect = { x: 0, y: 0, width: 0, height: 0 };

    this.grainPattern = this.#createGrainPattern();
    this.causticSeeds = this.#createCausticSeeds();
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;

    const margin = Math.max(22, Math.min(width, height) * 0.04);
    this.tankRect = {
      x: margin,
      y: margin,
      width: Math.max(100, width - margin * 2),
      height: Math.max(100, height - margin * 2)
    };

    for (const p of this.waterParticles) {
      p.x = Math.min(width, p.x);
      p.y = Math.min(height, p.y);
    }
  }

  render(time, delta) {
    const ctx = this.ctx;
    const { width, height } = this.world.bounds;

    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.#drawOuterBackground(ctx, width, height);

    ctx.save();
    this.#clipToTank(ctx);
    this.#drawWaterBackground(ctx);
    this.#drawCaustics(ctx, time);
    this.#drawWaterParticles(ctx, delta);
    this.#drawBubbles(ctx);
    this.#drawFishSchool(ctx, time);
    ctx.restore();

    this.#drawInnerEdgeDarkening(ctx);
    this.#drawTankFrame(ctx);
    this.#drawGlassReflection(ctx, time);
    this.#drawVignette(ctx);
    this.#drawFilmGrain(ctx);
  }

  #drawOuterBackground(ctx, w, h) {
    const outer = ctx.createLinearGradient(0, 0, 0, h);
    outer.addColorStop(0, '#02070c');
    outer.addColorStop(1, '#01040a');
    ctx.fillStyle = outer;
    ctx.fillRect(0, 0, w, h);
  }

  #clipToTank(ctx) {
    const { x, y, width, height } = this.tankRect;
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
  }

  #drawWaterBackground(ctx) {
    const { x, y, width, height } = this.tankRect;

    const grad = ctx.createLinearGradient(0, y, 0, y + height);
    grad.addColorStop(0, '#102f47');
    grad.addColorStop(0.55, '#0b2a42');
    grad.addColorStop(1, '#061727');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, width, height);

    const softTop = ctx.createRadialGradient(
      x + width * 0.2,
      y + height * 0.02,
      15,
      x + width * 0.2,
      y + height * 0.02,
      width * 0.85
    );
    softTop.addColorStop(0, 'rgba(190, 235, 255, 0.10)');
    softTop.addColorStop(1, 'rgba(160, 220, 255, 0.01)');
    ctx.fillStyle = softTop;
    ctx.fillRect(x, y, width, height);
  }

  #createCausticSeeds() {
    return [
      { phaseX: rand(0, TAU), phaseY: rand(0, TAU), size: 0.42, alpha: 0.05, speed: 0.00013 },
      { phaseX: rand(0, TAU), phaseY: rand(0, TAU), size: 0.34, alpha: 0.045, speed: 0.00016 },
      { phaseX: rand(0, TAU), phaseY: rand(0, TAU), size: 0.38, alpha: 0.035, speed: 0.00011 }
    ];
  }

  #drawCaustics(ctx, time) {
    const { x, y, width, height } = this.tankRect;

    for (const seed of this.causticSeeds) {
      const cx = x + width * (0.5 + Math.sin(time * seed.speed + seed.phaseX) * 0.28);
      const cy = y + height * (0.34 + Math.cos(time * (seed.speed * 0.9) + seed.phaseY) * 0.2);
      const radius = Math.max(width, height) * seed.size;

      const g = ctx.createRadialGradient(cx, cy, radius * 0.12, cx, cy, radius);
      g.addColorStop(0, `rgba(195, 232, 255, ${seed.alpha})`);
      g.addColorStop(1, 'rgba(195, 232, 255, 0)');
      ctx.fillStyle = g;
      ctx.fillRect(x, y, width, height);
    }
  }

  #createParticles(count) {
    return Array.from({ length: count }, () => ({
      x: rand(0, this.canvas.width || 1000),
      y: rand(0, this.canvas.height || 700),
      r: rand(0.4, 1.6),
      alpha: rand(0.035, 0.12),
      speed: rand(3, 12)
    }));
  }

  #drawWaterParticles(ctx, delta) {
    const { x, y, width, height } = this.tankRect;

    for (const p of this.waterParticles) {
      p.y -= p.speed * delta;
      if (p.y < y - 2 || p.x < x || p.x > x + width) {
        p.y = y + height + rand(1, 30);
        p.x = x + rand(0, width);
      }
      ctx.beginPath();
      ctx.fillStyle = `rgba(180, 230, 255, ${p.alpha})`;
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
      ctx.strokeStyle = 'rgba(190, 235, 255, 0.36)';
      ctx.fillStyle = 'rgba(170, 220, 250, 0.10)';
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
      const renderFish = {
        ...fish,
        position: {
          x: this.tankRect.x + fish.position.x * sx,
          y: this.tankRect.y + fish.position.y * sy
        }
      };
      this.#drawFish(ctx, renderFish, time);
    }
  }

  #drawFish(ctx, fish, time) {
    const heading = fish.heading();
    const { x, y } = fish.position;
    const bodyLength = fish.size * 1.32;
    const bodyHeight = fish.size * 0.74;
    const tailWag = Math.sin(time * 0.004 + x * 0.008) * fish.size * 0.14;
    const tint = Math.sin((fish.colorHue + fish.size) * 0.15) * 3;
    const brightness = 54 + Math.sin(fish.size * 0.35) * 4;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);

    ctx.shadowColor = 'rgba(0,0,0,0.16)';
    ctx.shadowBlur = 6;
    ctx.shadowOffsetY = 1.5;

    const bodyGradient = ctx.createLinearGradient(-bodyLength * 0.48, 0, bodyLength * 0.52, 0);
    bodyGradient.addColorStop(0, `hsl(${fish.colorHue + tint + 4}deg 63% ${brightness + 6}%)`);
    bodyGradient.addColorStop(0.55, `hsl(${fish.colorHue + tint}deg 56% ${brightness}%)`);
    bodyGradient.addColorStop(1, `hsl(${fish.colorHue + tint - 5}deg 52% ${brightness - 8}%)`);

    const bodyPath = new Path2D();
    bodyPath.ellipse(0, 0, bodyLength * 0.5, bodyHeight * 0.5, 0, 0, TAU);

    ctx.fillStyle = bodyGradient;
    ctx.fill(bodyPath);

    ctx.save();
    ctx.clip(bodyPath);
    this.#drawFishTexture(ctx, bodyLength, bodyHeight, fish);
    ctx.restore();

    ctx.shadowBlur = 0;
    ctx.fillStyle = `hsl(${fish.colorHue + tint - 6}deg 46% ${brightness - 12}%)`;
    ctx.beginPath();
    ctx.moveTo(-bodyLength * 0.52, 0);
    ctx.lineTo(-bodyLength * 0.84, bodyHeight * 0.36 + tailWag);
    ctx.lineTo(-bodyLength * 0.84, -bodyHeight * 0.36 - tailWag);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.72)';
    ctx.beginPath();
    ctx.arc(bodyLength * 0.22, -bodyHeight * 0.12, fish.size * 0.072, 0, TAU);
    ctx.fill();

    ctx.fillStyle = '#0b1c2a';
    ctx.beginPath();
    ctx.arc(bodyLength * 0.24, -bodyHeight * 0.12, fish.size * 0.035, 0, TAU);
    ctx.fill();

    ctx.restore();
  }

  #drawFishTexture(ctx, bodyLength, bodyHeight, fish) {
    const seed = Math.sin(fish.size * 1.77 + fish.colorHue * 0.1) * 0.5 + 0.5;
    const stripeCount = 4;

    ctx.globalAlpha = 0.08;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 1;

    for (let i = 0; i < stripeCount; i += 1) {
      const t = i / (stripeCount - 1 || 1);
      const yy = (t - 0.5) * bodyHeight * 0.86;
      const wav = Math.sin(seed * 10 + i * 1.8) * bodyLength * 0.03;

      ctx.beginPath();
      ctx.moveTo(-bodyLength * 0.3, yy);
      ctx.quadraticCurveTo(0, yy + wav, bodyLength * 0.34, yy * 0.7);
      ctx.stroke();
    }

    ctx.globalAlpha = 0.07;
    for (let i = 0; i < 8; i += 1) {
      const px = rand(-bodyLength * 0.4, bodyLength * 0.35);
      const py = rand(-bodyHeight * 0.32, bodyHeight * 0.32);
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      ctx.fillRect(px, py, 1, 1);
    }

    ctx.globalAlpha = 1;
  }

  #drawInnerEdgeDarkening(ctx) {
    const { x, y, width, height } = this.tankRect;
    const edge = ctx.createLinearGradient(x, y, x + width, y + height);
    edge.addColorStop(0, 'rgba(0, 0, 0, 0.10)');
    edge.addColorStop(0.2, 'rgba(0, 0, 0, 0.0)');
    edge.addColorStop(0.8, 'rgba(0, 0, 0, 0.0)');
    edge.addColorStop(1, 'rgba(0, 0, 0, 0.14)');
    ctx.fillStyle = edge;
    ctx.fillRect(x, y, width, height);
  }

  #drawTankFrame(ctx) {
    const { x, y, width, height } = this.tankRect;

    ctx.strokeStyle = 'rgba(220, 240, 255, 0.28)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(x + 0.5, y + 0.5, width - 1, height - 1);

    ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
    ctx.lineWidth = 3;
    ctx.strokeRect(x + 2, y + 2, width - 4, height - 4);
  }

  #drawGlassReflection(ctx, time) {
    const { x, y, width, height } = this.tankRect;
    const shift = Math.sin(time * 0.00022) * width * 0.02;

    const sheen = ctx.createLinearGradient(x + width * 0.52 + shift, y, x + width + shift, y + height * 0.76);
    sheen.addColorStop(0, 'rgba(255,255,255,0.11)');
    sheen.addColorStop(0.35, 'rgba(255,255,255,0.03)');
    sheen.addColorStop(1, 'rgba(255,255,255,0)');

    ctx.save();
    this.#clipToTank(ctx);
    ctx.fillStyle = sheen;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }

  #drawVignette(ctx) {
    const { x, y, width, height } = this.tankRect;
    const vg = ctx.createRadialGradient(
      x + width * 0.5,
      y + height * 0.45,
      width * 0.18,
      x + width * 0.5,
      y + height * 0.45,
      width * 0.72
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.14)');

    ctx.save();
    this.#clipToTank(ctx);
    ctx.fillStyle = vg;
    ctx.fillRect(x, y, width, height);
    ctx.restore();
  }

  #createGrainPattern() {
    const noiseCanvas = document.createElement('canvas');
    const size = 96;
    noiseCanvas.width = size;
    noiseCanvas.height = size;

    const nctx = noiseCanvas.getContext('2d');
    const image = nctx.createImageData(size, size);

    for (let i = 0; i < image.data.length; i += 4) {
      const value = Math.floor(rand(95, 165));
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }

    nctx.putImageData(image, 0, 0);
    return this.ctx.createPattern(noiseCanvas, 'repeat');
  }

  #drawFilmGrain(ctx) {
    if (!this.grainPattern) return;

    const { x, y, width, height } = this.tankRect;
    ctx.save();
    this.#clipToTank(ctx);
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = this.grainPattern;
    ctx.translate(rand(-20, 20), rand(-20, 20));
    ctx.fillRect(x - 30, y - 30, width + 60, height + 60);
    ctx.restore();
  }
}
