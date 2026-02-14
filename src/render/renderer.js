/**
 * Canvas renderer.
 * Responsibility: all drawing logic (water, particles, bubbles, fish) decoupled from simulation.
 */

const rand = (min, max) => min + Math.random() * (max - min);

export class Renderer {
  constructor(canvas, world) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d');
    this.world = world;
    this.waterParticles = this.#createParticles(120);
  }

  resize(width, height) {
    this.canvas.width = width;
    this.canvas.height = height;
    for (const p of this.waterParticles) {
      p.x = Math.min(width, p.x);
      p.y = Math.min(height, p.y);
    }
  }

  render(time, delta) {
    const ctx = this.ctx;
    const { width, height } = this.world.bounds;

    this.#drawWaterBackground(ctx, width, height);
    this.#drawWaterParticles(ctx, width, height, delta);
    this.#drawBubbles(ctx);

    for (const fish of this.world.fish) this.#drawFish(ctx, fish, time);
  }

  #drawWaterBackground(ctx, w, h) {
    const grad = ctx.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#0a2338');
    grad.addColorStop(0.55, '#09304c');
    grad.addColorStop(1, '#041421');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, w, h);

    const glow = ctx.createRadialGradient(w * 0.78, h * 0.2, 30, w * 0.78, h * 0.2, h * 0.8);
    glow.addColorStop(0, 'rgba(120, 200, 255, 0.18)');
    glow.addColorStop(1, 'rgba(120, 200, 255, 0.01)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);
  }

  #createParticles(count) {
    return Array.from({ length: count }, () => ({
      x: rand(0, this.canvas.width || 1000),
      y: rand(0, this.canvas.height || 700),
      r: rand(0.5, 1.8),
      alpha: rand(0.04, 0.15),
      speed: rand(3, 12)
    }));
  }

  #drawWaterParticles(ctx, w, h, delta) {
    for (const p of this.waterParticles) {
      p.y -= p.speed * delta;
      if (p.y < -2) {
        p.y = h + rand(1, 30);
        p.x = rand(0, w);
      }
      ctx.beginPath();
      ctx.fillStyle = `rgba(180, 230, 255, ${p.alpha})`;
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  #drawBubbles(ctx) {
    for (const b of this.world.bubbles) {
      ctx.beginPath();
      ctx.strokeStyle = 'rgba(190, 235, 255, 0.42)';
      ctx.fillStyle = 'rgba(150, 215, 255, 0.12)';
      ctx.lineWidth = 1;
      ctx.arc(b.x, b.y, b.radius, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
  }

  #drawFish(ctx, fish, time) {
    const heading = fish.heading();
    const { x, y } = fish.position;
    const bodyLength = fish.size * 1.35;
    const bodyHeight = fish.size * 0.75;
    const tailWag = Math.sin(time * 0.005 + x * 0.01) * fish.size * 0.16;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(heading);

    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;

    const bodyGradient = ctx.createLinearGradient(-bodyLength * 0.5, 0, bodyLength * 0.5, 0);
    bodyGradient.addColorStop(0, `hsl(${fish.colorHue + 6}deg 88% 63%)`);
    bodyGradient.addColorStop(1, `hsl(${fish.colorHue - 4}deg 72% 50%)`);

    ctx.fillStyle = bodyGradient;
    ctx.beginPath();
    ctx.ellipse(0, 0, bodyLength * 0.5, bodyHeight * 0.5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.fillStyle = `hsl(${fish.colorHue - 8}deg 60% 40%)`;
    ctx.beginPath();
    ctx.moveTo(-bodyLength * 0.52, 0);
    ctx.lineTo(-bodyLength * 0.86, bodyHeight * 0.4 + tailWag);
    ctx.lineTo(-bodyLength * 0.86, -bodyHeight * 0.4 - tailWag);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.arc(bodyLength * 0.24, -bodyHeight * 0.12, fish.size * 0.075, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#0a1e2f';
    ctx.beginPath();
    ctx.arc(bodyLength * 0.26, -bodyHeight * 0.12, fish.size * 0.038, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }
}
