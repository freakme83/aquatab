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
    if (clickedFish.lifeState !== 'DEAD') panel.selectTab('fish');
    return;
  }

  hideCorpseAction();
  world.spawnFood(worldPoint.x, worldPoint.y);
});

panel.sync({
  fishCount: world.fish.length,
  speedMultiplier: world.speedMultiplier,
  paused: world.paused,
  quality
});

const corpseActionButton = document.createElement('button');
corpseActionButton.type = 'button';
corpseActionButton.textContent = 'Havuzdan al';
corpseActionButton.hidden = true;
corpseActionButton.style.position = 'fixed';
corpseActionButton.style.zIndex = '12';
corpseActionButton.style.padding = '6px 10px';
corpseActionButton.style.borderRadius = '999px';
corpseActionButton.style.border = '1px solid rgba(255,255,255,0.38)';
corpseActionButton.style.background = 'rgba(20, 28, 38, 0.86)';
corpseActionButton.style.color = '#eaf7ff';
corpseActionButton.style.fontSize = '12px';
corpseActionButton.style.cursor = 'pointer';
document.body.appendChild(corpseActionButton);

function worldToClientPoint(worldX, worldY) {
  const canvasRect = canvas.getBoundingClientRect();
  const { x, y, width, height } = renderer.tankRect;
  if (!width || !height || world.bounds.width <= 0 || world.bounds.height <= 0) return null;

  return {
    x: canvasRect.left + x + (worldX / world.bounds.width) * width,
    y: canvasRect.top + y + (worldY / world.bounds.height) * height
  };
}

function hideCorpseAction() {
  corpseActionButton.hidden = true;
}

function updateCorpseActionButton() {
  const selectedFish = world.getSelectedFish?.();
  if (!selectedFish || selectedFish.lifeState !== 'DEAD') {
    hideCorpseAction();
    return;
  }

  const point = worldToClientPoint(selectedFish.position.x, selectedFish.position.y - selectedFish.size * 1.4);
  if (!point) {
    hideCorpseAction();
    return;
  }

  corpseActionButton.hidden = false;
  corpseActionButton.style.left = `${Math.round(point.x)}px`;
  corpseActionButton.style.top = `${Math.round(point.y)}px`;
  corpseActionButton.style.transform = 'translate(-50%, -100%)';
}

corpseActionButton.addEventListener('click', () => {
  const selectedFish = world.getSelectedFish?.();
  if (!selectedFish || selectedFish.lifeState !== 'DEAD') {
    hideCorpseAction();
    return;
  }

  world.removeCorpse(selectedFish.id);
  hideCorpseAction();
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

const VISIBLE_MAX_STEP_SEC = 0.25;
const HIDDEN_STEP_SEC = 0.25;
const HIDDEN_TICK_MS = 1000;

function stepVisibleSim(rawDeltaSec) {
  const dt = Math.min(VISIBLE_MAX_STEP_SEC, Math.max(0, rawDeltaSec));
  if (dt <= 0) return;
  world.update(dt);
}

function stepHiddenSim(rawDeltaSec) {
  let remaining = Math.max(0, rawDeltaSec);
  if (remaining <= 0) return;

  while (remaining > 0) {
    const dt = Math.min(HIDDEN_STEP_SEC, remaining);
    world.update(dt);
    remaining -= dt;
  }
}

function tick(now) {
  const rawDelta = (now - lastTime) / 1000;
  lastTime = now;

  // For FPS calculation and rendering delta, keep it tight for stability.
  const renderDelta = Math.min(0.05, Math.max(0.000001, rawDelta));
  const instantFps = 1 / renderDelta;
  fps += (instantFps - fps) * 0.1;

  // Visible: sim + render
  stepVisibleSim(rawDelta);
  renderer.render(now, renderDelta);

  panel.updateStats({
    fps,
    fishCount: world.fish.length,
    quality,
    cleanliness01: world.water.hygiene01,
    filterUnlocked: world.filterUnlocked,
    foodsConsumedCount: world.foodsConsumedCount,
    filterUnlockThreshold: world.filterUnlockThreshold
  });
  panel.updateFishInspector(world.fish, world.selectedFishId, world.simTimeSec);
  updateCorpseActionButton();

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

    // Hidden: advance sim only (no rendering). Catch up in coarse chunks.
    stepHiddenSim(rawDelta);
  }, HIDDEN_TICK_MS);
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
    hideCorpseAction();
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
