/**
 * Fish entity model.
 * Responsibility: local steering, smooth speed changes, and safe movement bounds.
 */

const MAX_TILT = Math.PI / 3;

const rand = (min, max) => min + Math.random() * (max - min);

export class Fish {
  constructor(bounds, options = {}) {
    this.bounds = bounds;
    this.position = { x: rand(0, bounds.width), y: rand(0, bounds.height) };
    this.velocity = { x: rand(-20, 20), y: rand(-8, 8) };
    this.target = this.#randomTarget();

    this.size = options.size ?? rand(14, 30);
    this.baseSpeed = options.baseSpeed ?? rand(35, 95);
    this.currentSpeed = this.baseSpeed * 0.65;
    this.speedEase = rand(0.6, 1.15);

    this.colorHue = options.colorHue ?? rand(12, 38);
    this.turnRate = rand(1.8, 3.2);
    this.wanderTimer = 0;

    this.renderTilt = 0;
    this.renderFacing = this.velocity.x < 0 ? -1 : 1;
  }

  #randomTarget() {
    return {
      x: rand(50, Math.max(50, this.bounds.width - 50)),
      y: rand(50, Math.max(50, this.bounds.height - 50))
    };
  }

  setBounds(bounds) {
    this.bounds = bounds;
    this.target.x = Math.min(Math.max(this.target.x, 0), bounds.width);
    this.target.y = Math.min(Math.max(this.target.y, 0), bounds.height);
  }

  update(delta) {
    this.wanderTimer -= delta;
    if (this.wanderTimer <= 0 || this.#distanceToTarget() < 24) {
      this.target = this.#randomTarget();
      this.wanderTimer = rand(1.8, 4.6);
    }

    const desired = this.#desiredDirection();
    this.velocity.x += (desired.x - this.velocity.x) * Math.min(1, delta * this.turnRate);
    this.velocity.y += (desired.y - this.velocity.y) * Math.min(1, delta * this.turnRate);

    const targetSpeed = this.baseSpeed * rand(0.9, 1.08);
    this.currentSpeed += (targetSpeed - this.currentSpeed) * Math.min(1, delta * this.speedEase);

    const mag = Math.hypot(this.velocity.x, this.velocity.y) || 1;
    const nx = this.velocity.x / mag;
    const ny = this.velocity.y / mag;

    this.position.x += nx * this.currentSpeed * delta;
    this.position.y += ny * this.currentSpeed * delta;

    this.#avoidWalls();
    this.#updateRenderOrientation(delta);
  }

  #desiredDirection() {
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const distance = Math.hypot(dx, dy) || 1;

    const towardTarget = { x: dx / distance, y: dy / distance };
    const wallForce = this.#wallForce();

    const combined = {
      x: towardTarget.x * 0.85 + wallForce.x,
      y: towardTarget.y * 0.85 + wallForce.y
    };

    const cMag = Math.hypot(combined.x, combined.y) || 1;
    return { x: combined.x / cMag, y: combined.y / cMag };
  }

  #wallForce() {
    const margin = 70;
    const push = { x: 0, y: 0 };
    const rightGap = this.bounds.width - this.position.x;
    const bottomGap = this.bounds.height - this.position.y;

    if (this.position.x < margin) push.x += (margin - this.position.x) / margin;
    if (rightGap < margin) push.x -= (margin - rightGap) / margin;
    if (this.position.y < margin) push.y += (margin - this.position.y) / margin;
    if (bottomGap < margin) push.y -= (margin - bottomGap) / margin;

    return push;
  }

  #avoidWalls() {
    const radius = this.size * 0.5;

    if (this.position.x < radius) {
      this.position.x = radius;
      this.velocity.x = Math.abs(this.velocity.x);
    } else if (this.position.x > this.bounds.width - radius) {
      this.position.x = this.bounds.width - radius;
      this.velocity.x = -Math.abs(this.velocity.x);
    }

    if (this.position.y < radius) {
      this.position.y = radius;
      this.velocity.y = Math.abs(this.velocity.y);
    } else if (this.position.y > this.bounds.height - radius) {
      this.position.y = this.bounds.height - radius;
      this.velocity.y = -Math.abs(this.velocity.y);
    }
  }

  heading() {
    return {
      tilt: this.renderTilt,
      facing: this.renderFacing
    };
  }

  #updateRenderOrientation(delta) {
    if (Math.abs(this.velocity.x) > 0.001) {
      this.renderFacing = this.velocity.x < 0 ? -1 : 1;
    }

    const forwardX = Math.max(0.001, this.velocity.x * this.renderFacing);
    const targetTilt = Math.max(-MAX_TILT, Math.min(MAX_TILT, Math.atan2(this.velocity.y, forwardX)));
    const easing = Math.min(1, delta * 7);
    this.renderTilt += (targetTilt - this.renderTilt) * easing;
  }

  #distanceToTarget() {
    return Math.hypot(this.target.x - this.position.x, this.target.y - this.position.y);
  }
}
