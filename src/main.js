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
  onFishSelect: (fishId) => world.selectFish(fishId)
});

renderer.setQuality(quality);


canvas.addEventListener('click', (event) => {
  const worldPoint = renderer.toWorldPoint(event.clientX, event.clientY);
  if (!worldPoint) return;

  const clickedFish = world.findFishAt(worldPoint.x, worldPoint.y);
  if (clickedFish) {
    world.selectFish(clickedFish.id);
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

function tick(now) {
  const rawDelta = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (rawDelta > 0) {
    const instantFps = 1 / rawDelta;
    fps += (instantFps - fps) * 0.1;
  }

  world.update(rawDelta);
  renderer.render(now, rawDelta);

  panel.updateStats({ fps, fishCount: world.fish.length, quality });
  panel.updateFishInspector(world.fish, world.selectedFishId, world.simTimeSec);

  // TODO: Phase 2 - add event queue for feeding and item interactions.
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
