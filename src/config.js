/**
 * Centralized configuration for the aquarium simulation.
 *
 * Goal: keep tuning knobs in one place so new systems (poop, hygiene, age,
 * reproduction) can be added without scattering constants across files.
 */

export const CONFIG = Object.freeze({
  world: {
    maxTiltRad: Math.PI / 3,
    food: {
      defaultAmount: 1,
      defaultTtlSec: 120,
      fallAccel: 8,
      fallDamping: 0.15,
      maxFallSpeed: 26
    },
    fishLifecycle: {
      deadToSkeletonSec: 120,
      skeletonToRemoveSec: 120
    },
    bubbles: {
      seedCount: 36
    },
    // Placeholder for future global systems.
    water: {
      hygiene01: 1
    }
  },

  fish: {
    tau: Math.PI * 2,
    maxTiltRad: Math.PI / 3,
    targetReachedRadius: 18,
    faceSwitchCos: 0.2,
    maxTurnRate: 1.45,
    desiredTurnRate: 2.1,
    speedMultiplier: 1.5,
    foodReachRadius: 14,
    deadSinkSpeed: 30,

    metabolism: {
      costPerPixel: 0.00004
    },
    hunger: {
      hungryThreshold: 0.35,
      starvingThreshold: 0.72,
      foodVisionRadius: {
        HUNGRY: 320,
        STARVING: 650
      },
      foodSpeedBoost: {
        HUNGRY: 1.3,
        STARVING: 1.6
      },
      // One pellet is consumed instantly, but only partially reduces hunger.
      // Energy increase applied per pellet (0..1).
      satietyPerPellet: 0.55,
      // Multiplier applied to the seek steering vector when targeting food.
      seekForceMultiplier: 2.6
    }
  }
});
