/**
 * World simulation container.
 * Responsibility: hold fish + bubble state and update simulation with delta time.
 */

import { Fish } from './fish.js';

const MAX_TILT = Math.PI / 3;
const rand = (min, max) => min + Math.random() * (max - min);
const clamp = (v, min, max) => Math.max(min, Math.min(max, v));
const FOOD_DEFAULT_AMOUNT = 1;
const FOOD_DEFAULT_TTL = 55;

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
    this.bounds = { width, height, sandHeight: this.#computeSandHeight(height) };
    this.fish = [];
    this.food = [];
    this.bubbles = [];
    this.nextFoodId = 1;

    this.paused = false;
    this.speedMultiplier = 1;

    this.setFishCount(initialFishCount);
    this.#seedBubbles();
  }


  #computeSandHeight(height) {
    const raw = height * 0.13;
    return clamp(raw, 26, 78);
  }

  #swimHeight() {
    return Math.max(40, this.bounds.height - this.bounds.sandHeight);
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
    const size = rand(14, 30);
    let spawn = this.#randomSpawn(size);

    for (let i = 0; i < 20; i += 1) {
      if (this.#isSpawnClear(spawn, size)) break;
      spawn = this.#randomSpawn(size);
    }

    return new Fish(this.bounds, {
      size,
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
  }


  spawnFood(x, y, amount = FOOD_DEFAULT_AMOUNT, ttl = FOOD_DEFAULT_TTL) {
    const clampedX = clamp(x, 0, this.bounds.width);
    const clampedY = clamp(y, 0, this.#swimHeight());

    this.food.push({
      id: this.nextFoodId++,
      x: clampedX,
      y: clampedY,
      amount: Math.max(0.1, amount),
      ttl
    });
  }

  consumeFood(foodId, amountToConsume = 0.5) {
    const food = this.food.find((entry) => entry.id === foodId);
    if (!food) return 0;

    const consumed = Math.min(food.amount, Math.max(0.05, amountToConsume));
    food.amount -= consumed;
    if (food.amount <= 0.001) {
      this.food = this.food.filter((entry) => entry.id !== foodId);
    }

    return consumed;
  }

  setFishCount(count) {
    const clamped = Math.max(1, Math.min(50, Math.round(count)));

    while (this.fish.length < clamped) {
      this.fish.push(this.#createFish());
    }
    while (this.fish.length > clamped) {
      this.fish.pop();
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

    for (const fish of this.fish) fish.updateMetabolism(delta);
    for (const fish of this.fish) fish.decideBehavior(this, delta);
    for (const fish of this.fish) fish.applySteering(delta);
    for (const fish of this.fish) fish.tryConsumeFood(this);

    this.#updateFood(delta);
    this.#updateBubbles(delta);
  }


  #updateFood(delta) {
    for (let i = this.food.length - 1; i >= 0; i -= 1) {
      const item = this.food[i];
      if (Number.isFinite(item.ttl)) item.ttl -= delta;
      if (Number.isFinite(item.ttl) && item.ttl <= 0) this.food.splice(i, 1);
    }
  }

  #seedBubbles() {
    const count = 36;
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
