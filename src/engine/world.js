/**
 * World simulation container.
 * Responsibility: hold fish + bubble state and update simulation with delta time.
 */

import { Fish } from './fish.js';
import { CONFIG } from '../config.js';

const MAX_TILT = CONFIG.world.maxTiltRad;
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const FOOD_DEFAULT_AMOUNT = CONFIG.world.food.defaultAmount;
const FOOD_DEFAULT_TTL = CONFIG.world.food.defaultTtlSec;
const FOOD_FALL_ACCEL = CONFIG.world.food.fallAccel;
const FOOD_FALL_DAMPING = CONFIG.world.food.fallDamping;
const FOOD_MAX_FALL_SPEED = CONFIG.world.food.maxFallSpeed;
const AGE_CONFIG = CONFIG.fish.age;
const GROWTH_CONFIG = CONFIG.fish.growth;
const FISH_DEAD_TO_SKELETON_SEC = CONFIG.world.fishLifecycle.deadToSkeletonSec;
const FISH_SKELETON_TO_REMOVE_SEC = CONFIG.world.fishLifecycle.skeletonToRemoveSec;
const WATER_CONFIG = CONFIG.world.water;
const WATER_INITIAL_HYGIENE01 = 1;
const WATER_INITIAL_DIRT01 = 0;
const WATER_REFERENCE_FISH_COUNT = Math.max(1, WATER_CONFIG.referenceFishCount ?? 20);
const WATER_BASELINE_DECAY_PER_SEC = Math.max(0, WATER_CONFIG.baselineDecayPerSec ?? 0);
const WATER_BIOLOAD_DIRT_PER_SEC = Math.max(0, WATER_CONFIG.bioloadDirtPerSec ?? 0);
const WATER_DIRT_PER_EXPIRED_FOOD = Math.max(0, WATER_CONFIG.dirtPerExpiredFood ?? 0);
const WATER_DIRT_TO_DECAY_MULTIPLIER = Math.max(0, WATER_CONFIG.dirtToDecayMultiplier ?? 3);

function makeBubble(bounds) {
  return {
    x: rand(0, bounds.width),
    y: bounds.height + rand(0, bounds.height * 0.3),
    radius: rand(1.4, 3.4),
    speed: rand(12, 35),
    swayPhase: rand(0, Math.PI * 2),
    swayAmplitude: rand(2, 10)
  };
}

export class World {
  constructor(width, height, initialFishCount = 20) {
    const normalizedInitialFishCount = Math.max(1, Math.min(50, Math.round(initialFishCount)));

    this.bounds = { width, height, sandHeight: this.#computeSandHeight(height) };
    this.fish = [];
    this.food = [];
    // Forward-compatible containers for new systems.
    this.poop = [];
    this.eggs = [];
    this.bubbles = [];
    this.nextFoodId = 1;
    this.nextFishId = 1;
    this.nextPlaySessionId = 1;
    this.simTimeSec = 0;
    this.selectedFishId = null;

    this.initialFishCount = normalizedInitialFishCount;
    this.foodsConsumedCount = 0;
    this.filterUnlockThreshold = this.initialFishCount * 4;
    this.filterUnlocked = false;

    // Simple event queue for UI/telemetry/achievements.
    // Use `world.flushEvents()` from main loop if/when needed.
    this.events = [];
    this.playSessions = [];
    this.groundAlgae = [];

    // Global environment state (will grow over time).
    this.water = this.#createInitialWaterState();
    this.expiredFoodSinceLastWaterUpdate = 0;

    this.paused = false;
    this.speedMultiplier = 1;

    this.setFishCount(this.initialFishCount);
    this.#seedBubbles();
    this.#seedGroundAlgae();
  }

  emit(type, payload = {}) {
    this.events.push({
      type,
      t: this.simTimeSec,
      payload
    });
  }

  flushEvents() {
    const out = this.events;
    this.events = [];
    return out;
  }


  #computeSandHeight(height) {
    // Placeholder: keep as a function so we can later model a real sand layer.
    // Returning 0 keeps current visuals/physics unchanged.
    return Math.max(0, Math.min(0, height));
  }

  #swimHeight() {
    return Math.max(40, this.bounds.height);
  }
  #spawnMargin() {
    const base = Math.min(this.bounds.width, this.bounds.height) * 0.03;
    return clamp(base, 10, 20);
  }

  #randomHeading() {
    const facing = Math.random() < 0.5 ? -1 : 1;
    const tilt = rand(-MAX_TILT, MAX_TILT);
    return facing < 0 ? Math.PI - tilt : tilt;
  }

  #randomSpawn(size) {
    const margin = this.#spawnMargin();
    const x = rand(margin, Math.max(margin, this.bounds.width - margin));
    const y = rand(margin, Math.max(margin, this.#swimHeight() - margin));

    return { x, y, size };
  }

  #isSpawnClear(position, size) {
    for (const fish of this.fish) {
      const minDist = Math.max(size * 1.5, fish.size * 1.5);
      const dist = Math.hypot(position.x - fish.position.x, position.y - fish.position.y);
      if (dist < minDist) return false;
    }
    return true;
  }

  #createFish() {
    const sizeRange = GROWTH_CONFIG.sizeFactorRange;
    const growthRange = GROWTH_CONFIG.growthRateRange;

    const sizeFactor = rand(sizeRange.min, sizeRange.max);
    const adultRadius = GROWTH_CONFIG.adultRadius * sizeFactor;
    const birthRadius = adultRadius * GROWTH_CONFIG.birthScale;

    const lifeMean = AGE_CONFIG.lifespanMeanSec;
    const lifeJitter = AGE_CONFIG.lifespanJitterSec;
    const lifespanSec = rand(lifeMean - lifeJitter, lifeMean + lifeJitter);

    const stageJitter = AGE_CONFIG.stageJitterSec;
    const stageShiftBabySec = rand(-stageJitter, stageJitter);
    const stageShiftJuvenileSec = rand(-stageJitter, stageJitter);

    let spawn = this.#randomSpawn(birthRadius);

    for (let i = 0; i < 20; i += 1) {
      if (this.#isSpawnClear(spawn, birthRadius)) break;
      spawn = this.#randomSpawn(birthRadius);
    }

    return new Fish(this.bounds, {
      id: this.nextFishId++,
      spawnTimeSec: this.simTimeSec,
      sizeFactor,
      growthRate: rand(growthRange.min, growthRange.max),
      lifespanSec,
      stageShiftBabySec,
      stageShiftJuvenileSec,
      position: { x: spawn.x, y: spawn.y },
      headingAngle: this.#randomHeading(),
      speedFactor: rand(0.42, 0.68)
    });
  }

  resize(width, height) {
    this.bounds.width = width;
    this.bounds.height = height;
    this.bounds.sandHeight = this.#computeSandHeight(height);

    for (const fish of this.fish) fish.setBounds(this.bounds);
    for (const food of this.food) {
      food.x = Math.min(Math.max(0, food.x), width);
      food.y = Math.min(Math.max(0, food.y), Math.max(0, this.#swimHeight()));
    }

    for (const bubble of this.bubbles) {
      bubble.x = Math.min(Math.max(0, bubble.x), width);
      bubble.y = Math.min(Math.max(0, bubble.y), height + 40);
    }

    this.#seedGroundAlgae();
  }


  spawnFood(x, y, amount = FOOD_DEFAULT_AMOUNT, ttl = FOOD_DEFAULT_TTL) {
    const clampedX = clamp(x, 0, this.bounds.width);
    const clampedY = clamp(y, 0, this.#swimHeight());

    this.food.push({
      id: this.nextFoodId++,
      x: clampedX,
      y: clampedY,
      amount: Math.max(0.1, amount),
      ttl,
      vy: rand(8, 20)
    });

    this.emit('food:spawn', { x: clampedX, y: clampedY, amount, ttl });
  }

  consumeFood(foodId, amountToConsume = 0.5) {
    const food = this.food.find((entry) => entry.id === foodId);
    if (!food) return 0;

    const consumed = Math.min(food.amount, Math.max(0.05, amountToConsume));
    food.amount -= consumed;
    if (food.amount <= 0.001) {
      this.food = this.food.filter((entry) => entry.id !== foodId);
    }

    if (consumed > 0) this.emit('food:consume', { foodId, consumed });

    if (consumed > 0) {
      this.foodsConsumedCount += 1;

      if (!this.filterUnlocked && this.foodsConsumedCount >= this.filterUnlockThreshold) {
        this.filterUnlocked = true;
      }
    }

    return consumed;
  }


  selectFish(fishId) {
    const found = this.fish.find((f) => f.id === fishId);
    this.selectedFishId = found ? found.id : null;
    return this.selectedFishId;
  }

  toggleFishSelection(fishId) {
    if (this.selectedFishId === fishId) {
      this.selectedFishId = null;
      return null;
    }
    return this.selectFish(fishId);
  }

  renameFish(fishId, name) {
    const fish = this.fish.find((entry) => entry.id === fishId);
    if (!fish) return false;
    fish.name = String(name ?? '').trim().slice(0, 24);
    return true;
  }

  discardFish(fishId) {
    const index = this.fish.findIndex((entry) => entry.id === fishId && entry.lifeState !== 'ALIVE');
    if (index < 0) return false;
    this.fish.splice(index, 1);
    if (this.selectedFishId === fishId) this.selectedFishId = null;
    return true;
  }

  getSelectedFish() {
    return this.fish.find((f) => f.id === this.selectedFishId) ?? null;
  }

  findFishAt(x, y) {
    for (let i = this.fish.length - 1; i >= 0; i -= 1) {
      const fish = this.fish[i];
      const dist = Math.hypot(x - fish.position.x, y - fish.position.y);
      if (dist <= fish.size * 0.8) return fish;
    }
    return null;
  }

  setFishCount(count) {
    const clamped = Math.max(1, Math.min(50, Math.round(count)));

    while (this.fish.length < clamped) {
      this.fish.push(this.#createFish());
    }
    while (this.fish.length > clamped) {
      this.fish.pop();
    }

    if (!this.fish.some((f) => f.id === this.selectedFishId)) {
      this.selectedFishId = this.fish[0]?.id ?? null;
    }
  }

  setSpeedMultiplier(value) {
    this.speedMultiplier = Math.max(0.5, Math.min(3, value));
  }

  togglePause() {
    this.paused = !this.paused;
    return this.paused;
  }

  update(rawDelta) {
    if (this.paused) return;

    const delta = rawDelta * this.speedMultiplier;
    this.simTimeSec += delta;

    for (const fish of this.fish) fish.updateLifeCycle?.(this.simTimeSec);
    for (const fish of this.fish) fish.updatePlayState?.(this.simTimeSec);
    this.#updatePlaySessions();
    this.#tryExpandPlaySessions();
    this.#tryStartPlaySessions();
    for (const fish of this.fish) fish.updateMetabolism(delta, this);
    for (const fish of this.fish) fish.decideBehavior(this, delta);
    for (const fish of this.fish) fish.applySteering(delta);
    for (const fish of this.fish) fish.tryConsumeFood(this);

    this.#updateFishLifeState();
    this.#updateFood(delta);
    this.#updateWaterHygiene(delta);
    this.#updateBubbles(delta);
  }

  #createInitialWaterState() {
    return {
      hygiene01: WATER_INITIAL_HYGIENE01,
      dirt01: WATER_INITIAL_DIRT01
    };
  }

  #updateWaterHygiene(dtSec) {
    const expiredFoodCount = this.expiredFoodSinceLastWaterUpdate;
    this.expiredFoodSinceLastWaterUpdate = 0;

    if (!Number.isFinite(dtSec) || dtSec <= 0) return;

    const fishCount = this.fish.length;
    const bioload = fishCount / WATER_REFERENCE_FISH_COUNT;

    const bioloadDirt = WATER_BIOLOAD_DIRT_PER_SEC * bioload * dtSec;
    const expiredFoodDirt = expiredFoodCount * WATER_DIRT_PER_EXPIRED_FOOD;
    this.water.dirt01 = clamp(this.water.dirt01 + bioloadDirt + expiredFoodDirt, 0, 1);

    const dirtMultiplier = 1 + this.water.dirt01 * WATER_DIRT_TO_DECAY_MULTIPLIER;
    const baselineDecay = WATER_BASELINE_DECAY_PER_SEC * bioload * dirtMultiplier * dtSec;
    this.water.hygiene01 = clamp(this.water.hygiene01 - baselineDecay, 0, 1);
  }

  #seedGroundAlgae() {
    const count = Math.max(10, Math.floor(this.bounds.width / 76));
    this.groundAlgae = Array.from({ length: count }, () => ({
      x: rand(12, Math.max(12, this.bounds.width - 12)),
      y: this.bounds.height - rand(1, 10),
      height: rand(this.bounds.height * 0.07, this.bounds.height * 0.16),
      width: rand(4, 10),
      swayAmp: rand(1.2, 4.2),
      swayRate: rand(0.0012, 0.0026),
      phase: rand(0, Math.PI * 2),
      radius: rand(28, 55)
    }));
  }

  #updatePlaySessions() {
    this.playSessions = this.playSessions.filter((session) => {
      const runner = this.fish.find((f) => f.id === session.runnerFishId);
      const chasers = session.chaserFishIds
        .map((id) => this.fish.find((f) => f.id === id))
        .filter((fish) => fish && fish.isPlaying?.(this.simTimeSec));

      const runnerAliveInSession = runner && runner.isPlaying?.(this.simTimeSec);
      if (!runnerAliveInSession || chasers.length < 1 || this.simTimeSec >= session.untilSec) {
        if (runnerAliveInSession) runner.stopPlay?.(this.simTimeSec);
        for (const fish of chasers) fish.stopPlay?.(this.simTimeSec);
        return false;
      }

      session.chaserFishIds = chasers.map((fish) => fish.id);
      runner.setPlayRole?.('RUNNER');
      const closestChaser = chasers.reduce((best, current) => {
        if (!best) return current;
        const currDist = Math.hypot(runner.position.x - current.position.x, runner.position.y - current.position.y);
        const bestDist = Math.hypot(runner.position.x - best.position.x, runner.position.y - best.position.y);
        return currDist < bestDist ? current : best;
      }, null);
      runner.setPlayTargetFish?.(closestChaser?.id ?? null);

      for (const chaser of chasers) {
        chaser.setPlayRole?.('CHASER');
        chaser.setPlayTargetFish?.(runner.id);
      }

      session.origin = {
        x: (runner.position.x + (chasers[0]?.position.x ?? runner.position.x)) * 0.5,
        y: (runner.position.y + (chasers[0]?.position.y ?? runner.position.y)) * 0.5
      };

      return true;
    });
  }

  #isNearGroundAlgae(point) {
    return this.groundAlgae.some((algae) => Math.hypot(point.x - algae.x, point.y - algae.y) <= algae.radius);
  }

  #tryExpandPlaySessions() {
    const joinRadius = 82;

    for (const session of this.playSessions) {
      const runner = this.fish.find((f) => f.id === session.runnerFishId);
      if (!runner || !runner.isPlaying?.(this.simTimeSec)) continue;

      const anchor = runner.position;
      for (const candidate of this.fish) {
        if (!candidate.canStartPlay?.(this.simTimeSec)) continue;

        const d = Math.hypot(candidate.position.x - anchor.x, candidate.position.y - anchor.y);
        if (d > joinRadius) continue;
        if (Math.random() > 0.45) continue;

        candidate.startPlay?.({
          sessionId: session.id,
          role: 'CHASER',
          untilSec: session.untilSec,
          targetFishId: runner.id,
          startedNearAlgae: session.startedNearAlgae,
          simTimeSec: this.simTimeSec
        });
        session.chaserFishIds.push(candidate.id);
      }
    }
  }

  #tryStartPlaySessions() {
    if (this.fish.length < 2) return;

    const encounterRadius = 64;

    for (let i = 0; i < this.fish.length; i += 1) {
      const a = this.fish[i];
      if (!a.canStartPlay?.(this.simTimeSec)) continue;

      for (let j = i + 1; j < this.fish.length; j += 1) {
        const b = this.fish[j];
        if (!b.canStartPlay?.(this.simTimeSec)) continue;

        const dist = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
        if (dist > encounterRadius) continue;

        const midpoint = {
          x: (a.position.x + b.position.x) * 0.5,
          y: (a.position.y + b.position.y) * 0.5
        };

        const nearAlgae = this.#isNearGroundAlgae(midpoint);
        const probability = (a.playProbability?.(nearAlgae) + b.playProbability?.(nearAlgae)) * 0.5;

        if (Math.random() > probability) {
          const cooldownUntilSec = this.simTimeSec + 10;
          a.delayPlayEligibility?.(cooldownUntilSec);
          b.delayPlayEligibility?.(cooldownUntilSec);
          continue;
        }

        const duration = rand(4, 7);
        const sessionId = this.nextPlaySessionId++;
        const untilSec = this.simTimeSec + duration;

        const runner = Math.random() < 0.5 ? a : b;
        const initialChaser = runner === a ? b : a;

        runner.startPlay?.({
          sessionId,
          role: 'RUNNER',
          untilSec,
          targetFishId: initialChaser.id,
          startedNearAlgae: nearAlgae,
          simTimeSec: this.simTimeSec
        });

        initialChaser.startPlay?.({
          sessionId,
          role: 'CHASER',
          untilSec,
          targetFishId: runner.id,
          startedNearAlgae: nearAlgae,
          simTimeSec: this.simTimeSec
        });

        const chaserIds = [initialChaser.id];
        for (const candidate of this.fish) {
          if (candidate.id === runner.id || candidate.id === initialChaser.id) continue;
          if (!candidate.canStartPlay?.(this.simTimeSec)) continue;

          const d = Math.hypot(candidate.position.x - midpoint.x, candidate.position.y - midpoint.y);
          if (d > encounterRadius * 1.25) continue;
          if (Math.random() >= 0.55) continue;

          candidate.startPlay?.({
            sessionId,
            role: 'CHASER',
            untilSec,
            targetFishId: runner.id,
            startedNearAlgae: nearAlgae,
            simTimeSec: this.simTimeSec
          });
          chaserIds.push(candidate.id);
          if (chaserIds.length >= 5) break;
        }

        this.playSessions.push({
          id: sessionId,
          runnerFishId: runner.id,
          chaserFishIds: chaserIds,
          untilSec,
          startedNearAlgae: nearAlgae,
          origin: midpoint
        });

        return;
      }
    }
  }

  #updateFishLifeState() {
    for (let i = this.fish.length - 1; i >= 0; i -= 1) {
      const fish = this.fish[i];
      if (fish.lifeState === 'DEAD') {
        if (fish.deadAtSec == null) fish.deadAtSec = this.simTimeSec;
        if (this.simTimeSec - fish.deadAtSec >= FISH_DEAD_TO_SKELETON_SEC) {
          fish.lifeState = 'SKELETON';
          fish.skeletonAtSec = this.simTimeSec;
          fish.behavior = { mode: 'deadSink', targetFoodId: null, speedBoost: 1 };
        }
        continue;
      }

      if (fish.lifeState === 'SKELETON') {
        if (fish.skeletonAtSec == null) fish.skeletonAtSec = this.simTimeSec;
        if (this.simTimeSec - fish.skeletonAtSec >= FISH_SKELETON_TO_REMOVE_SEC) {
          this.fish.splice(i, 1);
          if (this.selectedFishId === fish.id) this.selectedFishId = null;
        }
      }
    }
  }


  #updateFood(delta) {
    const bottomY = this.#swimHeight();

    for (let i = this.food.length - 1; i >= 0; i -= 1) {
      const item = this.food[i];
      if (Number.isFinite(item.ttl)) item.ttl -= delta;

      item.vy += FOOD_FALL_ACCEL * delta;
      item.y += item.vy * delta;
      if (item.y >= bottomY) {
        item.y = bottomY;
        item.vy *= FOOD_FALL_DAMPING;
      } else {
        item.vy = Math.min(item.vy, FOOD_MAX_FALL_SPEED);
      }

      if (Number.isFinite(item.ttl) && item.ttl <= 0) {
        this.food.splice(i, 1);
        this.expiredFoodSinceLastWaterUpdate += 1;
        this.emit('foodExpired', { foodId: item.id });
      }
    }
  }

  #seedBubbles() {
    const count = CONFIG.world.bubbles.seedCount;
    this.bubbles = Array.from({ length: count }, () => makeBubble(this.bounds));
  }

  #updateBubbles(delta) {
    const { width, height } = this.bounds;

    for (const food of this.food) {
      food.x = Math.min(Math.max(0, food.x), width);
      food.y = Math.min(Math.max(0, food.y), Math.max(0, this.#swimHeight()));
    }

    for (const bubble of this.bubbles) {
      bubble.y -= bubble.speed * delta;
      bubble.swayPhase += delta;
      bubble.x += Math.sin(bubble.swayPhase) * bubble.swayAmplitude * delta;

      if (bubble.y < -10) {
        bubble.y = height + rand(8, 80);
        bubble.x = rand(0, width);
      }
      if (bubble.x < 0) bubble.x += width;
      if (bubble.x > width) bubble.x -= width;
    }
  }
}
