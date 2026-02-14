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

const world = new World(1, 1, INITIAL_FISH_COUNT);
const renderer = new Renderer(canvas, world);

let quality = 'high';
let autoLowMode = false;
let lowFpsAccum = 0;

const panel = new Panel(panelRoot, {
  onFishCountChange: (value) => world.setFishCount(value),
  onSpeedChange: (value) => world.setSpeedMultiplier(value),
  onPauseToggle: () => world.togglePause(),
  onQualityToggle: () => {
    quality = quality === 'high' ? 'low' : 'high';
    renderer.setQuality(quality);
    autoLowMode = false;
    panel.setAutoQualityIndicator(false);
    lowFpsAccum = 0;
    return quality;
  }
});

renderer.setQuality(quality);

panel.sync({
  fishCount: world.fish.length,
  speedMultiplier: world.speedMultiplier,
  paused: world.paused,
  quality
});

function resize() {
  const width = Math.max(1, Math.floor(canvas.clientWidth));
  const height = Math.max(1, Math.floor(canvas.clientHeight));
  world.resize(width, height);
  renderer.resize(width, height);
}

window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(canvas);
resize();

let lastTime = performance.now();
let fps = 60;

function tick(now) {
  const rawDelta = Math.min(0.05, (now - lastTime) / 1000);
  lastTime = now;

  if (rawDelta > 0) {
    const instantFps = 1 / rawDelta;
    fps += (instantFps - fps) * 0.1;
  }

  if (!autoLowMode && quality === 'high') {
    if (fps < 55) lowFpsAccum += rawDelta;
    else lowFpsAccum = Math.max(0, lowFpsAccum - rawDelta * 0.5);

    if (lowFpsAccum >= 2) {
      quality = 'low';
      autoLowMode = true;
      renderer.setQuality(quality);
      panel.setAutoQualityIndicator(true);
    }
  }

  world.update(rawDelta);
  renderer.render(now, rawDelta);

  panel.updateStats({ fps, fishCount: world.fish.length, quality });

  // TODO: Phase 2 - add event queue for feeding and item interactions.
  requestAnimationFrame(tick);
}

requestAnimationFrame(tick);
