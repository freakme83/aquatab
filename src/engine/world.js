/**
 * World simulation container.
 * Responsibility: hold fish + bubble state and update simulation with delta time.
 */

import { Fish } from './fish.js';
import { CONFIG } from '../config.js';

const MAX_TILT = CONFIG.world.maxTiltRad;
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const clamp01 = (v) => clamp(v, 0, 1);
const FOOD_DEFAULT_AMOUNT = CONFIG.world.food.defaultAmount;
const FOOD_DEFAULT_TTL = CONFIG.world.food.defaultTtlSec;
const FOOD_FALL_ACCEL = CONFIG.world.food.fallAccel;
const FOOD_FALL_DAMPING = CONFIG.world.food.fallDamping;
const FOOD_MAX_FALL_SPEED = CONFIG.world.food.maxFallSpeed;
const AGE_CONFIG = CONFIG.fish.age;
const INITIAL_MAX_AGE_SEC = Math.max(0, AGE_CONFIG.INITIAL_MAX_AGE_SEC ?? 1200);
const GROWTH_CONFIG = CONFIG.fish.growth;
const WATER_CONFIG = CONFIG.world.water;
const REPRO_CONFIG = CONFIG.reproduction ?? {};
const REPRO_ENABLED = REPRO_CONFIG.REPRO_ENABLED !== false;
const MATE_ENCOUNTER_RADIUS_PX = Math.max(0, REPRO_CONFIG.MATE_ENCOUNTER_RADIUS_PX ?? 70);
const MATE_PAIR_RETRY_MIN_SEC = Math.max(0, REPRO_CONFIG.MATE_PAIR_RETRY_MIN_SEC ?? 25);
const MATE_BASE_CHANCE = Math.max(0, REPRO_CONFIG.MATE_BASE_CHANCE ?? 0.08);
const MATE_FATHER_COOLDOWN_SEC = REPRO_CONFIG.MATE_FATHER_COOLDOWN_SEC ?? [120, 240];
const MATE_MIN_WELLBEING = clamp01(REPRO_CONFIG.MATE_MIN_WELLBEING ?? 0.8);
const MATE_MIN_HYGIENE = clamp01(REPRO_CONFIG.MATE_MIN_HYGIENE ?? 0.6);
const GESTATION_SEC = REPRO_CONFIG.GESTATION_SEC ?? [300, 360];
const EGG_INCUBATION_SEC = REPRO_CONFIG.EGG_INCUBATION_SEC ?? [120, 300];
const MOTHER_COOLDOWN_SEC = REPRO_CONFIG.MOTHER_COOLDOWN_SEC ?? [600, 1080];
const CLUTCH_SIZE = REPRO_CONFIG.CLUTCH_SIZE ?? [2, 4];
const HATCH_FLOOR = 0.02;
const WATER_INITIAL_HYGIENE01 = 1;
const WATER_INITIAL_DIRT01 = 0;
const WATER_REFERENCE_FISH_COUNT = Math.max(1, WATER_CONFIG.referenceFishCount ?? 20);
const WATER_BASELINE_DECAY_PER_SEC = Math.max(0, WATER_CONFIG.baselineDecayPerSec ?? 0);
const WATER_BIOLOAD_DIRT_PER_SEC = Math.max(0, WATER_CONFIG.bioloadDirtPerSec ?? 0);
const WATER_DIRT_PER_EXPIRED_FOOD = Math.max(0, WATER_CONFIG.dirtPerExpiredFood ?? 0);
const WATER_DIRT_TO_DECAY_MULTIPLIER = Math.max(0, WATER_CONFIG.dirtToDecayMultiplier ?? 3);
const FILTER_DIRT_REMOVE_PER_SEC = Math.max(0, WATER_CONFIG.filterDirtRemovePerSec ?? 0);
const FILTER_WEAR_BASE_PER_SEC = Math.max(0, WATER_CONFIG.wearBasePerSec ?? 0);
const FILTER_WEAR_BIOLOAD_FACTOR = Math.max(0, WATER_CONFIG.wearBioloadFactor ?? 0);
const FILTER_WEAR_DIRT_FACTOR = Math.max(0, WATER_CONFIG.wearDirtFactor ?? 0);
const FILTER_BIOLOAD_MITIGATION_FACTOR = Math.max(0, WATER_CONFIG.bioloadMitigationFactor ?? 0);
const FILTER_DEPLETED_THRESHOLD_01 = clamp(WATER_CONFIG.filterDepletedThreshold01 ?? 0.1, 0, 1);
const FILTER_INSTALL_DURATION_SEC = Math.max(0.001, WATER_CONFIG.installDurationSec ?? 12);
const FILTER_MAINTENANCE_DURATION_SEC = Math.max(0.001, WATER_CONFIG.maintenanceDurationSec ?? 12);
const FILTER_MAINTENANCE_COOLDOWN_SEC = Math.max(0, WATER_CONFIG.maintenanceCooldownSec ?? 25);
const FILTER_MAINTENANCE_RESTORE_TO_01 = clamp(WATER_CONFIG.maintenanceRestoreTo01 ?? 1, 0, 1);
const CORPSE_GRACE_SEC = 120;
const CORPSE_DIRT_STEP_SEC = 60;
const CORPSE_DIRT_INITIAL01 = 0.07;
const CORPSE_DIRT_STEP01 = 0.01;
const CORPSE_DIRT_MAX01 = 0.12;

function inheritTraits(motherTraits, fatherTraits, config = {}) {
  const mother = motherTraits ?? {};
  const father = fatherTraits ?? mother;
  const child = {};
  const keys = Object.keys(mother);
  const mutationPct = Math.max(0, Number(config?.TRAIT_MUTATION_PCT ?? 0));

  for (const key of keys) {
    const mVal = mother[key];
    const fVal = father[key];

    if (typeof mVal === 'number' && Number.isFinite(mVal) && typeof fVal === 'number' && Number.isFinite(fVal)) {
      const mean = (mVal + fVal) / 2;
      const mutation = mean * (Math.random() * 2 - 1) * mutationPct;
      const value = mean + mutation;
      child[key] = Number.isFinite(value) ? value : mean;
    }
  }

  // ---- Clamp critical traits safely ----
  if (child.colorHue !== undefined) {
    child.colorHue = ((child.colorHue % 360) + 360) % 360;
  }

  if (child.sizeFactor !== undefined) {
    child.sizeFactor = Math.max(0.6, Math.min(1.4, child.sizeFactor));
  }

  if (child.growthRate !== undefined) {
    child.growthRate = Math.max(0.5, Math.min(1.8, child.growthRate));
  }

  if (child.speedFactor !== undefined) {
    child.speedFactor = Math.max(0.6, Math.min(1.6, child.speedFactor));
  }

  if (child.lifespanSec !== undefined) {
    child.lifespanSec = Math.max(30, child.lifespanSec);
  }

  return child;
}

function randRange(range, fallbackMin = 0, fallbackMax = 0) {
  const min = Number.isFinite(range?.[0]) ? range[0] : fallbackMin;
  const max = Number.isFinite(range?.[1]) ? range[1] : fallbackMax;
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return rand(low, high);
}

function randIntInclusive(range, fallbackMin = 0, fallbackMax = 0) {
  const min = Math.round(Number.isFinite(range?.[0]) ? range[0] : fallbackMin);
  const max = Math.round(Number.isFinite(range?.[1]) ? range[1] : fallbackMax);
  const low = Math.min(min, max);
  const high = Math.max(min, max);
  return Math.floor(rand(low, high + 1));
}

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
  constructor(width, height, initialFishCount = 4) {
    const normalizedInitialFishCount = Math.max(1, Math.min(6, Math.round(initialFishCount)));

    this.bounds = { width, height, sandHeight: this.#computeSandHeight(height) };
    this.fish = [];
    this.fishById = new Map();
    this.food = [];
    // Forward-compatible containers for new systems.
    this.poop = [];
    // egg structure:
    // {
    //   id,
    //   x,
    //   y,
    //   laidAtSec,
    //   hatchAtSec,
    //   motherId,
    //   fatherId,
    //   motherTraits,
    //   fatherTraits,
    //   state,         // INCUBATING | HATCHED | FAILED
    //   canBeEaten,    // boolean (FUTURE HOOK: some species may eat eggs)
    //   nutrition      // number  (FUTURE HOOK: hunger/wellbeing effects)
    // }
    this.eggs = [];
    this.bubbles = [];
    this.nextFoodId = 1;
    this.nextFishId = 1;
    this.nextPlaySessionId = 1;
    this.nextEggId = 1;
    this.simTimeSec = 0;
    this.selectedFishId = null;

    this.initialFishCount = normalizedInitialFishCount;
    this.foodsConsumedCount = 0;
    this.filterUnlockThreshold = this.initialFishCount * 4;
    this.filterUnlocked = false;
    this.filterDepletedThreshold01 = FILTER_DEPLETED_THRESHOLD_01;

    // Simple event queue for UI/telemetry/achievements.
    // Use `world.flushEvents()` from main loop if/when needed.
    this.events = [];
    this.playSessions = [];
    this.matePairNextTryAt = new Map();
    this.groundAlgae = [];
    this.fxParticles = [];

    // Global environment state (will grow over time).
    this.water = this.createInitialWaterState();
    this.expiredFoodSinceLastWaterUpdate = 0;

    this.paused = false;
    this.speedMultiplier = 1;

    this.#generateInitialPopulation(this.initialFishCount);
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

  #createFish({ sex, initialAgeSec = 0, hungryStart = false, position = null, traits = null } = {}) {
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

    const explicitPosition = position && Number.isFinite(position.x) && Number.isFinite(position.y);
    let spawn = explicitPosition
      ? { x: position.x, y: position.y, size: birthRadius }
      : this.#randomSpawn(birthRadius);

    if (!explicitPosition) {
      for (let i = 0; i < 20; i += 1) {
        if (this.#isSpawnClear(spawn, birthRadius)) break;
        spawn = this.#randomSpawn(birthRadius);
      }
    }

    spawn.x = clamp(spawn.x, 0, this.bounds.width);
    spawn.y = clamp(spawn.y, 0, this.#swimHeight());

    const normalizedInitialAgeSec = Math.min(Math.max(0, initialAgeSec), INITIAL_MAX_AGE_SEC);

    const fish = new Fish(this.bounds, {
      id: this.nextFishId++,
      spawnTimeSec: this.simTimeSec - normalizedInitialAgeSec,
      sizeFactor,
      growthRate: rand(growthRange.min, growthRange.max),
      lifespanSec,
      stageShiftBabySec,
      stageShiftJuvenileSec,
      position: { x: spawn.x, y: spawn.y },
      headingAngle: this.#randomHeading(),
      speedFactor: rand(0.42, 0.68),
      traits: traits ?? undefined
    });

    if (sex === 'female' || sex === 'male') {
      fish.sex = sex;
    }

    if (hungryStart) {
      const hungryBaseline = 0.5;
      fish.hunger01 = hungryBaseline;
      fish.energy01 = 1 - hungryBaseline;
      fish.hungerState = 'HUNGRY';
    }

    fish.updateLifeCycle(this.simTimeSec);
    return fish;
  }

  #registerFish(fish) {
    if (!fish) return null;
    this.fish.push(fish);
    this.fishById.set(fish.id, fish);
    return fish;
  }

  #rebuildFishById() {
    this.fishById.clear();
    for (const fish of this.fish) this.fishById.set(fish.id, fish);
  }

  #shuffleArray(items) {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const swapIndex = Math.floor(Math.random() * (i + 1));
      [items[i], items[swapIndex]] = [items[swapIndex], items[i]];
    }
  }

  #generateInitialPopulation(totalFishCount) {
    const clampedCount = Math.max(1, Math.min(6, Math.round(totalFishCount)));
    const femaleCount = Math.ceil(clampedCount / 2);
    const maleCount = Math.floor(clampedCount / 2);
    const fishPool = [];

    // Start-population constraints:
    // - balanced sex distribution (female majority by 1 when odd)
    // - random initial ages sampled in [0, INITIAL_MAX_AGE_SEC]
    // - all fish begin hungry and attempts are made to include a mature female
    for (let i = 0; i < femaleCount; i += 1) {
      fishPool.push(this.#createFish({
        sex: 'female',
        initialAgeSec: rand(0, INITIAL_MAX_AGE_SEC),
        hungryStart: true
      }));
    }

    for (let i = 0; i < maleCount; i += 1) {
      fishPool.push(this.#createFish({
        sex: 'male',
        initialAgeSec: rand(0, INITIAL_MAX_AGE_SEC),
        hungryStart: true
      }));
    }

    const hasAdultFemale = fishPool.some((fish) => fish.sex === 'female' && (fish.lifeStage === 'ADULT' || fish.lifeStage === 'OLD'));
    if (!hasAdultFemale) {
      const promotableFemale = fishPool.find((fish) => fish.sex === 'female');
      if (promotableFemale) {
        const baseBabyEnd = AGE_CONFIG.stageBaseSec.babyEndSec;
        const baseJuvenileEnd = AGE_CONFIG.stageBaseSec.juvenileEndSec;
        const babyEnd = Math.max(30, baseBabyEnd + promotableFemale.stageShiftBabySec);
        const juvenileEnd = Math.max(babyEnd + 60, baseJuvenileEnd + promotableFemale.stageShiftJuvenileSec);
        const adultStartAgeSec = juvenileEnd / Math.max(0.001, promotableFemale.growthRate);

        const promotedInitialAgeSec = adultStartAgeSec < INITIAL_MAX_AGE_SEC
          ? rand(adultStartAgeSec, INITIAL_MAX_AGE_SEC)
          : rand(0, INITIAL_MAX_AGE_SEC);

        promotableFemale.spawnTimeSec = this.simTimeSec - promotedInitialAgeSec;
        promotableFemale.updateLifeCycle(this.simTimeSec);
      }
    }

    this.#shuffleArray(fishPool);
    this.fish = fishPool;
    this.#rebuildFishById();

    if (!this.fish.some((f) => f.id === this.selectedFishId)) {
      this.selectedFishId = this.fish[0]?.id ?? null;
    }
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

  // Future hook: edible target discovery.
  // For now, fish can only eat food. Later we may include eggs for certain species/traits.
  getEdibleTargetsForFish(fish) {
    return this.food;
  }

  spawnMatingBubbleBurst(x, y) {
    for (let i = 0; i < 2; i += 1) {
      this.fxParticles.push({
        kind: 'MATING_BUBBLE',
        x: clamp(x + rand(-4, 4), 0, this.bounds.width),
        y: clamp(y + rand(-4, 4), 0, this.#swimHeight()),
        vx: rand(-2.2, 2.2),
        vy: rand(-12, -8),
        radius: rand(1.2, 2.0),
        lifeSec: 0.8,
        ttlSec: 0.8
      });
    }
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
    this.fishById.delete(fishId);
    if (this.selectedFishId === fishId) this.selectedFishId = null;
    return true;
  }

  removeCorpse(fishId) {
    const index = this.fish.findIndex((entry) => entry.id === fishId && entry.lifeState === 'DEAD');
    if (index < 0) return false;

    const fish = this.fish[index];
    fish.corpseRemoved = true;
    this.fish.splice(index, 1);
    this.fishById.delete(fishId);
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
      this.#registerFish(this.#createFish());
    }
    while (this.fish.length > clamped) {
      const removed = this.fish.pop();
      if (removed) this.fishById.delete(removed.id);
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
    this.#updateReproduction(delta);
    for (const fish of this.fish) fish.updateMetabolism(delta, this);
    for (const fish of this.fish) fish.decideBehavior(this, delta);
    for (const fish of this.fish) fish.applySteering(delta);
    for (const fish of this.fish) fish.tryConsumeFood(this);

    this.#updateFishLifeState();
    this.#updateFood(delta);
    this.#updateEggs(delta);
    this.#updateWaterHygiene(delta);
    this.#updateFxParticles(delta);
    this.#updateBubbles(delta);
  }

  createInitialWaterState() {
    return {
      hygiene01: WATER_INITIAL_HYGIENE01,
      dirt01: WATER_INITIAL_DIRT01,
      filterInstalled: false,
      filter01: 0,
      installProgress01: 0,
      maintenanceProgress01: 0,
      maintenanceCooldownSec: 0,
      filterUnlocked: this.filterUnlocked,
      filterEnabled: true,
      effectiveFilter01: 0
    };
  }

  installWaterFilter() {
    const water = this.water;
    if (!water?.filterUnlocked || water.filterInstalled || water.installProgress01 > 0) return false;
    water.installProgress01 = 0.000001;
    return true;
  }


  toggleWaterFilterEnabled() {
    const water = this.water;
    if (!water?.filterInstalled || water.installProgress01 > 0 || water.maintenanceProgress01 > 0) return water?.filterEnabled ?? false;
    water.filterEnabled = !water.filterEnabled;
    return water.filterEnabled;
  }

  maintainWaterFilter() {
    const water = this.water;
    if (!water?.filterInstalled) return false;
    if (water.installProgress01 > 0 || water.maintenanceProgress01 > 0 || water.maintenanceCooldownSec > 0) return false;
    water.maintenanceProgress01 = 0.000001;
    return true;
  }

  #updateWaterHygiene(dtSec) {
    const expiredFoodCount = this.expiredFoodSinceLastWaterUpdate;
    this.expiredFoodSinceLastWaterUpdate = 0;

    if (!Number.isFinite(dtSec) || dtSec <= 0) return;

    for (let i = this.fish.length - 1; i >= 0; i -= 1) {
      const fish = this.fish[i];
      if (fish.lifeState !== 'DEAD' || fish.corpseRemoved) continue;

      if (fish.deadAtSec == null) fish.deadAtSec = this.simTimeSec;

      const ageDeadSec = Math.max(0, this.simTimeSec - fish.deadAtSec);
      let targetContribution = 0;

      if (ageDeadSec >= CORPSE_GRACE_SEC) {
        const minutesAfterGrace = Math.floor((ageDeadSec - CORPSE_GRACE_SEC) / CORPSE_DIRT_STEP_SEC);
        targetContribution = clamp(CORPSE_DIRT_INITIAL01 + CORPSE_DIRT_STEP01 * minutesAfterGrace, 0, CORPSE_DIRT_MAX01);
      }

      const alreadyApplied = clamp(fish.corpseDirtApplied01 ?? 0, 0, CORPSE_DIRT_MAX01);
      const delta = targetContribution - alreadyApplied;
      if (delta > 0) {
        this.water.dirt01 = clamp(this.water.dirt01 + delta, 0, 1);
        fish.corpseDirtApplied01 = targetContribution;
      }

      if (fish.corpseDirtApplied01 >= CORPSE_DIRT_MAX01) {
        fish.corpseRemoved = true;
        this.fish.splice(i, 1);
        this.fishById.delete(fish.id);
        if (this.selectedFishId === fish.id) this.selectedFishId = null;
      }
    }

    const fishCount = this.fish.length;
    const bioload = fishCount / WATER_REFERENCE_FISH_COUNT;
    const water = this.water;

    water.filterUnlocked = this.filterUnlocked;

    if (water.installProgress01 > 0 && !water.filterInstalled) {
      water.installProgress01 = clamp(water.installProgress01 + dtSec / FILTER_INSTALL_DURATION_SEC, 0, 1);
      if (water.installProgress01 >= 1) {
        water.filterInstalled = true;
        water.filterEnabled = true;
        water.filter01 = 1;
        water.installProgress01 = 0;
      }
    }

    if (water.maintenanceCooldownSec > 0) {
      water.maintenanceCooldownSec = Math.max(0, water.maintenanceCooldownSec - dtSec);
    }

    if (water.maintenanceProgress01 > 0) {
      water.maintenanceProgress01 = clamp(water.maintenanceProgress01 + dtSec / FILTER_MAINTENANCE_DURATION_SEC, 0, 1);
      if (water.maintenanceProgress01 >= 1) {
        water.filter01 = FILTER_MAINTENANCE_RESTORE_TO_01;
        water.maintenanceProgress01 = 0;
        water.maintenanceCooldownSec = FILTER_MAINTENANCE_COOLDOWN_SEC;
      }
    }

    const isMaintaining = water.maintenanceProgress01 > 0;
    const hasWorkingFilter = water.filterInstalled
      && water.filterEnabled
      && !isMaintaining
      && water.filter01 > FILTER_DEPLETED_THRESHOLD_01;
    const effectiveFilter01 = hasWorkingFilter ? water.filter01 : 0;
    water.effectiveFilter01 = effectiveFilter01;

    const effectiveBioload = clamp(
      bioload * (1 - effectiveFilter01 * FILTER_BIOLOAD_MITIGATION_FACTOR),
      0,
      Math.max(0, bioload)
    );

    const bioloadDirt = WATER_BIOLOAD_DIRT_PER_SEC * bioload * dtSec;
    const expiredFoodDirt = expiredFoodCount * WATER_DIRT_PER_EXPIRED_FOOD;
    water.dirt01 = clamp(water.dirt01 + bioloadDirt + expiredFoodDirt, 0, 1);

    const removedDirt = FILTER_DIRT_REMOVE_PER_SEC * effectiveFilter01 * dtSec;
    water.dirt01 = clamp(water.dirt01 - removedDirt, 0, 1);

    if (water.filterInstalled) {
      const wearRate = FILTER_WEAR_BASE_PER_SEC
        * (1 + FILTER_WEAR_BIOLOAD_FACTOR * bioload)
        * (1 + FILTER_WEAR_DIRT_FACTOR * water.dirt01);
      water.filter01 = clamp(water.filter01 - wearRate * dtSec, 0, 1);
    }

    const dirtMultiplier = 1 + water.dirt01 * WATER_DIRT_TO_DECAY_MULTIPLIER;
    const baselineDecay = WATER_BASELINE_DECAY_PER_SEC * effectiveBioload * dirtMultiplier * dtSec;
    const hygieneRecovery = WATER_BASELINE_DECAY_PER_SEC * Math.max(0, bioload - effectiveBioload) * dtSec;
    water.hygiene01 = clamp(water.hygiene01 - baselineDecay + hygieneRecovery, 0, 1);
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


  #isMateEligible(fish, nowSec) {
    if (!fish || fish.lifeState !== 'ALIVE') return false;
    if (fish.lifeStage !== 'ADULT') return false;
    if (fish.hungerState !== 'FED') return false;
    if ((fish.wellbeing01 ?? 0) < MATE_MIN_WELLBEING) return false;
    if ((this.water?.hygiene01 ?? 0) < MATE_MIN_HYGIENE) return false;
    if (!fish.repro) return false;
    if (fish.repro.state !== 'READY') return false;
    if (nowSec < (fish.repro.cooldownUntilSec ?? 0)) return false;
    return true;
  }

  #tryMatePair(a, b, nowSec) {
    if (a.sex === b.sex) return;
    if (!this.#isMateEligible(a, nowSec) || !this.#isMateEligible(b, nowSec)) return;

    const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
    const nextTryAt = this.matePairNextTryAt.get(key) ?? 0;
    if (nowSec < nextTryAt) return;
    this.matePairNextTryAt.set(key, nowSec + MATE_PAIR_RETRY_MIN_SEC);

    const hygiene = clamp01(this.water?.hygiene01 ?? 1);
    const t = clamp01((hygiene - 0.60) / 0.40);
    const hygieneFactor = 0.5 + 0.5 * t;
    const w = Math.min(a.wellbeing01 ?? 0, b.wellbeing01 ?? 0);
    const u = clamp01((w - 0.80) / 0.20);
    const wellbeingFactor = 0.6 + 0.4 * u;
    const pMate = MATE_BASE_CHANCE * hygieneFactor * wellbeingFactor;

    if (Math.random() >= pMate) return;

    const female = a.sex === 'female' ? a : b;
    const male = a.sex === 'male' ? a : b;

    female.repro.state = 'GRAVID';
    female.repro.fatherId = male.id;
    female.repro.pregnancyStartSec = nowSec;
    female.repro.dueAtSec = nowSec + randRange(GESTATION_SEC, 300, 360);
    female.repro.layingStartedAtSec = null;
    female.repro.layTargetX = null;
    female.repro.layTargetY = null;

    male.repro.cooldownUntilSec = nowSec + randRange(MATE_FATHER_COOLDOWN_SEC, 120, 240);

    female.matingAnim = {
      startSec: nowSec,
      durationSec: 1.1,
      partnerId: male.id,
      bubbleBurstDone: false
    };
    male.matingAnim = {
      startSec: nowSec,
      durationSec: 1.1,
      partnerId: female.id,
      bubbleBurstDone: false
    };
  }

  #layEggClutch(female, nowSec) {
    const father = this.fish.find((f) => f.id === female.repro.fatherId) ?? null;
    const motherTraits = { ...(female.traits ?? {}) };
    const fatherTraits = father?.traits ? { ...father.traits } : { ...motherTraits };
    const clutchCount = Math.max(1, randIntInclusive(CLUTCH_SIZE, 1, 2));

    for (let i = 0; i < clutchCount; i += 1) {
      const x = clamp(female.position.x + rand(-6, 6), 0, this.bounds.width);
      const y = clamp(female.position.y + rand(-4, 4), 0, this.#swimHeight());
      this.eggs.push({
        id: this.nextEggId++,
        x,
        y,
        laidAtSec: nowSec,
        hatchAtSec: nowSec + randRange(EGG_INCUBATION_SEC, 120, 300),
        motherId: female.id,
        fatherId: female.repro.fatherId,
        motherTraits,
        fatherTraits,
        state: 'INCUBATING',
        canBeEaten: true,
        nutrition: 0.25
      });
    }

    female.repro.state = 'COOLDOWN';
    female.repro.cooldownUntilSec = nowSec + randRange(MOTHER_COOLDOWN_SEC, 600, 1080);
    female.repro.dueAtSec = null;
    female.repro.fatherId = null;
    female.repro.layTargetX = null;
    female.repro.layTargetY = null;
    female.repro.pregnancyStartSec = null;
    female.repro.layingStartedAtSec = null;
  }

  #updateReproduction(dt) {
    if (!REPRO_ENABLED || !Number.isFinite(dt) || dt <= 0) return;
    const nowSec = this.simTimeSec;

    for (let i = 0; i < this.fish.length; i += 1) {
      const a = this.fish[i];
      if (a.lifeState !== 'ALIVE') continue;
      for (let j = i + 1; j < this.fish.length; j += 1) {
        const b = this.fish[j];
        if (b.lifeState !== 'ALIVE') continue;
        const dist = Math.hypot(a.position.x - b.position.x, a.position.y - b.position.y);
        if (dist > MATE_ENCOUNTER_RADIUS_PX) continue;
        this.#tryMatePair(a, b, nowSec);
      }
    }

    const layTargetY = Math.max(0, this.#swimHeight() - 14);

    for (const fish of this.fish) {
      if (!fish.repro || fish.lifeState !== 'ALIVE' || fish.sex !== 'female') continue;

      if (fish.repro.state === 'GRAVID' && nowSec >= (fish.repro.dueAtSec ?? Infinity)) {
        fish.repro.state = 'LAYING';
        fish.repro.layTargetX = clamp(fish.position.x + rand(-20, 20), 0, this.bounds.width);
        fish.repro.layTargetY = layTargetY;
        fish.repro.layingStartedAtSec = nowSec;
      }

      if (fish.repro.state === 'LAYING') {
        const tx = Number.isFinite(fish.repro.layTargetX) ? fish.repro.layTargetX : fish.position.x;
        const ty = Number.isFinite(fish.repro.layTargetY) ? fish.repro.layTargetY : layTargetY;
        const d = Math.hypot(fish.position.x - tx, fish.position.y - ty);
        if (d <= 10) this.#layEggClutch(fish, nowSec);
      }

      if (fish.repro.state === 'COOLDOWN' && nowSec >= (fish.repro.cooldownUntilSec ?? 0)) {
        fish.repro.state = 'READY';
      }
    }
  }


  #updateFishLifeState() {
    for (let i = this.fish.length - 1; i >= 0; i -= 1) {
      const fish = this.fish[i];
      if (fish.lifeState === 'DEAD') {
        if (fish.deadAtSec == null) fish.deadAtSec = this.simTimeSec;
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


  #updateFxParticles(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;

    for (let i = this.fxParticles.length - 1; i >= 0; i -= 1) {
      const p = this.fxParticles[i];
      p.ttlSec -= dt;
      p.x = clamp(p.x + p.vx * dt, 0, this.bounds.width);
      p.y = clamp(p.y + p.vy * dt, 0, this.#swimHeight());
      if (p.ttlSec <= 0) this.fxParticles.splice(i, 1);
    }
  }

  #updateEggs(dt) {
    if (!Number.isFinite(dt) || dt <= 0) return;

    const nowSec = this.simTimeSec;
    const hygiene01 = clamp01(this.water?.hygiene01 ?? 1);

    for (let i = this.eggs.length - 1; i >= 0; i -= 1) {
      const egg = this.eggs[i];
      if (!egg || nowSec < (egg.hatchAtSec ?? Infinity)) continue;

      let hatchChance = 0;
      if (hygiene01 >= MATE_MIN_HYGIENE) {
        const t = clamp01((hygiene01 - 0.60) / 0.40);
        hatchChance = 0.25 + 0.75 * (t * t);
      }
      hatchChance = clamp01(Math.max(HATCH_FLOOR, hatchChance));

      const success = Math.random() < hatchChance;
      if (success) {
        const spawnX = clamp(Number.isFinite(egg.x) ? egg.x : this.bounds.width * 0.5, 0, this.bounds.width);
        const spawnY = clamp(Number.isFinite(egg.y) ? egg.y : this.#swimHeight() * 0.5, 0, this.#swimHeight());

        const babyTraits = inheritTraits(
          egg.motherTraits,
          egg.fatherTraits,
          REPRO_CONFIG
        );

        const baby = this.#createFish({
          initialAgeSec: 0,
          position: { x: spawnX, y: spawnY },
          traits: babyTraits
        });
        baby.spawnTimeSec = this.simTimeSec;
        baby.ageSecCached = 0;
        this.#registerFish(baby);
        egg.state = 'HATCHED';
      } else {
        egg.state = 'FAILED';
      }

      this.eggs.splice(i, 1);
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
