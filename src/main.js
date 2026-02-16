/**
 * App bootstrap and animation loop.
 * Responsibility: wire world + renderer + panel and run RAF.
 *
 * Important: Browsers throttle RAF/timers in background tabs. We emulate continuity by:
 *  - saving state when the tab is hidden/unloaded
 *  - computing offline elapsed when returning
 *  - catching up smoothly (fast-forward) instead of snapping in one frame
 */

import { World } from './engine/world.js';
import { Renderer } from './render/renderer.js';
import { Panel } from './ui/panel.js';

const INITIAL_FISH_COUNT = 20;

// Offline continuity (design choice per your request)
const OFFLINE_CAP_SEC = 60 * 60;           // 1 hour
const CATCHUP_FIXED_STEP_SEC = 0.1;        // simulation step for catch-up (stable physics)
const CATCHUP_MAX_SIM_PER_FRAME_SEC = 5.0; // how much sim-time we can process per RAF frame while catching up
const STATE_STORAGE_KEY = 'aquatab_state_v1';

const canvas = document.getElementById('aquariumCanvas');
const panelRoot = document.getElementById('panelRoot');
const tankShell = canvas.closest('.tank-shell');

function measureCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  const hostRect = tankShell?.getBoundingClientRect();

  return {
    width: Math.max(1, Math.floor(rect.width || hostRect?.width || canvas.clientWidth || 1)),
    height: Math.max(1, Math.floor(rect.height || hostRect?.height || canvas.clientHeight || 1))
  };
}

function loadSavedState() {
  try {
    const raw = localStorage.getItem(STATE_STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveState(world) {
  try {
    localStorage.setItem(STATE_STORAGE_KEY, JSON.stringify(world.serialize()));
  } catch {
    // ignore quota / privacy mode
  }
}

const initialSize = measureCanvasSize();
const saved = loadSavedState();

let world;
let catchUpRemainingSec = 0;

if (saved) {
  world = World.deserialize(initialSize.width, initialSize.height, saved);

  // Smooth catch-up from the last saved timestamp, capped at 1 hour.
  const savedAtMs = saved.savedAtMs ?? null;
  if (savedAtMs) {
    const offlineSec = Math.max(0, (Date.now() - savedAtMs) / 1000);
    catchUpRemainingSec = Math.min(OFFLINE_CAP_SEC, offlineSec);
  }
} else {
  world = new World(initialSize.width, initialSize.height, INITIAL_FISH_COUNT);
}

const renderer = new Renderer(canvas, world);
const debugBounds = new URLSearchParams(window.location.search).get('debugBounds') === '1';
renderer.setDebugBounds(debugBounds);

let quality = 'high';

const panel = new Panel(panelRoot, {
  onFishCountChange: (value) => world.setFishCount(value),
  onSpeedChange: (value) => world.setSpeedMultiplier(value),
  onPauseToggle: () => world.togglePause(),
  onQualityToggle: () => {
    quality = quality === 'high' ? 'low' : 'high';
    renderer.setQuality(quality);
    return quality;
  },
  onFishSelect: (fishId) => world.toggleFishSelection(fishId),
  onFishRename: (fishId, name) => world.renameFish(fishId, name),
  onFishDiscard: (fishId) => world.discardFish(fishId)
});

renderer.setQuality(quality);

canvas.addEventListener('click', (event) => {
  const worldPoint = renderer.toWorldPoint(event.clientX, event.clientY);
  if (!worldPoint) return;

  const clickedFish = world.findFishAt(worldPoint.x, worldPoint.y);
  if (clickedFish) {
    world.toggleFishSelection(clickedFish.id);
    panel.selectTab('fish');
    return;
  }

  world.spawnFood(worldPoint.x, worldPoint.y);
});

panel.sync({
  fishCount: world.fish.length,
  speedMultiplier: world.speedMultiplier,
  paused: world.paused,
  quality
});

function resize() {
  const { width, height } = measureCanvasSize();
  world.resize(width, height);
  renderer.resize(width, height);
}

window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(tankShell || canvas);
resize();
requestAnimationFrame(resize);

// Track background time to schedule smooth catch-up.
let hiddenAtMs = null;

document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAtMs = Date.now();
    saveState(world);
    return;
  }

  if (hiddenAtMs != null && !world.paused) {
    const offlineSec = Math.max(0, (Date.now() - hiddenAtMs) / 1000);
    catchUpRemainingSec = Math.min(OFFLINE_CAP_SEC, catchUpRemainingSec + offlineSec);
  }
  hiddenAtMs = null;
});

// Save on close / refresh
window.addEventListener('beforeunload', () => {
  saveState(world);
});

// Periodic autosave (cheap insurance)
setInterval(() => saveState(world), 15_000);

let lastRafTime = performance.now();
let fps = 60;

function stepWorld(dt) {
  if (dt <= 0 || world.paused) return;
  world.update(dt);
}

function tick(now) {
  // Smooth FPS calculation
  const rawDelta = Math.min(0.05, (now - lastRafTime) / 1000);
  lastRafTime = now;

  if (rawDelta > 0) {
    const instantFps = 1 / rawDelta;
    fps += (instantFps - fps) * 0.1;
  }

  // Normal realtime step
  stepWorld(rawDelta);

  // Catch-up step: fast-forward in small physics increments, capped per frame
  if (!world.paused && catchUpRemainingSec > 0) {
    let budget = Math.min(CATCHUP_MAX_SIM_PER_FRAME_SEC, catchUpRemainingSec);
    while (budget > 0) {
      const dt = Math.min(CATCHUP_FIXED_STEP_SEC, budget);
      stepWorld(dt);
      budget -= dt;
      catchUpRemainingSec -= dt;
      if (catchUpRemainingSec <= 0) break;
    }
  }

  renderer.render(now, rawDelta);

  panel.updateStats({ fps, fishCount: world.fish.length, quality });
  panel.updateFishInspector(world.fish, world.selectedFishId, world.simTimeSec);

  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
