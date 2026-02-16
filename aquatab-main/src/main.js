/**
 * App bootstrap and animation loop.
 * Responsibility: wire world + renderer + panel and run RAF with stable delta time.
 */

import { World } from './engine/world.js';
import { Renderer } from './render/renderer.js';
import { Panel } from './ui/panel.js';

const INITIAL_FISH_COUNT = 20;

const STORAGE_KEY = 'aquatab_world_v1';
const AUTOSAVE_INTERVAL_SEC = 15;
const OFFLINE_CAP_SEC = 60 * 60; // 1 hour
// How much *real time* we simulate per rendered frame while catching up (seconds).
const CATCHUP_BUDGET_PER_FRAME_SEC = 4.0;
// Smaller fixed sim steps keep motion/steering stable during catch-up.
const CATCHUP_FIXED_STEP_SEC = 1 / 30;


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

const initialSize = measureCanvasSize();

function loadSavedWorld() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { world: null, offlineSec: 0 };
    const parsed = JSON.parse(raw);
    const savedAtMs = Number.isFinite(parsed?.savedAtMs) ? parsed.savedAtMs : Date.now();
    const offlineSecRaw = (Date.now() - savedAtMs) / 1000;
    const offlineSec = Math.max(0, Math.min(OFFLINE_CAP_SEC, offlineSecRaw));

    const world = World.deserialize(initialSize.width, initialSize.height, parsed);
    if (!world) return { world: null, offlineSec: 0 };

    // If the user paused before leaving, honor that: no offline progression.
    return { world, offlineSec: world.paused ? 0 : offlineSec };
  } catch {
    return { world: null, offlineSec: 0 };
  }
}

function saveWorld(world) {
  try {
    const payload = world.serialize();
    localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

const loaded = loadSavedWorld();
const world = loaded.world ?? new World(initialSize.width, initialSize.height, INITIAL_FISH_COUNT);
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

let catchUpRemainingSec = loaded.offlineSec ?? 0;
let autosaveTimerSec = 0;
let hiddenAtMs = null;
    return quality;
  },
  onFishSelect: (fishId) => world.toggleFishSelection(fishId),
  onFishRename: (fishId, name) => world.renameFish(fishId, name),
  onFishDiscard: (fishId) => world.discardFish(fishId)
});

renderer.setQuality(quality);

let catchUpRemainingSec = loaded.offlineSec ?? 0;
let autosaveTimerSec = 0;
let hiddenAtMs = null;


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


// Persist + smooth offline catch-up when tab is backgrounded.
// Browsers pause/throttle RAF in background; we simulate missed time gradually on return.
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    hiddenAtMs = Date.now();
    saveWorld(world);
    return;
  }

  // Became visible
  if (hiddenAtMs != null && !world.paused) {
    const elapsed = Math.max(0, (Date.now() - hiddenAtMs) / 1000);
    const capped = Math.min(OFFLINE_CAP_SEC, elapsed);
    catchUpRemainingSec = Math.min(OFFLINE_CAP_SEC, catchUpRemainingSec + capped);
  }
  hiddenAtMs = null;
});

// Also save when navigating away / closing.
window.addEventListener('pagehide', () => saveWorld(world));
window.addEventListener('beforeunload', () => saveWorld(world));

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

let lastTime = performance.now();
let fps = 60;

function tick(now) {
  const rawDelta = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (rawDelta > 0) {
    const instantFps = 1 / rawDelta;
    fps += (instantFps - fps) * 0.1;
  }

  // Normal realtime update (small step).
  world.update(rawDelta);

  // Smooth catch-up: spread missed time over multiple frames to avoid a 'teleport'.
  if (!world.paused && catchUpRemainingSec > 0) {
    let budget = Math.min(catchUpRemainingSec, CATCHUP_BUDGET_PER_FRAME_SEC);
    while (budget > 0.0001) {
      const step = Math.min(CATCHUP_FIXED_STEP_SEC, budget);
      world.update(step);
      budget -= step;
      catchUpRemainingSec -= step;
      if (catchUpRemainingSec <= 0) {
        catchUpRemainingSec = 0;
        break;
      }
    }
  }

  // Periodic autosave (realtime seconds, not simTime).
  autosaveTimerSec += rawDelta;
  if (autosaveTimerSec >= AUTOSAVE_INTERVAL_SEC) {
    autosaveTimerSec = 0;
    saveWorld(world);
  }

  renderer.render(now, rawDelta);

  panel.updateStats({ fps, fishCount: world.fish.length, quality });
  panel.updateFishInspector(world.fish, world.selectedFishId, world.simTimeSec);

  // TODO: Phase 2 - add event queue for feeding and item interactions.
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);