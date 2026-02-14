/**
 * Fish entity model.
 * Responsibility: local steering, smooth speed changes, and safe movement bounds.
 */

const MAX_TILT = Math.PI / 3;
const MAX_TURN_RATE = (120 * Math.PI) / 180;
const WANDER_MAX_OFFSET = 0.18;
const DEBUG_FISH = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugFish') === '1';

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));

let nextFishId = 1;

const wrapAngle = (angle) => {
  let a = angle;
  while (a <= -Math.PI) a += Math.PI * 2;
  while (a > Math.PI) a -= Math.PI * 2;
  return a;
};

const moveTowardsAngle = (current, target, maxStep) => {
  const delta = wrapAngle(target - current);
  if (Math.abs(delta) <= maxStep) return target;
  return current + Math.sign(delta) * maxStep;
};

const constrainedHeadingFrom = (angle) => {
  const facing = Math.cos(angle) < 0 ? -1 : 1;
  const tilt = facing === 1 ? wrapAngle(angle) : wrapAngle(Math.PI - angle);
  const clampedTilt = clamp(tilt, -MAX_TILT, MAX_TILT);
  return facing === 1 ? clampedTilt : Math.PI - clampedTilt;
};

const headingFromTiltAndFacing = (tilt, facing) => (facing < 0 ? Math.PI - tilt : tilt);

export class Fish {
  constructor(bounds, options = {}) {
    this.id = nextFishId += 1;
    this.bounds = bounds;
    this.size = options.size ?? rand(14, 30);

    const margin = this.#steeringMargin();
    this.position = options.position ?? {
      x: rand(margin, Math.max(margin, bounds.width - margin)),
      y: rand(margin, Math.max(margin, bounds.height - margin))
    };

    const initialHeading = options.headingAngle ?? this.#randomConstrainedHeading();
    this.headingAngle = constrainedHeadingFrom(initialHeading);
    this.desiredAngle = this.headingAngle;

    this.target = options.target ?? this.#randomTarget();

    this.baseSpeed = options.baseSpeed ?? rand(35, 95);
    const speedFactor = options.speedFactor ?? rand(0.56, 0.86);
    this.currentSpeed = this.baseSpeed * speedFactor;
    this.speedEase = rand(0.6, 1.15);

    this.colorHue = options.colorHue ?? rand(12, 38);
    this.turnRate = rand(1.8, 3.2);
    this.wanderTimer = rand(1.2, 3.4);
    this.wanderPhase = rand(0, Math.PI * 2);
    this.wanderFrequency = rand(0.35, 0.85);
    this.debugLogCooldown = 0;
  }

  #steeringMargin() {
    const base = Math.min(this.bounds.width, this.bounds.height) * 0.03;
    return clamp(base, 10, 20);
  }

  #randomConstrainedHeading() {
    const facing = Math.random() < 0.5 ? -1 : 1;
    const tilt = rand(-MAX_TILT, MAX_TILT);
    return headingFromTiltAndFacing(tilt, facing);
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
    this.position.x = clamp(this.position.x, margin, Math.max(margin, bounds.width - margin));
    this.position.y = clamp(this.position.y, margin, Math.max(margin, bounds.height - margin));
    this.target.x = clamp(this.target.x, margin, Math.max(margin, bounds.width - margin));
    this.target.y = clamp(this.target.y, margin, Math.max(margin, bounds.height - margin));
  }

  update(delta) {
    this.wanderTimer -= delta;
    if (this.wanderTimer <= 0 || this.#distanceToTarget() < 20) {
      this.target = this.#randomTarget();
      this.wanderTimer = rand(2.5, 6.0);
    }

    this.desiredAngle = this.#desiredHeading(delta);

    const maxStep = MAX_TURN_RATE * delta;
    const steered = moveTowardsAngle(this.headingAngle, this.desiredAngle, maxStep);
    const blend = Math.min(1, delta * this.turnRate);
    this.headingAngle = constrainedHeadingFrom(this.headingAngle + wrapAngle(steered - this.headingAngle) * blend);

    const targetSpeed = this.baseSpeed * rand(0.9, 1.08);
    this.currentSpeed += (targetSpeed - this.currentSpeed) * Math.min(1, delta * this.speedEase);

    const nx = Math.cos(this.headingAngle);
    const ny = Math.sin(this.headingAngle);

    const maxDistance = this.currentSpeed * delta;
    const travel = this.#distanceToBoundaryAlong(nx, ny, maxDistance);
    this.position.x += nx * travel;
    this.position.y += ny * travel;

    this.#avoidWalls();
    this.#debugLog(delta);
  }

  #desiredHeading(delta) {
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const distance = Math.hypot(dx, dy) || 1;

    const towardTarget = { x: dx / distance, y: dy / distance };
    const wallForce = this.#wallForce();

    const combined = {
      x: towardTarget.x * 0.95 + wallForce.x,
      y: towardTarget.y * 0.95 + wallForce.y
    };
    const cMag = Math.hypot(combined.x, combined.y) || 1;

    this.wanderPhase += delta * this.wanderFrequency;
    const wanderOffset = Math.sin(this.wanderPhase) * WANDER_MAX_OFFSET;

    const rawAngle = Math.atan2(combined.y / cMag, combined.x / cMag) + wanderOffset;
    return constrainedHeadingFrom(rawAngle);
  }


  #distanceToBoundaryAlong(nx, ny, maxDistance) {
    const radius = this.size * 0.5;
    const minX = radius;
    const maxX = this.bounds.width - radius;
    const minY = radius;
    const maxY = this.bounds.height - radius;

    let distance = maxDistance;

    if (nx > 0) distance = Math.min(distance, (maxX - this.position.x) / nx);
    if (nx < 0) distance = Math.min(distance, (minX - this.position.x) / nx);
    if (ny > 0) distance = Math.min(distance, (maxY - this.position.y) / ny);
    if (ny < 0) distance = Math.min(distance, (minY - this.position.y) / ny);

    return Math.max(0, distance);
  }

  #wallForce() {
    const margin = this.#steeringMargin();
    const influence = margin * 1.05;
    const strength = 0.45;
    const push = { x: 0, y: 0 };

    const leftGap = this.position.x;
    const rightGap = this.bounds.width - this.position.x;
    const topGap = this.position.y;
    const bottomGap = this.bounds.height - this.position.y;

    if (leftGap < influence) push.x += ((influence - leftGap) / influence) * strength;
    if (rightGap < influence) push.x -= ((influence - rightGap) / influence) * strength;
    if (topGap < influence) push.y += ((influence - topGap) / influence) * strength;
    if (bottomGap < influence) push.y -= ((influence - bottomGap) / influence) * strength;

    return push;
  }

  #avoidWalls() {
    const radius = this.size * 0.5;

    if (this.position.x < radius) {
      this.position.x = radius;
    } else if (this.position.x > this.bounds.width - radius) {
      this.position.x = this.bounds.width - radius;
    }

    if (this.position.y < radius) {
      this.position.y = radius;
    } else if (this.position.y > this.bounds.height - radius) {
      this.position.y = this.bounds.height - radius;
    }
  }

  #debugLog(delta) {
    if (!DEBUG_FISH || this.id !== 1) return;
    this.debugLogCooldown -= delta;
    if (this.debugLogCooldown > 0) return;
    this.debugLogCooldown = 0.6;

    // eslint-disable-next-line no-console
    console.debug('[fish-debug]', {
      headingDeg: (this.headingAngle * 180) / Math.PI,
      desiredDeg: (this.desiredAngle * 180) / Math.PI,
      speed: this.currentSpeed,
      target: { ...this.target }
    });
  }

  heading() {
    return this.headingAngle;
  }

  facingSign() {
    return Math.cos(this.headingAngle) < 0 ? -1 : 1;
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
