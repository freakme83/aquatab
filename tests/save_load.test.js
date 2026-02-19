import test from 'node:test';
import assert from 'node:assert/strict';

import { World } from '../src/engine/world.js';

function withStubbedRandom(value, fn) {
  const original = Math.random;
  Math.random = () => value;
  try {
    return fn();
  } finally {
    Math.random = original;
  }
}

function makeWorldForTest({ width = 800, height = 500, initialFishCount = 4, randomValue = 0.42 } = {}) {
  return withStubbedRandom(randomValue, () => new World(width, height, initialFishCount));
}

function roundTrip(world) {
  const payload = {
    saveVersion: 1,
    savedAtEpochMs: Date.now(),
    worldState: world.toJSON()
  };

  return withStubbedRandom(0.33, () => World.fromJSON(payload, {
    width: world.bounds.width,
    height: world.bounds.height,
    initialFishCount: world.initialFishCount
  }));
}

function forceFishAliveAdultFed(fish) {
  fish.lifeState = 'ALIVE';
  fish.lifeStage = 'ADULT';
  fish.hungerState = 'FED';
  fish.wellbeing01 = 1;
  fish.energy01 = 1;
  fish.hunger01 = 0;
}

test('basic world round-trip preserves core entities and indexes', () => {
  const world = makeWorldForTest();
  world.simTimeSec = 321.5;
  world.realTimeSec = 654.25;
  world.spawnFood(120, 100, 0.8, 99);
  world.spawnFood(130, 110, 0.7, 88);
  world.eggs.push({
    id: world.nextEggId++,
    x: 200,
    y: 210,
    laidAtSec: 10,
    hatchAtSec: 999,
    motherId: world.fish[0].id,
    fatherId: world.fish[1]?.id ?? null,
    motherTraits: { ...world.fish[0].traits },
    fatherTraits: { ...(world.fish[1]?.traits ?? world.fish[0].traits) },
    state: 'INCUBATING',
    canBeEaten: true,
    nutrition: 0.25
  });

  const world2 = roundTrip(world);

  assert.equal(world2.simTimeSec, world.simTimeSec);
  assert.equal(world2.realTimeSec, world.realTimeSec);
  assert.equal(world2.fish.length, world.fish.length);
  assert.equal(world2.eggs.length, world.eggs.length);
  assert.equal(world2.food.length, world.food.length);

  const fishIds = world2.fish.map((fish) => fish.id);
  assert.equal(new Set(fishIds).size, fishIds.length, 'fish IDs should remain unique');
  for (const fishId of fishIds) {
    assert.ok(world2.getFishById(fishId), `fishById missing fish ${fishId}`);
  }
});

test('GRAVID state persists and progresses after load', () => {
  const world = makeWorldForTest();
  const female = world.fish.find((f) => f.sex === 'female') ?? world.fish[0];
  const male = world.fish.find((f) => f.id !== female.id) ?? world.fish[1];

  forceFishAliveAdultFed(female);
  forceFishAliveAdultFed(male);
  male.sex = 'male';
  female.sex = 'female';
  world.water.hygiene01 = 1;

  female.repro.state = 'GRAVID';
  female.repro.fatherId = male.id;
  female.repro.pregnancyStartSec = 100;
  female.repro.dueAtSec = 430;
  world.simTimeSec = 120;

  const world2 = roundTrip(world);
  const loadedFemale = world2.getFishById(female.id);

  assert.ok(loadedFemale);
  assert.equal(loadedFemale.repro.state, 'GRAVID');
  assert.equal(loadedFemale.repro.fatherId, male.id);
  assert.equal(loadedFemale.repro.pregnancyStartSec, 100);
  assert.equal(loadedFemale.repro.dueAtSec, 430);

  world2.simTimeSec = 431;
  world2.update(0.01);

  const progressedFemale = world2.getFishById(female.id);
  assert.ok(
    progressedFemale.repro.state === 'LAYING' || world2.eggs.length > 0,
    `expected LAYING or eggs after due date, got state=${progressedFemale.repro.state}`
  );
});

test('LAYING state and lay target persist', () => {
  const world = makeWorldForTest();
  const female = world.fish.find((f) => f.sex === 'female') ?? world.fish[0];

  forceFishAliveAdultFed(female);
  female.sex = 'female';
  female.repro.state = 'LAYING';
  female.repro.layTargetX = 222;
  female.repro.layTargetY = 333;

  const world2 = roundTrip(world);
  const loadedFemale = world2.getFishById(female.id);

  assert.ok(loadedFemale);
  assert.equal(loadedFemale.repro.state, 'LAYING');
  assert.equal(loadedFemale.repro.layTargetX, 222);
  assert.equal(loadedFemale.repro.layTargetY, 333);
});

test('egg incubation data persists and hatches after due time', () => {
  const world = makeWorldForTest();
  const mother = world.fish[0];
  const father = world.fish[1] ?? mother;

  world.simTimeSec = 20;
  world.water.hygiene01 = 1;
  world.eggs.push({
    id: world.nextEggId++,
    x: 250,
    y: 260,
    laidAtSec: 20,
    hatchAtSec: 30,
    motherId: mother.id,
    fatherId: father.id,
    motherTraits: { ...mother.traits },
    fatherTraits: { ...father.traits },
    state: 'INCUBATING',
    canBeEaten: true,
    nutrition: 0.25
  });

  const world2 = roundTrip(world);
  assert.equal(world2.eggs.length, 1);
  assert.equal(world2.eggs[0].hatchAtSec, 30);

  const fishCountBefore = world2.fish.length;
  world2.simTimeSec = 31;
  withStubbedRandom(0, () => world2.update(0.01));

  assert.equal(world2.eggs.length, 0, 'egg should be consumed by hatch resolution');
  assert.equal(world2.fish.length, fishCountBefore + 1, 'hatch should spawn one baby fish');

  const baby = world2.fish[world2.fish.length - 1];
  assert.equal(baby.ageSecCached, 0);
  assert.equal(baby.history.bornInAquarium, true);
});

test('dead fish state and reason persist', () => {
  const world = makeWorldForTest();
  const fish = world.fish[0];

  fish.lifeState = 'DEAD';
  fish.deathReason = 'OLD_AGE';
  fish.history.deathSimTimeSec = 123.4;

  const world2 = roundTrip(world);
  const loadedFish = world2.getFishById(fish.id);

  assert.ok(loadedFish);
  assert.equal(loadedFish.lifeState, 'DEAD');
  assert.equal(loadedFish.deathReason, 'OLD_AGE');
  assert.equal(loadedFish.history.deathSimTimeSec, 123.4);
});

test('name uniqueness and next-id counters remain valid after load', () => {
  const world = makeWorldForTest();
  world.fish[0].name = 'Alice';
  world.fish[1].name = 'Alice (2)';

  const maxFishIdBefore = Math.max(...world.fish.map((fish) => fish.id));
  const world2 = roundTrip(world);

  const uniqueAlice = world2.makeUniqueName('Alice');
  assert.equal(uniqueAlice, 'Alice (3)');

  world2.setFishCount(world2.fish.length + 1);
  const maxFishIdAfter = Math.max(...world2.fish.map((fish) => fish.id));
  assert.ok(maxFishIdAfter > maxFishIdBefore);
  assert.equal(new Set(world2.fish.map((fish) => fish.id)).size, world2.fish.length);
});

test('corrupted save input is safe and clamps positions', () => {
  const world = makeWorldForTest();

  assert.doesNotThrow(() => {
    world.loadFromJSON({
      saveVersion: 1,
      simTimeSec: 10,
      fish: null,
      eggs: null,
      food: null,
      water: {}
    });
  });

  assert.equal(world.fish.length, 0);
  assert.equal(world.eggs.length, 0);
  assert.equal(world.food.length, 0);

  const world2 = makeWorldForTest({ width: 400, height: 300 });
  const snap = world2.toJSON();
  snap.fish[0].position = { x: -1000, y: 9999 };
  snap.food.push({ id: 999, x: -5, y: 9999, amount: 1, ttl: 1, vy: 1 });
  snap.eggs.push({
    id: 888,
    x: 9999,
    y: -999,
    laidAtSec: 0,
    hatchAtSec: 100,
    motherId: null,
    fatherId: null,
    motherTraits: {},
    fatherTraits: {},
    state: 'INCUBATING',
    canBeEaten: true,
    nutrition: 0.25
  });

  const loaded = World.fromJSON(snap, {
    width: 400,
    height: 300,
    initialFishCount: 4
  });

  const fish = loaded.fish[0];
  assert.ok(fish.position.x >= 0 && fish.position.x <= loaded.bounds.width);
  assert.ok(fish.position.y >= 0 && fish.position.y <= loaded.bounds.height);

  const food = loaded.food.find((f) => f.id === 999);
  assert.ok(food.x >= 0 && food.x <= loaded.bounds.width);
  assert.ok(food.y >= 0 && food.y <= loaded.bounds.height);

  const egg = loaded.eggs.find((e) => e.id === 888);
  assert.ok(egg.x >= 0 && egg.x <= loaded.bounds.width);
  assert.ok(egg.y >= 0 && egg.y <= loaded.bounds.height);
});



test('world update splits motion and lifecycle deltas', () => {
  const world = makeWorldForTest();
  world.setSpeedMultiplier(1);

  world.spawnFood(100, 100, 1, 1);

  const startSimTime = world.simTimeSec;
  const startRealTime = world.realTimeSec;

  world.update(1);

  assert.equal(world.realTimeSec, startRealTime + 1);
  assert.equal(world.simTimeSec, startSimTime + 0.5);
  assert.equal(world.food[0].ttl, 0.5, 'food ttl should advance by lifeDt');
});


test('speed multiplier affects motion/life dt and persists through save-load', () => {
  const world = makeWorldForTest();
  world.setSpeedMultiplier(2);

  const simStart = world.simTimeSec;
  const realStart = world.realTimeSec;

  world.update(1);

  assert.equal(world.realTimeSec, realStart + 1);
  assert.equal(world.simTimeSec, simStart + 1, 'lifeDt should be rawDelta * speed * baseLifeScale');
  assert.equal(world.debugTiming.motionDt, 2);
  assert.equal(world.debugTiming.lifeDt, 1);

  const loaded = roundTrip(world);
  assert.equal(loaded.speedMultiplier, 2);

  const loadedSimStart = loaded.simTimeSec;
  const loadedRealStart = loaded.realTimeSec;
  loaded.update(1);

  assert.equal(loaded.realTimeSec, loadedRealStart + 1);
  assert.equal(loaded.simTimeSec, loadedSimStart + 1);
  assert.equal(loaded.debugTiming.motionDt, 2);
  assert.equal(loaded.debugTiming.lifeDt, 1);
});
