/**
 * Centralized configuration for the aquarium simulation.
 *
 * Goal: keep tuning knobs in one place so new systems (poop, hygiene, age,
 * reproduction) can be added without scattering constants across files.
 */

export const CONFIG = Object.freeze({
  reproduction: {
    REPRO_ENABLED: true,

    // Encounter + mating
    MATE_ENCOUNTER_RADIUS_PX: 70,
    MATE_PAIR_RETRY_MIN_SEC: 25,
    MATE_BASE_CHANCE: 0.08,
    MATE_FATHER_COOLDOWN_SEC: [120, 240],

    MATE_MIN_WELLBEING: 0.80,
    MATE_MIN_HYGIENE: 0.60,

    // Gestation + eggs
    GESTATION_SEC: [360, 600],
    EGG_INCUBATION_SEC: [120, 300],
    MOTHER_COOLDOWN_SEC: [600, 1080],
    CLUTCH_SIZE: [1, 2],

    // Genetics
    TRAIT_MUTATION_PCT: 0.05
  },

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
      hygiene01: 1,
      dirt01: 0,
      referenceFishCount: 20,
      baselineDecayPerSec: 0.0002,
      bioloadDirtPerSec: 0.00035,
      dirtPerExpiredFood: 0.015,
      dirtToDecayMultiplier: 3,
      filterDirtRemovePerSec: 0.0006,
      wearBasePerSec: 0.00005,
      wearBioloadFactor: 1.0,
      wearDirtFactor: 2.5,
      bioloadMitigationFactor: 0.6,
      filterDepletedThreshold01: 0.1,
      installDurationSec: 12,
      maintenanceDurationSec: 12,
      maintenanceCooldownSec: 25,
      maintenanceRestoreTo01: 1.0
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
        // Tuned for 1200x700 tank: hungry fish should notice pellets from mid-range,
        // starving fish should notice from across most of the tank.
        HUNGRY: 320,
        STARVING: 650
      },
      foodSpeedBoost: {
        HUNGRY: 1.3,
        STARVING: 1.6
      },
      // Extra steering weight when actively seeking food (so wall avoidance doesn't
      // make hungry fish look "meh" about pellets).
      seekForceMultiplier: 2.4
    }
    ,

    // Life cycle & growth (age-driven growth + small per-fish randomness).
    age: {
      // Target average lifespan for the default fish type (realtime seconds).
      lifespanMeanSec: 90 * 60,
      // +/- jitter around the mean lifespan.
      lifespanJitterSec: 15 * 60,

      // Stage boundaries (base values) in realtime seconds from birth.
      // Each fish gets a small per-fish jitter so they don't all sync.
      stageBaseSec: {
        babyEndSec: 10 * 60,
        juvenileEndSec: 25 * 60
      },
      stageJitterSec: 3 * 60,

      // Old stage starts at this fraction of lifespan.
      oldStartRatio: 0.85,

      // Cap for randomized initial spawn age at game start (20 minutes).
      INITIAL_MAX_AGE_SEC: 1200
    },

    growth: {
      // Overall adult visual radius baseline (before per-fish sizeFactor).
      adultRadius: 22,
      // How small babies should be at birth (relative to adult size).
      birthScale: 0.28,

      // Per-fish variation so individuals don't look identical.
      sizeFactorRange: { min: 0.9, max: 1.1 },
      growthRateRange: { min: 0.9, max: 1.1 }
    },

    // Simple age-based morph targets for proportions (renderer uses these).
    // Values are relative multipliers around the "adult" baseline.
    morph: {
      BABY:     { bodyLength: 0.85, bodyHeight: 1.12, tailLength: 0.72, eye: 1.18, saturation: 0.85, lightness: 1.03 },
      JUVENILE: { bodyLength: 0.95, bodyHeight: 1.03, tailLength: 0.88, eye: 1.06, saturation: 0.93, lightness: 1.01 },
      ADULT:    { bodyLength: 1.00, bodyHeight: 1.00, tailLength: 1.00, eye: 1.00, saturation: 1.00, lightness: 1.00 },
      OLD:      { bodyLength: 1.03, bodyHeight: 0.92, tailLength: 0.95, eye: 0.98, saturation: 0.88, lightness: 0.96 }
    },

    // Stage-specific baseline speed multipliers (hunger still applies on top).
    stageSpeed: {
      BABY: 0.82,
      JUVENILE: 1.04,
      ADULT: 1.0,
      OLD: 0.88
    },

    waterWellbeing: {
      stressStartHygiene01: 0.7,
      stressCurvePower: 1.35,
      stressPerSec: 0.0012,
      ageSensitivityMin: 1,
      ageSensitivityEdgeBoost: 0.6
    },

  }
});
