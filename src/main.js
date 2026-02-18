/**
 * App bootstrap and animation loop.
 * Responsibility: wire world + renderer + panel and run RAF with stable delta time.
 */

import { World } from './engine/world.js';
import { Renderer } from './render/renderer.js';
import { Panel } from './ui/panel.js';

const DEFAULT_INITIAL_FISH_COUNT = 4;
const SAVE_STORAGE_KEY = 'aquatab_save_v1';
const SAVE_VERSION = 1;
const AUTOSAVE_INTERVAL_MS = 10_000;

const startScreen = document.getElementById('startScreen');
const appRoot = document.getElementById('appRoot');
const startFishSlider = document.querySelector('[data-start-control="initialFishCount"]');
const startFishValue = document.querySelector('[data-start-value="initialFishCount"]');
const startSimButton = document.getElementById('startSimButton');
const startCard = startScreen?.querySelector('.start-card');

const canvas = document.getElementById('aquariumCanvas');
const panelRoot = document.getElementById('panelRoot');
const tankShell = canvas.closest('.tank-shell');

let world = null;
let renderer = null;
let panel = null;
let started = false;
let canvasClickHandler = null;

let pendingSavePayload = null;

let autosaveIntervalId = null;

function loadSavedWorldSnapshot() {
  try {
    const raw = localStorage.getItem(SAVE_STORAGE_KEY);
    if (!raw) return null;
    const payload = JSON.parse(raw);
    if (payload?.saveVersion !== SAVE_VERSION) return null;
    if (!payload.worldState || payload.worldState.saveVersion !== SAVE_VERSION) return null;
    return payload;
  } catch {
    return null;
  }
}

function formatRelativeSavedAt(epochMs) {
  if (!Number.isFinite(epochMs) || epochMs <= 0) return 'unknown';
  const deltaMs = Math.max(0, Date.now() - epochMs);
  const minuteMs = 60_000;
  const hourMs = 60 * minuteMs;
  const dayMs = 24 * hourMs;

  if (deltaMs < 15_000) return 'just now';
  if (deltaMs < hourMs) {
    const minutes = Math.max(1, Math.round(deltaMs / minuteMs));
    return `${minutes} minute${minutes === 1 ? '' : 's'} ago`;
  }
  if (deltaMs < dayMs) {
    const hours = Math.max(1, Math.round(deltaMs / hourMs));
    return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  }

  const days = Math.max(1, Math.round(deltaMs / dayMs));
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function saveWorldSnapshot() {
  if (!started || !world) return false;

  try {
    const payload = {
      saveVersion: SAVE_VERSION,
      savedAtEpochMs: Date.now(),
      worldState: world.toJSON()
    };
    localStorage.setItem(SAVE_STORAGE_KEY, JSON.stringify(payload));
    return true;
  } catch {
    return false;
  }
}

function startAutosave() {
  if (autosaveIntervalId != null) return;
  autosaveIntervalId = setInterval(() => {
    saveWorldSnapshot();
  }, AUTOSAVE_INTERVAL_MS);
}

function stopAutosave() {
  if (autosaveIntervalId == null) return;
  clearInterval(autosaveIntervalId);
  autosaveIntervalId = null;
}


function measureCanvasSize() {
  const rect = canvas.getBoundingClientRect();
  const hostRect = tankShell?.getBoundingClientRect();

  return {
    width: Math.max(1, Math.floor(rect.width || hostRect?.width || canvas.clientWidth || 1)),
    height: Math.max(1, Math.floor(rect.height || hostRect?.height || canvas.clientHeight || 1))
  };
}

startFishSlider?.addEventListener('input', (event) => {
  const value = Number.parseInt(event.target.value, 10) || DEFAULT_INITIAL_FISH_COUNT;
  if (startFishValue) startFishValue.textContent = String(value);
});

const corpseActionButton = document.createElement('button');
corpseActionButton.type = 'button';
corpseActionButton.textContent = 'Remove from tank';
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

const filterToast = document.createElement('div');
filterToast.hidden = true;
filterToast.style.position = 'fixed';
filterToast.style.left = '50%';
filterToast.style.bottom = '22px';
filterToast.style.transform = 'translateX(-50%)';
filterToast.style.padding = '6px 10px';
filterToast.style.borderRadius = '999px';
filterToast.style.border = '1px solid rgba(255,255,255,0.34)';
filterToast.style.background = 'rgba(18, 30, 41, 0.88)';
filterToast.style.color = '#e8f4ff';
filterToast.style.fontSize = '12px';
filterToast.style.zIndex = '30';
filterToast.style.pointerEvents = 'none';
document.body.appendChild(filterToast);

const savedStartPanel = document.createElement('section');
savedStartPanel.className = 'saved-start-panel';
savedStartPanel.hidden = true;
savedStartPanel.innerHTML = `
  <h2>Saved simulation found</h2>
  <p class="saved-start-meta" data-saved-start-meta>Last saved: unknown</p>
  <div class="saved-start-actions">
    <button type="button" class="saved-start-btn" data-saved-start-action="continue">Continue</button>
    <button type="button" class="saved-start-link" data-saved-start-action="new">New sim</button>
  </div>
`;
startCard?.appendChild(savedStartPanel);

const savedStartMeta = savedStartPanel.querySelector('[data-saved-start-meta]');
const savedStartContinueBtn = savedStartPanel.querySelector('[data-saved-start-action="continue"]');
const savedStartNewBtn = savedStartPanel.querySelector('[data-saved-start-action="new"]');

function refreshSavedStartPanel() {
  const payload = loadSavedWorldSnapshot();
  pendingSavePayload = payload;

  if (!payload) {
    savedStartPanel.hidden = true;
    return;
  }

  const relative = formatRelativeSavedAt(payload.savedAtEpochMs);
  if (savedStartMeta) savedStartMeta.textContent = `Last saved: ${relative}`;
  savedStartPanel.hidden = false;
}

let filterToastTimeoutId = null;
function showFilterToast(textValue) {
  filterToast.textContent = textValue;
  filterToast.hidden = false;
  if (filterToastTimeoutId) clearTimeout(filterToastTimeoutId);
  filterToastTimeoutId = setTimeout(() => {
    filterToast.hidden = true;
    filterToastTimeoutId = null;
  }, 1000);
}

function worldToClientPoint(worldX, worldY) {
  if (!renderer || !world) return null;
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
  if (!world) return;
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
  if (!world) return;
  const selectedFish = world.getSelectedFish?.();
  if (!selectedFish || selectedFish.lifeState !== 'DEAD') {
    hideCorpseAction();
    return;
  }

  world.removeCorpse(selectedFish.id);
  hideCorpseAction();
});

function resize() {
  if (!started || !world || !renderer) return;
  const { width, height } = measureCanvasSize();
  world.resize(width, height);
  renderer.resize(width, height);
}

window.addEventListener('resize', resize);
new ResizeObserver(resize).observe(tankShell || canvas);

/* -------------------------------------------------------------------------- */
/* Simulation/render drivers (single active driver rule)                       */
/* -------------------------------------------------------------------------- */

let rafId = null;
let bgIntervalId = null;

let lastTime = performance.now();

const VISIBLE_MAX_STEP_SEC = 0.25;
const HIDDEN_STEP_SEC = 0.25;
const HIDDEN_TICK_MS = 1000;

function stepVisibleSim(rawDeltaSec) {
  if (!world) return;
  const dt = Math.min(VISIBLE_MAX_STEP_SEC, Math.max(0, rawDeltaSec));
  if (dt <= 0) return;
  world.update(dt);
}

function stepHiddenSim(rawDeltaSec) {
  if (!world) return;
  let remaining = Math.max(0, rawDeltaSec);
  if (remaining <= 0) return;

  while (remaining > 0) {
    const dt = Math.min(HIDDEN_STEP_SEC, remaining);
    world.update(dt);
    remaining -= dt;
  }
}

function tick(now) {
  if (!world || !renderer || !panel) return;

  const rawDelta = (now - lastTime) / 1000;
  lastTime = now;

  const renderDelta = Math.min(0.05, Math.max(0.000001, rawDelta));

  stepVisibleSim(rawDelta);
  renderer.render(now, renderDelta);

  panel.updateStats({
    simTimeSec: world.simTimeSec,
    fishCount: world.fish.length,
    cleanliness01: world.water.hygiene01,
    filterUnlocked: world.filterUnlocked,
    foodsConsumedCount: world.foodsConsumedCount,
    filterUnlockThreshold: world.filterUnlockThreshold,
    filterInstalled: world.water.filterInstalled,
    filterEnabled: world.water.filterEnabled,
    filter01: world.water.filter01,
    installProgress01: world.water.installProgress01,
    maintenanceProgress01: world.water.maintenanceProgress01,
    maintenanceCooldownSec: world.water.maintenanceCooldownSec,
    filterDepletedThreshold01: world.filterDepletedThreshold01
  });
  panel.updateFishInspector(world.fish, world.selectedFishId, world.simTimeSec);
  updateCorpseActionButton();

  rafId = requestAnimationFrame(tick);
}

function startRaf() {
  if (!started || rafId != null) return;
  lastTime = performance.now();
  rafId = requestAnimationFrame(tick);
}

function stopRaf() {
  if (rafId == null) return;
  cancelAnimationFrame(rafId);
  rafId = null;
}

function startBackgroundSim() {
  if (!started || bgIntervalId != null) return;

  let last = performance.now();
  bgIntervalId = setInterval(() => {
    const now = performance.now();
    const rawDelta = (now - last) / 1000;
    last = now;
    stepHiddenSim(rawDelta);
  }, HIDDEN_TICK_MS);
}

function stopBackgroundSim() {
  if (bgIntervalId == null) return;
  clearInterval(bgIntervalId);
  bgIntervalId = null;
}

function syncDriversToVisibility() {
  if (!started) return;
  if (document.visibilityState === 'hidden') {
    saveWorldSnapshot();
    stopRaf();
    hideCorpseAction();
    stopBackgroundSim();
    startBackgroundSim();
  } else {
    stopBackgroundSim();
    stopRaf();
    startRaf();
  }
}

document.addEventListener('visibilitychange', syncDriversToVisibility);
window.addEventListener('beforeunload', () => {
  saveWorldSnapshot();
});


function restartToStartScreen() {
  if (!started) return;

  saveWorldSnapshot();
  stopRaf();
  stopBackgroundSim();
  stopAutosave();
  hideCorpseAction();

  started = false;
  pendingSavePayload = null;
  world = null;
  renderer = null;

  if (canvasClickHandler) {
    canvas.removeEventListener('click', canvasClickHandler);
    canvasClickHandler = null;
  }

  appRoot.hidden = true;
  startScreen.hidden = false;
  refreshSavedStartPanel();
}

function startSimulation({ savedPayload = null } = {}) {
  if (started) return;

  const selectedFishCount = Number.parseInt(startFishSlider?.value ?? String(DEFAULT_INITIAL_FISH_COUNT), 10);
  const initialFishCount = Number.isFinite(selectedFishCount) ? selectedFishCount : DEFAULT_INITIAL_FISH_COUNT;

  appRoot.hidden = false;
  startScreen.hidden = true;
  pendingSavePayload = null;

  const initialSize = measureCanvasSize();
  if (savedPayload?.saveVersion === SAVE_VERSION) {
    world = World.fromJSON(savedPayload, {
      width: initialSize.width,
      height: initialSize.height,
      initialFishCount
    });
  } else {
    world = new World(initialSize.width, initialSize.height, initialFishCount);
  }
  renderer = new Renderer(canvas, world);

  const panelHandlers = {
    onSpeedChange: (value) => world.setSpeedMultiplier(value),
    onPauseToggle: () => world.togglePause(),
    onFishSelect: (fishId) => world.toggleFishSelection(fishId),
    onFishRename: (fishId, name) => world.renameFish(fishId, name),
    onFishDiscard: (fishId) => world.discardFish(fishId),
    onGetFishById: (fishId) => world.getFishById?.(fishId),
    onFilterInstall: () => world.installWaterFilter?.(),
    onFilterMaintain: () => world.maintainWaterFilter?.(),
    onFilterTogglePower: () => world.toggleWaterFilterEnabled?.(),
    onRestartConfirm: () => restartToStartScreen()
  };
  if (!panel) {
    panel = new Panel(panelRoot, panelHandlers);
  } else {
    panel.handlers = panelHandlers;
  }

  if (canvasClickHandler) {
    canvas.removeEventListener('click', canvasClickHandler);
  }

  canvasClickHandler = (event) => {
    if (!world || !renderer) return;

    if (renderer.isFilterModuleHit?.(event.clientX, event.clientY) && world.water.filterInstalled) {
      const enabled = world.toggleWaterFilterEnabled?.();
      showFilterToast(enabled ? 'Filter ON' : 'Filter OFF');
      return;
    }

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
  };
  canvas.addEventListener('click', canvasClickHandler);

  panel.sync({
    speedMultiplier: world.speedMultiplier,
    paused: world.paused
  });

  resize();
  requestAnimationFrame(resize);

  started = true;
  startAutosave();
  syncDriversToVisibility();
}

savedStartContinueBtn?.addEventListener('click', () => {
  if (!pendingSavePayload) {
    refreshSavedStartPanel();
  }
  if (!pendingSavePayload) return;

  startSimulation({ savedPayload: pendingSavePayload });
});

savedStartNewBtn?.addEventListener('click', () => {
  localStorage.removeItem(SAVE_STORAGE_KEY);
  refreshSavedStartPanel();
});

startSimButton?.addEventListener('click', () => {
  startSimulation();
});

refreshSavedStartPanel();
