/**
 * Fish entity model (coherent headingAngle + scalar speed).
 * Compatible with:
 * - world.js passing { position, headingAngle, speedFactor }
 * - renderer.js expecting fish.heading() => { tilt, facing }
 */

const TAU = Math.PI * 2;
const MAX_TILT = Math.PI / 3;               // 60°
const MAX_TURN_RATE = (140 * Math.PI) / 180; // rad/sec

const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function wrapAngle(a) {
  let x = a;
  while (x <= -Math.PI) x += TAU;
  while (x > Math.PI) x -= TAU;
  return x;
}

// clamp an absolute heading angle to keep tilt within ±MAX_TILT,
// while still allowing left-facing swimming.
function clampHeadingToTilt(angle) {
  const a = wrapAngle(angle);
  const facing = Math.cos(a) >= 0 ? 1 : -1;

  // If facing right: base = 0, tilt = a
  // If facing left: base = PI, tilt = PI - a
  const tilt = facing === 1 ? a : Math.PI - a;
  const clampedTilt = clamp(wrapAngle(tilt), -MAX_TILT, MAX_TILT);

  return facing === 1 ? clampedTilt : Math.PI - clampedTilt;
}

function moveTowardsAngle(current, target, maxStep) {
  const delta = wrapAngle(target - current);
  const step = clamp(delta, -maxStep, maxStep);
  return wrapAngle(current + step);
}

export class Fish {
  constructor(bounds, options = {}) {
    this.bounds = bounds;

    this.size = options.size ?? rand(14, 30);
    this.colorHue = options.colorHue ?? rand(12, 38);

    // Position from world.js spawn (important)
    const p = options.position;
    this.position = p
      ? { x: p.x, y: p.y }
      : { x: rand(0, bounds.width), y: rand(0, bounds.height) };

    // Heading from world.js spawn (important)
    const ha = typeof options.headingAngle === 'number' ? options.headingAngle : rand(-Math.PI, Math.PI);
    this.headingAngle = clampHeadingToTilt(ha);

    // Speed factor from world.js spawn (important)
    this.speedFactor = typeof options.speedFactor === 'number' ? options.speedFactor : rand(0.56, 0.86);

    this.baseSpeed = rand(35, 95) * this.speedFactor;
    this.currentSpeed = this.baseSpeed * rand(0.75, 1.05);

    this.target = this.#randomTarget();
    this.retargetTimer = rand(2.5, 6.0);

    // per-fish wander phase (natural feeling, cheap)
    this.wanderPhase = rand(0, TAU);
    this.wanderRate = rand(0.6, 1.2);

    // cached margin so they can go near corners but not stick
    this.marginPct = 0.028; // ~2.8%
  }

  setBounds(bounds) {
    this.bounds = bounds;
    const m = this.#margin();
    this.position.x = clamp(this.position.x, m, Math.max(m, bounds.width - m));
    this.position.y = clamp(this.position.y, m, Math.max(m, bounds.height - m));
    this.target.x = clamp(this.target.x, m, Math.max(m, bounds.width - m));
    this.target.y = clamp(this.target.y, m, Math.max(m, bounds.height - m));
  }

  update(dt) {
    // Safety
    if (!dt || dt <= 0) return;
    dt = Math.min(dt, 0.05);

    // Retargeting
    this.retargetTimer -= dt;
    const dist = this.#distanceToTarget();
    if (this.retargetTimer <= 0 || dist < 28) {
      this.target = this.#randomTarget();
      this.retargetTimer = rand(2.5, 6.0);
    }

    // Compute desired heading from target seeking + wall avoidance + small wander
    const desiredAngle = this.#computeDesiredAngle(dt);

    // Turn toward desired with rate limit
    const clampedDesired = clampHeadingToTilt(desiredAngle);
    this.headingAngle = moveTowardsAngle(this.headingAngle, clampedDesired, MAX_TURN_RATE * dt);
    this.headingAngle = clampHeadingToTilt(this.headingAngle);

    // Mild speed breathing (more “alive”)
    const speedTarget = this.baseSpeed * (0.92 + 0.16 * Math.sin((Date.now() * 0.001) * this.wanderRate + this.wanderPhase));
    this.currentSpeed += (speedTarget - this.currentSpeed) * Math.min(1, dt * 0.9);

    // Integrate
    const dx = Math.cos(this.headingAngle) * this.currentSpeed * dt;
    const dy = Math.sin(this.headingAngle) * this.currentSpeed * dt;

    this.position.x += dx;
    this.position.y += dy;

    // Collision handling: clamp + reflect heading so they never "stick"
    this.#resolveCollisions();
  }

  // Renderer expects { tilt, facing }
  heading() {
    const a = this.headingAngle;
    const facing = Math.cos(a) >= 0 ? 1 : -1;
    // tilt relative to horizontal; always small
    const tiltRaw = Math.atan2(Math.sin(a), Math.abs(Math.cos(a)) + 1e-9);
    const tilt = clamp(tiltRaw, -MAX_TILT, MAX_TILT);
    return { tilt, facing };
  }

  /* ---------------------- internals ---------------------- */

  #margin() {
    const base = Math.min(this.bounds.width, this.bounds.height) * this.marginPct;
    return clamp(base, 10, 20);
  }

  #randomTarget() {
    const m = this.#margin();
    return {
      x: rand(m, Math.max(m, this.bounds.width - m)),
      y: rand(m, Math.max(m, this.bounds.height - m)),
    };
  }

  #distanceToTarget() {
    return Math.hypot(this.target.x - this.position.x, this.target.y - this.position.y);
  }

  #computeDesiredAngle(dt) {
    // Seek vector
    const dx = this.target.x - this.position.x;
    const dy = this.target.y - this.position.y;
    const d = Math.hypot(dx, dy) || 1;
    const sx = dx / d;
    const sy = dy / d;

    // Wall avoidance vector (only strong near edges)
    const { ax, ay } = this.#wallAvoidance();

    // Small wander (per-fish)
    this.wanderPhase += dt * this.wanderRate;
    const wx = Math.cos(this.wanderPhase) * 0.10;
    const wy = Math.sin(this.wanderPhase * 0.9) * 0.06;

    // Combine
    const cx = sx * 0.92 + ax * 0.95 + wx;
    const cy = sy * 0.92 + ay * 0.95 + wy;

    // If combined nearly cancels out, keep current heading (prevents jitter/stall)
    if (Math.hypot(cx, cy) < 1e-4) return this.headingAngle;

    return Math.atan2(cy, cx);
  }

  #wallAvoidance() {
    const m = this.#margin();
    const influence = m * 1.15;

    const left = this.position.x;
    const right = this.bounds.width - this.position.x;
    const top = this.position.y;
    const bottom = this.bounds.height - this.position.y;

    let ax = 0, ay = 0;

    // Only start pushing when within influence zone
    if (left < influence) ax += ((influence - left) / influence) * 0.8;
    if (right < influence) ax -= ((influence - right) / influence) * 0.8;
    if (top < influence) ay += ((influence - top) / influence) * 0.55;
    if (bottom < influence) ay -= ((influence - bottom) / influence) * 0.55;

    return { ax, ay };
  }

  #resolveCollisions() {
    const r = this.size * 0.55;
    const m = this.#margin();

    const minX = m + r;
    const maxX = this.bounds.width - m - r;
    const minY = m + r;
    const maxY = this.bounds.height - m - r;

    let hitX = false;
    let hitY = false;

    if (this.position.x < minX) { this.position.x = minX; hitX = true; }
    if (this.position.x > maxX) { this.position.x = maxX; hitX = true; }
    if (this.position.y < minY) { this.position.y = minY; hitY = true; }
    if (this.position.y > maxY) { this.position.y = maxY; hitY = true; }

    if (hitX || hitY) {
      // reflect heading away from wall and nudge inward slightly
      if (hitX) this.headingAngle = Math.PI - this.headingAngle;
      if (hitY) this.headingAngle = -this.headingAngle;

      this.headingAngle = clampHeadingToTilt(this.headingAngle);

      // nudge inward so it doesn't keep re-colliding due to precision
      this.position.x = clamp(this.position.x, minX + 0.5, maxX - 0.5);
      this.position.y = clamp(this.position.y, minY + 0.5, maxY - 0.5);
    }
  }
}
