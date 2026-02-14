/**
 * World simulation container.
 * Responsibility: hold fish + bubble state and update simulation with delta time.
 */

import { Fish } from './fish.js';

const rand = (min, max) => min + Math.random() * (max - min);

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
    this.bounds = { width, height };
    this.fish = [];
    this.bubbles = [];

    this.paused = false;
    this.speedMultiplier = 1;

    this.setFishCount(initialFishCount);
    this.#seedBubbles();
  }

  resize(width, height) {
    this.bounds.width = width;
    this.bounds.height = height;

    for (const fish of this.fish) fish.setBounds(this.bounds);
    for (const bubble of this.bubbles) {
      bubble.x = Math.min(Math.max(0, bubble.x), width);
      bubble.y = Math.min(Math.max(0, bubble.y), height + 40);
    }
  }

  setFishCount(count) {
    const clamped = Math.max(1, Math.min(50, Math.round(count)));

    while (this.fish.length < clamped) {
      this.fish.push(new Fish(this.bounds));
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

    for (const fish of this.fish) fish.update(delta);
    this.#updateBubbles(delta);

    // TODO: Phase 2 - add hunger/metabolism update tick here.
  }

  #seedBubbles() {
    const count = 36;
    this.bubbles = Array.from({ length: count }, () => makeBubble(this.bounds));
  }

  #updateBubbles(delta) {
    const { width, height } = this.bounds;

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
