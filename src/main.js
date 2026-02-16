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

let lastTime = performance.now();
let fps = 60;

const SIMULATION_STEP_SEC = 1 / 60;
const MAX_DELTA_SEC = 0.05;
let simulationTime = performance.now();
let intervalDriverId = null;

function advanceSimulation(now = performance.now()) {
  const elapsedSec = Math.max(0, (now - simulationTime) / 1000);
  simulationTime = now;

  let remaining = Math.min(elapsedSec, MAX_DELTA_SEC);
  while (remaining > 0) {
    const delta = Math.min(SIMULATION_STEP_SEC, remaining);
    world.update(delta);
    remaining -= delta;
  }
}

function startIntervalDriver() {
  if (intervalDriverId !== null) return;
  intervalDriverId = setInterval(() => {
    advanceSimulation();
  }, SIMULATION_STEP_SEC * 1000);
}

function stopIntervalDriver() {
  if (intervalDriverId === null) return;
  clearInterval(intervalDriverId);
  intervalDriverId = null;
}

function syncDriverToVisibility() {
  if (document.visibilityState === 'visible') {
    stopIntervalDriver();

    // Avoid fast-forward after returning from a hidden tab.
    const now = performance.now();
    simulationTime = now;
    lastTime = now;
    return;
  }

  startIntervalDriver();

}

document.addEventListener('visibilitychange', syncDriverToVisibility);
syncDriverToVisibility();

function tick(now) {
  const rawDelta = Math.min(MAX_DELTA_SEC, (now - lastTime) / 1000);
  lastTime = now;

  if (rawDelta > 0) {
    const instantFps = 1 / rawDelta;
    fps += (instantFps - fps) * 0.1;
  }

  if (document.visibilityState === 'visible') {
    advanceSimulation(now);
    renderer.render(now, rawDelta);
  }

  panel.updateStats({ fps, fishCount: world.fish.length, quality });
  panel.updateFishInspector(world.fish, world.selectedFishId, world.simTimeSec);

  // TODO: Phase 2 - add event queue for feeding and item interactions.
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
