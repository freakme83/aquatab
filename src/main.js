/**
 * App bootstrap and animation loop.
 * Responsibility: wire world + renderer + panel and run RAF with stable delta time.
 */

import { World } from './engine/world.js';
import { Renderer } from './render/renderer.js';
import { Panel } from './ui/panel.js';

const INITIAL_FISH_COUNT = 20;

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
const world = new World(initialSize.width, initialSize.height, INITIAL_FISH_COUNT);
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

/* -------------------------------------------------------------------------- */
/* Simulation/render drivers (single active driver rule)                       */
/* -------------------------------------------------------------------------- */

let rafId = null;
let bgIntervalId = null;

let lastTime = performance.now();
let fps = 60;

/**
 * Advance simulation once.
 * mode:
 *  - 'visible': clamp dt tighter for stability (we are rendering).
 *  - 'hidden' : allow large dt so sim time keeps up despite timer throttling.
 */
function stepSim(rawDeltaSec, mode = 'visible') {
  const maxDt = mode === 'hidden' ? 5.0 : 0.25;
  const dt = Math.min(maxDt, Math.max(0, rawDeltaSec));
  if (dt <= 0) return;
  world.update(dt);
}

function tick(now) {
  const rawDelta = (now - lastTime) / 1000;
  lastTime = now;

  // For FPS calculation and rendering delta, keep it tight for stability.
  const renderDelta = Math.min(0.05, Math.max(0.000001, rawDelta));
  const instantFps = 1 / renderDelta;
  fps += (instantFps - fps) * 0.1;

  // Visible: sim + render
  stepSim(rawDelta, 'visible');
  renderer.render(now, renderDelta);

  panel.updateStats({
    fps,
    fishCount: world.fish.length,
    quality,
    cleanliness01: world.water.hygiene01
  });
  panel.updateFishInspector(world.fish, world.selectedFishId, world.simTimeSec);

  rafId = requestAnimationFrame(tick);
}

function startRaf() {
  if (rafId != null) return;
  lastTime = performance.now();
  rafId = requestAnimationFrame(tick);
}

function stopRaf() {
  if (rafId == null) return;
  cancelAnimationFrame(rafId);
  rafId = null;
}

function startBackgroundSim() {
  if (bgIntervalId != null) return;

  let last = performance.now();
  bgIntervalId = setInterval(() => {
    const now = performance.now();
    const rawDelta = (now - last) / 1000;
    last = now;

    // Hidden: advance sim only (no rendering)
    stepSim(rawDelta, 'hidden');
  }, 250); // 4 Hz target; browser may throttle, dt will carry elapsed time.
}

function stopBackgroundSim() {
  if (bgIntervalId == null) return;
  clearInterval(bgIntervalId);
  bgIntervalId = null;
}

function syncDriversToVisibility() {
  if (document.visibilityState === 'hidden') {
    // Hidden: sim continues, no rendering
    stopRaf();
    stopBackgroundSim(); // ensure no overlap
    startBackgroundSim();
  } else {
    // Visible: sim + render on RAF
    stopBackgroundSim();
    stopRaf(); // safe restart (also resets lastTime in startRaf)
    startRaf();
  }
}

document.addEventListener('visibilitychange', syncDriversToVisibility);

// Start with correct mode
syncDriversToVisibility();
