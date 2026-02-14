const TAU = Math.PI * 2;
const MAX_TILT = Math.PI / 3;
const TARGET_REACHED_RADIUS = 18;
const FACE_SWITCH_COS = 0.2;
const MAX_TURN_RATE = 1.45;
const DESIRED_TURN_RATE = 2.1;
const FISH_BUILD_STAMP = new Date().toISOString();

console.log(`[aquatab] Fish module loaded: ${import.meta.url} | BUILD: ${FISH_BUILD_STAMP}`);

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

function normalizeAngle(angle) {
  let out = angle;
  while (out <= -Math.PI) out += TAU;
  while (out > Math.PI) out -= TAU;
  return out;
}

function shortestAngleDelta(from, to) {
  return normalizeAngle(to - from);
}

function moveTowardsAngle(current, target, maxStep) {
  const delta = shortestAngleDelta(current, target);
  if (Math.abs(delta) <= maxStep) return normalizeAngle(target);
  return normalizeAngle(current + Math.sign(delta) * maxStep);
}

function resolveFacingByCos(angle, previousFacing) {
  const cosValue = Math.cos(angle);
  if (cosValue > FACE_SWITCH_COS) return 1;
  if (cosValue < -FACE_SWITCH_COS) return -1;
  return previousFacing;
}

function clampAngleForFacing(angle, facing) {
  const base = facing === -1 ? Math.PI : 0;
  const relative = normalizeAngle(angle - base);
  return normalizeAngle(base + clamp(relative, -MAX_TILT, MAX_TILT));
}

export class Fish {
  constructor(bounds, options = {}) {
    this.bounds = bounds;

    this.size = options.size ?? rand(14, 30);
    this.colorHue = options.colorHue ?? rand(8, 42);
    this.speedFactor = options.speedFactor ?? rand(0.42, 0.68);

    this.position = options.position
      ? { x: options.position.x, y: options.position.y }
      : { x: bounds.width * 0.5, y: bounds.height * 0.5 };

    this.facing = Math.random() < 0.5 ? -1 : 1;
    const initialHeading = options.headingAngle ?? (this.facing === -1 ? Math.PI : 0);
    this.facing = resolveFacingByCos(initialHeading, this.facing);

    this.headingAngle = clampAngleForFacing(initialHeading, this.facing);
    this.desiredAngle = this.headingAngle;

    this.currentSpeed = this.#baseSpeed() * rand(0.92, 1.04);
    this.cruisePhase = rand(0, TAU);

    this.target = this.#pickTarget();
  }

  setBounds(bounds) {
    this.bounds = bounds;
    const movement = this.#movementBounds();
    this.position.x = clamp(this.position.x, movement.minX, movement.maxX);
    this.position.y = clamp(this.position.y, movement.minY, movement.maxY);
    if (!this.#isTargetInBounds(this.target)) this.target = this.#pickTarget();
  }

  heading() {
    const stableFacing = resolveFacingByCos(this.headingAngle, this.facing);
    this.facing = stableFacing;

    const base = stableFacing === -1 ? Math.PI : 0;
    const localTilt = clamp(normalizeAngle(this.headingAngle - base), -MAX_TILT, MAX_TILT);

    return { tilt: localTilt, facing: stableFacing };
  }

  update(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;

    if (this.#shouldRetarget()) this.target = this.#pickTarget();

    const seek = this.#seekVector();
    const avoidance = this.#wallAvoidanceVector();
    const desiredX = seek.x + avoidance.x;
    const desiredY = seek.y + avoidance.y;

    const rawDesiredAngle = Math.atan2(desiredY, desiredX);
    this.facing = resolveFacingByCos(rawDesiredAngle, this.facing);

    const constrainedDesired = clampAngleForFacing(rawDesiredAngle, this.facing);
    this.desiredAngle = moveTowardsAngle(this.desiredAngle, constrainedDesired, DESIRED_TURN_RATE * dt);
    this.headingAngle = moveTowardsAngle(this.headingAngle, this.desiredAngle, MAX_TURN_RATE * dt);

    this.cruisePhase = normalizeAngle(this.cruisePhase + dt * 0.55);
    const cruiseFactor = 0.88 + Math.sin(this.cruisePhase) * 0.06;
    const desiredSpeed = this.#baseSpeed() * cruiseFactor;
    this.currentSpeed += (desiredSpeed - this.currentSpeed) * Math.min(1, dt * 0.9);

    this.position.x += Math.cos(this.headingAngle) * this.currentSpeed * dt;
    this.position.y += Math.sin(this.headingAngle) * this.currentSpeed * dt;

    this.#resolveCollisions();
  }

  debugMovementBounds() {
    const movement = this.#movementBounds();
    return {
      x: movement.minX,
      y: movement.minY,
      width: movement.maxX - movement.minX,
      height: movement.maxY - movement.minY
    };
  }

  #baseSpeed() {
    return 20 + this.size * 0.9 * this.speedFactor;
  }

  #movementBounds() {
    const margin = this.size * 0.62;
    return {
      minX: margin,
      maxX: Math.max(margin, this.bounds.width - margin),
      minY: margin,
      maxY: Math.max(margin, this.bounds.height - margin)
    };
  }

  #pickTarget() {
    const inset = clamp(Math.min(this.bounds.width, this.bounds.height) * 0.04, 8, 18);
    return {
      x: rand(inset, Math.max(inset, this.bounds.width - inset)),
      y: rand(inset, Math.max(inset, this.bounds.height - inset))
    };
  }

  #isTargetInBounds(target) {
    if (!target) return false;
    return target.x >= 0 && target.x <= this.bounds.width && target.y >= 0 && target.y <= this.bounds.height;
  }

  #shouldRetarget() {
    const dist = Math.hypot(this.target.x - this.position.x, this.target.y - this.position.y);
    if (dist <= TARGET_REACHED_RADIUS) return true;
    return Math.random() < 0.0025;
  }

  #seekVector() {
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const mag = Math.hypot(dx, dy) || 1;
    return { x: dx / mag, y: dy / mag };
  }

  #wallAvoidanceVector() {
    const movement = this.#movementBounds();
    const influence = clamp(Math.min(this.bounds.width, this.bounds.height) * 0.22, 45, 110);
    const strength = 2.2;

    let ax = 0;
    let ay = 0;

    const dLeft = this.position.x - movement.minX;
    const dRight = movement.maxX - this.position.x;
    const dTop = this.position.y - movement.minY;
    const dBottom = movement.maxY - this.position.y;

    if (dLeft < influence) ax += ((influence - dLeft) / influence) ** 2 * strength;
    if (dRight < influence) ax -= ((influence - dRight) / influence) ** 2 * strength;
    if (dTop < influence) ay += ((influence - dTop) / influence) ** 2 * strength;
    if (dBottom < influence) ay -= ((influence - dBottom) / influence) ** 2 * strength;

    return { x: ax, y: ay };
  }

  #resolveCollisions() {
    const movement = this.#movementBounds();

    let hitX = false;
    let hitY = false;

    if (this.position.x <= movement.minX) {
      this.position.x = movement.minX;
      hitX = true;
    } else if (this.position.x >= movement.maxX) {
      this.position.x = movement.maxX;
      hitX = true;
    }

    if (this.position.y <= movement.minY) {
      this.position.y = movement.minY;
      hitY = true;
    } else if (this.position.y >= movement.maxY) {
      this.position.y = movement.maxY;
      hitY = true;
    }

    if (hitX) this.headingAngle = Math.PI - this.headingAngle;
    if (hitY) this.headingAngle = -this.headingAngle;

    if (hitX || hitY) {
      this.facing = resolveFacingByCos(this.headingAngle, this.facing);
      this.headingAngle = clampAngleForFacing(this.headingAngle, this.facing);
      this.desiredAngle = this.headingAngle;
      this.target = this.#pickTarget();
      this.currentSpeed = Math.max(this.currentSpeed, this.#baseSpeed() * 0.95);
    }
  }
}
