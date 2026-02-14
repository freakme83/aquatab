/**
 * Fish entity model.
 * Responsibility: local steering, smooth speed changes, and safe movement bounds.
 */

const MAX_TILT = Math.PI / 3;
const MAX_TURN_RATE = (120 * Math.PI) / 180;
const TARGET_REACH_DISTANCE = 20;
const DEBUG_FISH = typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('debugFish') === '1';

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

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

const constrainedHeading = (angle) => {
  const facing = Math.cos(angle) < 0 ? -1 : 1;
  const tilt = facing > 0 ? wrapAngle(angle) : wrapAngle(Math.PI - angle);
  const clampedTilt = clamp(tilt, -MAX_TILT, MAX_TILT);
  return facing > 0 ? clampedTilt : Math.PI - clampedTilt;
};

const headingFromFacingAndTilt = (facing, tilt) => (facing < 0 ? Math.PI - tilt : tilt);

export class Fish {
  constructor(bounds, options = {}) {
    this.id = nextFishId += 1;
    this.bounds = bounds;

    this.size = options.size ?? rand(14, 30);

    const margin = this.#movementMargin();
    this.position = options.position ?? {
      x: rand(margin, Math.max(margin, bounds.width - margin)),
      y: rand(margin, Math.max(margin, bounds.height - margin))
    };

    this.headingAngle = constrainedHeading(options.headingAngle ?? this.#randomHeading());
    this.desiredAngle = this.headingAngle;

    this.target = options.target ?? this.#randomTarget();

    this.baseSpeed = options.baseSpeed ?? rand(35, 95);
    const speedFactor = options.speedFactor ?? rand(0.56, 0.86);
    this.currentSpeed = this.baseSpeed * speedFactor;
    this.speedEase = rand(0.6, 1.15);

    this.turnRate = rand(1.8, 3.2);
    this.wanderTimer = rand(1.4, 3.6);
    this.wanderPhase = rand(0, Math.PI * 2);
    this.wanderFrequency = rand(0.35, 0.8);
    this.wanderAmplitude = rand(0.06, 0.16);

    this.colorHue = options.colorHue ?? rand(12, 38);

    this.debugLogCooldown = 0;
  }

  #movementMargin() {
    const base = Math.min(this.bounds.width, this.bounds.height) * 0.03;
    return clamp(base, 10, 20);
  }

  #randomHeading() {
    const facing = Math.random() < 0.5 ? -1 : 1;
    const tilt = rand(-MAX_TILT, MAX_TILT);
    return headingFromFacingAndTilt(facing, tilt);
  }

  #randomTarget() {
    const margin = this.#movementMargin();
    return {
      x: rand(margin, Math.max(margin, this.bounds.width - margin)),
      y: rand(margin, Math.max(margin, this.bounds.height - margin))
    };
  }

  setBounds(bounds) {
    this.bounds = bounds;

    const margin = this.#movementMargin();
    this.position.x = clamp(this.position.x, margin, Math.max(margin, bounds.width - margin));
    this.position.y = clamp(this.position.y, margin, Math.max(margin, bounds.height - margin));
    this.target.x = clamp(this.target.x, margin, Math.max(margin, bounds.width - margin));
    this.target.y = clamp(this.target.y, margin, Math.max(margin, bounds.height - margin));
  }

  update(delta) {
    this.wanderTimer -= delta;
    if (this.wanderTimer <= 0 || this.#distanceToTarget() < TARGET_REACH_DISTANCE) {
      this.target = this.#randomTarget();
      this.wanderTimer = rand(2.5, 6.0);
    }

    this.desiredAngle = this.#computeDesiredHeading(delta);

    const turnStep = MAX_TURN_RATE * delta;
    const turnTarget = moveTowardsAngle(this.headingAngle, this.desiredAngle, turnStep);
    const blend = Math.min(1, delta * this.turnRate);
    this.headingAngle = constrainedHeading(this.headingAngle + wrapAngle(turnTarget - this.headingAngle) * blend);

    const targetSpeed = this.baseSpeed * rand(0.9, 1.08);
    this.currentSpeed += (targetSpeed - this.currentSpeed) * Math.min(1, delta * this.speedEase);

    const dirX = Math.cos(this.headingAngle);
    const dirY = Math.sin(this.headingAngle);
    const maxTravel = this.currentSpeed * delta;
    const travel = this.#distanceBeforeBoundaryHit(dirX, dirY, maxTravel);

    this.position.x += dirX * travel;
    this.position.y += dirY * travel;

    this.#clampInsideBounds();
    this.#debugLog(delta);
  }

  #computeDesiredHeading(delta) {
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const distance = Math.hypot(dx, dy) || 1;

    const towardTarget = { x: dx / distance, y: dy / distance };
    const wallForce = this.#wallForce();

    const steerX = towardTarget.x * 0.95 + wallForce.x;
    const steerY = towardTarget.y * 0.95 + wallForce.y;
    const steerMag = Math.hypot(steerX, steerY) || 1;

    this.wanderPhase += delta * this.wanderFrequency;
    const wanderOffset = Math.sin(this.wanderPhase) * this.wanderAmplitude;

    return constrainedHeading(Math.atan2(steerY / steerMag, steerX / steerMag) + wanderOffset);
  }

  #wallForce() {
    const margin = this.#movementMargin();
    const influence = margin * 1.05;
    const strength = 0.45;

    const leftGap = this.position.x;
    const rightGap = this.bounds.width - this.position.x;
    const topGap = this.position.y;
    const bottomGap = this.bounds.height - this.position.y;

    const force = { x: 0, y: 0 };

    if (leftGap < influence) force.x += ((influence - leftGap) / influence) * strength;
    if (rightGap < influence) force.x -= ((influence - rightGap) / influence) * strength;
    if (topGap < influence) force.y += ((influence - topGap) / influence) * strength;
    if (bottomGap < influence) force.y -= ((influence - bottomGap) / influence) * strength;

    return force;
  }

  #distanceBeforeBoundaryHit(dirX, dirY, maxDistance) {
    const radius = this.size * 0.5;
    const minX = radius;
    const maxX = this.bounds.width - radius;
    const minY = radius;
    const maxY = this.bounds.height - radius;

    let distance = maxDistance;

    if (dirX > 0) distance = Math.min(distance, (maxX - this.position.x) / dirX);
    if (dirX < 0) distance = Math.min(distance, (minX - this.position.x) / dirX);
    if (dirY > 0) distance = Math.min(distance, (maxY - this.position.y) / dirY);
    if (dirY < 0) distance = Math.min(distance, (minY - this.position.y) / dirY);

    return Math.max(0, distance);
  }

  #clampInsideBounds() {
    const radius = this.size * 0.5;
    this.position.x = clamp(this.position.x, radius, this.bounds.width - radius);
    this.position.y = clamp(this.position.y, radius, this.bounds.height - radius);
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
    const margin = this.#movementMargin();
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
