/**
 * Fish entity model.
 * Responsibility: local steering, smooth speed changes, and safe movement bounds.
 */

const MAX_TILT = Math.PI / 3;
const MAX_TURN_RATE = (120 * Math.PI) / 180;

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const wrapAngle = (angle) => {
  let a = angle;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
};

export class Fish {
  constructor(bounds, options = {}) {
    this.bounds = bounds;
    this.size = options.size ?? rand(14, 30);

    this.position = { x: rand(0, bounds.width), y: rand(0, bounds.height) };
    this.velocity = { x: rand(-20, 20), y: rand(-8, 8) };
    this.target = this.#randomTarget();

    this.baseSpeed = options.baseSpeed ?? rand(35, 95);
    this.currentSpeed = this.baseSpeed * 0.65;
    this.speedEase = rand(0.6, 1.15);

    this.colorHue = options.colorHue ?? rand(12, 38);
    this.turnRate = rand(1.8, 3.2);
    this.wanderTimer = 0;

    this.renderTilt = 0;
    this.renderFacing = this.velocity.x < 0 ? -1 : 1;
  }

  #steeringMargin() {
    const base = Math.min(this.bounds.width, this.bounds.height) * 0.03;
    return clamp(base, 10, 20);
  }

  #randomTarget() {
    const margin = this.#steeringMargin();
    return {
      x: rand(margin, Math.max(margin, this.bounds.width - margin)),
      y: rand(margin, Math.max(margin, this.bounds.height - margin))
    };
  }

  setBounds(bounds) {
    this.bounds = bounds;
    const margin = this.#steeringMargin();
    this.target.x = clamp(this.target.x, margin, Math.max(margin, bounds.width - margin));
    this.target.y = clamp(this.target.y, margin, Math.max(margin, bounds.height - margin));
  }

  update(delta) {
    this.wanderTimer -= delta;
    if (this.wanderTimer <= 0 || this.#distanceToTarget() < 24) {
      this.target = this.#randomTarget();
      this.wanderTimer = rand(1.8, 4.6);
    }

    const desired = this.#desiredDirection();
    this.#steerVelocityToward(desired, delta);

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
      x: towardTarget.x * 0.9 + wallForce.x,
      y: towardTarget.y * 0.9 + wallForce.y
    };

    const cMag = Math.hypot(combined.x, combined.y) || 1;
    const clamped = this.#clampDirectionToTilt({ x: combined.x / cMag, y: combined.y / cMag });
    return clamped;
  }

  #clampDirectionToTilt(direction) {
    const rawAngle = Math.atan2(direction.y, direction.x);
    const facing = Math.cos(rawAngle) < 0 ? -1 : 1;

    const rawTilt = facing === 1 ? rawAngle : Math.PI - rawAngle;
    const clampedTilt = clamp(wrapAngle(rawTilt), -MAX_TILT, MAX_TILT);
    const angle = facing === 1 ? clampedTilt : Math.PI - clampedTilt;

    return { x: Math.cos(angle), y: Math.sin(angle) };
  }

  #steerVelocityToward(desiredDirection, delta) {
    const currentAngle = Math.atan2(this.velocity.y, this.velocity.x);
    const targetAngle = Math.atan2(desiredDirection.y, desiredDirection.x);
    const angleDelta = wrapAngle(targetAngle - currentAngle);

    const maxStep = MAX_TURN_RATE * delta;
    const limitedDelta = clamp(angleDelta, -maxStep, maxStep);
    const nextAngle = currentAngle + limitedDelta;

    const steerBlend = Math.min(1, delta * this.turnRate);
    const angle = currentAngle + (nextAngle - currentAngle) * steerBlend;
    const constrained = this.#clampDirectionToTilt({ x: Math.cos(angle), y: Math.sin(angle) });

    this.velocity.x = constrained.x;
    this.velocity.y = constrained.y;
  }

  #wallForce() {
    const margin = this.#steeringMargin();
    const influence = margin * 1.25;
    const push = { x: 0, y: 0 };
    const rightGap = this.bounds.width - this.position.x;
    const bottomGap = this.bounds.height - this.position.y;

    if (this.position.x < influence) push.x += ((influence - this.position.x) / influence) * 0.6;
    if (rightGap < influence) push.x -= ((influence - rightGap) / influence) * 0.6;
    if (this.position.y < influence) push.y += ((influence - this.position.y) / influence) * 0.6;
    if (bottomGap < influence) push.y -= ((influence - bottomGap) / influence) * 0.6;

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

  // Backward-compat shim: older builds called this private method from update().
  // Keeping it declared prevents Safari parse/runtime failures if stale call-sites exist.
  #updateRenderOrientation(_delta) {}

  heading() {
    const angle = Math.atan2(this.velocity.y, this.velocity.x);
    const facing = Math.cos(angle) < 0 ? -1 : 1;
    const tilt = clamp(wrapAngle(facing === 1 ? angle : Math.PI - angle), -MAX_TILT, MAX_TILT);

    return { tilt, facing };
  }

  debugMovementBounds() {
    const margin = this.#steeringMargin();
    return {
      x: margin,
      y: margin,
      width: Math.max(0, this.bounds.width - margin * 2),
      height: Math.max(0, this.bounds.height - margin * 2)
    };
  }

  #distanceToTarget() {
    return Math.hypot(this.target.x - this.position.x, this.target.y - this.position.y);
  }
}
