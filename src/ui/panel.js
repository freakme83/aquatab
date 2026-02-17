/**
 * UI side panel controller.
 * Responsibility: tabs, controls binding, and stat presentation.
 */

export class Panel {
  constructor(rootElement, handlers) {
    this.root = rootElement;
    this.handlers = handlers;
    this.nameDraftByFishId = new Map();
    this.currentInspectorSelectedFishId = null;
    this.lastInspectorSignature = null;

    this.tabButtons = [...this.root.querySelectorAll('.tab-button')];
    this.tabContents = [...this.root.querySelectorAll('.tab-content')];

    this.fpsStat = this.root.querySelector('[data-stat="fps"]');
    this.fishCountStat = this.root.querySelector('[data-stat="fishCount"]');
    this.qualityStat = this.root.querySelector('[data-stat="quality"]');
    this.cleanlinessStat = this.root.querySelector('[data-stat="cleanliness"]');
    this.filterUnlockStat = this.root.querySelector('[data-stat="filterUnlock"]');
    this.filterHealthStat = this.root.querySelector('[data-stat="filterHealth"]');
    this.filterActionStat = this.root.querySelector('[data-stat="filterAction"]');

    this.fishSlider = this.root.querySelector('[data-control="fishCount"]');
    this.speedSlider = this.root.querySelector('[data-control="simSpeed"]');
    this.toggleButton = this.root.querySelector('[data-control="togglePause"]');
    this.qualityButton = this.root.querySelector('[data-control="toggleQuality"]');
    this.installFilterButton = this.root.querySelector('[data-control="installFilter"]');
    this.maintainFilterButton = this.root.querySelector('[data-control="maintainFilter"]');

    this.fishValue = this.root.querySelector('[data-value="fishCount"]');
    this.speedValue = this.root.querySelector('[data-value="simSpeed"]');
    this.fishInspector = this.root.querySelector('[data-fish-inspector]');

    this.deckToggle = document.getElementById('deckToggle');

    this.#bindTabs();
    this.#bindControls();
    this.#bindDeckToggle();
    this.#bindFishInspectorDelegates();
  }

  #bindTabs() {
    this.tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        this.selectTab(button.dataset.tab);
      });
    });
  }

  selectTab(tabName) {
    for (const b of this.tabButtons) {
      const active = b.dataset.tab === tabName;
      b.classList.toggle('active', active);
      b.setAttribute('aria-selected', String(active));
    }

    for (const content of this.tabContents) {
      content.classList.toggle('active', content.dataset.content === tabName);
    }
  }

  #bindControls() {
    this.fishSlider.addEventListener('input', (event) => {
      const value = Number(event.target.value);
      this.fishValue.textContent = String(value);
      this.handlers.onFishCountChange(value);
    });

    this.speedSlider.addEventListener('input', (event) => {
      const value = Number(event.target.value);
      this.speedValue.textContent = `${value.toFixed(1)}x`;
      this.handlers.onSpeedChange(value);
    });

    this.toggleButton.addEventListener('click', () => {
      const isPaused = this.handlers.onPauseToggle();
      this.toggleButton.textContent = isPaused ? 'Resume' : 'Pause';
    });

    this.qualityButton.addEventListener('click', () => {
      const quality = this.handlers.onQualityToggle();
      this.#setQualityText(quality);
    });

    this.installFilterButton?.addEventListener('click', () => {
      this.handlers.onFilterInstall?.();
    });

    this.maintainFilterButton?.addEventListener('click', () => {
      this.handlers.onFilterMaintain?.();
    });
  }

  #bindDeckToggle() {
    if (!this.deckToggle) return;
    this.deckToggle.addEventListener('click', () => {
      const isOpen = this.root.dataset.open === 'true';
      this.root.dataset.open = isOpen ? 'false' : 'true';
      this.deckToggle.setAttribute('aria-expanded', String(!isOpen));
    });
  }

  #bindFishInspectorDelegates() {
    if (!this.fishInspector) return;

    this.fishInspector.addEventListener('pointerdown', (event) => {
      const rowButton = event.target.closest('[data-fish-id]');
      if (!rowButton) return;
      event.preventDefault();
      this.handlers.onFishSelect?.(Number(rowButton.dataset.fishId));
    });

    this.fishInspector.addEventListener('input', (event) => {
      const input = event.target.closest('[data-fish-name-input]');
      if (!input || this.currentInspectorSelectedFishId == null) return;
      this.nameDraftByFishId.set(this.currentInspectorSelectedFishId, input.value);
    });

    this.fishInspector.addEventListener('keydown', (event) => {
      const input = event.target.closest('[data-fish-name-input]');
      if (!input) return;
      if (event.key === 'Enter') {
        event.preventDefault();
        input.blur();
      }
    });

    this.fishInspector.addEventListener('blur', (event) => {
      const input = event.target.closest('[data-fish-name-input]');
      if (!input || this.currentInspectorSelectedFishId == null) return;
      this.handlers.onFishRename?.(this.currentInspectorSelectedFishId, input.value);
      this.nameDraftByFishId.set(this.currentInspectorSelectedFishId, input.value.trim());
    }, true);

    this.fishInspector.addEventListener('click', (event) => {
      const discardButton = event.target.closest('[data-fish-discard]');
      if (!discardButton || this.currentInspectorSelectedFishId == null) return;
      this.handlers.onFishDiscard?.(this.currentInspectorSelectedFishId);
    });
  }

  #setQualityText(quality) {
    const label = quality === 'low' ? 'Low' : 'High';
    this.qualityStat.textContent = label;
    this.qualityButton.textContent = `Quality: ${label}`;
  }

  sync({ fishCount, speedMultiplier, paused, quality }) {
    this.fishSlider.value = String(fishCount);
    this.speedSlider.value = String(speedMultiplier);
    this.fishValue.textContent = String(fishCount);
    this.speedValue.textContent = `${speedMultiplier.toFixed(1)}x`;
    this.toggleButton.textContent = paused ? 'Resume' : 'Pause';
    this.#setQualityText(quality);
  }

  updateStats({
    fps,
    fishCount,
    quality,
    cleanliness01,
    filterUnlocked,
    foodsConsumedCount,
    filterUnlockThreshold,
    filterInstalled,
    filter01,
    installProgress01,
    maintenanceProgress01,
    maintenanceCooldownSec,
    filterDepletedThreshold01
  }) {
    this.fpsStat.textContent = String(Math.round(fps));
    this.fishCountStat.textContent = String(fishCount);
    this.#setQualityText(quality);

    if (this.cleanlinessStat) {
      const cleanlinessPct = Math.round((cleanliness01 ?? 1) * 100);
      this.cleanlinessStat.textContent = `${cleanlinessPct}%`;
    }

    if (this.filterUnlockStat) {
      if (!filterUnlocked) {
        this.filterUnlockStat.textContent = 'Filter: Locked';
      } else if (!filterInstalled) {
        this.filterUnlockStat.textContent = 'Filter: Available';
      } else {
        this.filterUnlockStat.textContent = `Filter: Installed (${Math.round(Math.max(0, filter01 ?? 0) * 100)}%)`;
      }
    }

    if (this.filterHealthStat) {
      if (!filterUnlocked) {
        const consumed = Math.max(0, Math.floor(foodsConsumedCount ?? 0));
        const threshold = Math.max(0, Math.floor(filterUnlockThreshold ?? 0));
        this.filterHealthStat.textContent = `${consumed} / ${threshold}`;
      } else if (!filterInstalled && (installProgress01 ?? 0) <= 0) {
        this.filterHealthStat.textContent = 'Ready to install';
      } else {
        this.filterHealthStat.textContent = `${Math.round(Math.max(0, filter01 ?? 0) * 100)}%`;
      }
    }

    const isInstalling = (installProgress01 ?? 0) > 0;
    const isMaintaining = (maintenanceProgress01 ?? 0) > 0;
    const canInstall = filterUnlocked && !filterInstalled && !isInstalling;
    const canMaintain = filterInstalled && !isInstalling && !isMaintaining && (maintenanceCooldownSec ?? 0) <= 0;
    const depleted = filterInstalled && !isMaintaining && (filter01 ?? 0) <= (filterDepletedThreshold01 ?? 0.1);

    if (this.filterActionStat) {
      if (isInstalling) {
        this.filterActionStat.textContent = `Installing... ${Math.round((installProgress01 ?? 0) * 100)}%`;
      } else if (isMaintaining) {
        this.filterActionStat.textContent = `Maintaining... ${Math.round((maintenanceProgress01 ?? 0) * 100)}%`;
      } else if (depleted) {
        this.filterActionStat.textContent = 'Maintenance required';
      } else if (filterInstalled && (maintenanceCooldownSec ?? 0) > 0) {
        this.filterActionStat.textContent = `Maintenance cooldown: ${Math.ceil(maintenanceCooldownSec ?? 0)}s`;
      } else {
        this.filterActionStat.textContent = '--';
      }
    }

    if (this.installFilterButton) {
      this.installFilterButton.hidden = !canInstall;
      this.installFilterButton.disabled = !canInstall;
    }

    if (this.maintainFilterButton) {
      this.maintainFilterButton.hidden = !filterInstalled;
      this.maintainFilterButton.disabled = !canMaintain;
    }
  }

  updateFishInspector(fishList, selectedFishId, simTimeSec) {
    if (!this.fishInspector) return;

    const activeInput = this.fishInspector.querySelector('[data-fish-name-input]:focus');
    if (activeInput) return;

    const previousList = this.fishInspector.querySelector('.fish-list');
    const previousScrollTop = previousList?.scrollTop ?? 0;

    const sorted = [...fishList].sort((a, b) => a.id - b.id);

    const selectedFish = sorted.find((fish) => fish.id === selectedFishId) ?? null;
    const selectedLiveAgeSec = selectedFish ? Math.floor(selectedFish.ageSeconds(simTimeSec)) : -1;
    const selectedHungerPct = selectedFish ? Math.round((selectedFish.hunger01 ?? 0) * 100) : -1;
    const selectedWellbeingPct = selectedFish ? Math.round((selectedFish.wellbeing01 ?? 0) * 100) : -1;
    const selectedGrowthPct = selectedFish ? Math.round((selectedFish.growth01 ?? 0) * 100) : -1;

    const signature = sorted
      .map((fish) => `${fish.id}|${fish.name ?? ''}|${fish.lifeState}|${fish.hungerState}|${fish.lifeStage ?? ''}`)
      .join(';')
      + `::selected=${selectedFishId ?? 'none'}`
      + `::age=${selectedLiveAgeSec}`
      + `::hunger=${selectedHungerPct}`
      + `::wellbeing=${selectedWellbeingPct}`
      + `::growth=${selectedGrowthPct}`;

    if (signature === this.lastInspectorSignature) return;
    this.lastInspectorSignature = signature;

    const listHtml = sorted
      .map((fish) => {
        const selectedClass = fish.id === selectedFishId ? ' selected' : '';
        const stageLabel = typeof fish.lifeStageLabel === 'function' ? fish.lifeStageLabel() : (fish.lifeStage ?? '');
        const state = `${fish.lifeState} · ${stageLabel} · ${fish.hungerState}`;
        const liveName = fish.name?.trim() || '';
        const draftName = this.nameDraftByFishId.get(fish.id) ?? liveName;
        const rawLabel = draftName ? `${draftName} (#${fish.id})` : `#${fish.id}`;
        const label = this.#escapeHtml(rawLabel);
        return `<button type="button" class="fish-row${selectedClass}" data-fish-id="${fish.id}">${label} · ${fish.sex} · ${state}</button>`;
      })
      .join('');

    this.currentInspectorSelectedFishId = selectedFish?.id ?? null;

    const detailHtml = selectedFish
      ? this.#fishDetailsMarkup(selectedFish, simTimeSec)
      : '<p class="fish-empty">Select a fish.</p>';

    this.fishInspector.innerHTML = `
      <div class="fish-list">${listHtml}</div>
      <div class="fish-detail">${detailHtml}</div>
    `;

    const nextList = this.fishInspector.querySelector('.fish-list');
    if (nextList) nextList.scrollTop = previousScrollTop;
  }

  #escapeHtml(value) {
    return String(value)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;');
  }

  #escapeAttribute(value) {
    return this.#escapeHtml(value).replaceAll('"', '&quot;');
  }

  #fishDetailsMarkup(fish, simTimeSec) {
    const ageSec = Math.round(fish.ageSeconds(simTimeSec));
    const mm = String(Math.floor(ageSec / 60)).padStart(2, '0');
    const ss = String(ageSec % 60).padStart(2, '0');
    const canDiscard = fish.lifeState !== 'ALIVE';
    const liveName = fish.name?.trim() || '';
    const draftName = this.nameDraftByFishId.get(fish.id) ?? liveName;

    return `
      <div class="stat-row"><span>ID</span><strong>#${fish.id}</strong></div>
      <label class="control-group fish-name-group"><span>Name</span><input type="text" maxlength="24" value="${this.#escapeAttribute(draftName)}" data-fish-name-input placeholder="Fish name" /></label>
      <div class="stat-row"><span>Sex</span><strong>${fish.sex}</strong></div>
      <div class="stat-row"><span>Life</span><strong>${fish.lifeState}</strong></div>
      <div class="stat-row"><span>Life Stage</span><strong>${typeof fish.lifeStageLabel === 'function' ? fish.lifeStageLabel() : (fish.lifeStage ?? '')}</strong></div>
      <div class="stat-row"><span>Hunger</span><strong>${fish.hungerState} (${Math.round(fish.hunger01 * 100)}%)</strong></div>
      <div class="stat-row"><span>Wellbeing</span><strong>${Math.round(fish.wellbeing01 * 100)}%</strong></div>
      <div class="stat-row"><span>Growth</span><strong>${Math.round((fish.growth01 ?? 0) * 100)}%</strong></div>
      <div class="stat-row"><span>Aquarium Time</span><strong>${mm}:${ss}</strong></div>
      ${canDiscard ? '<div class="button-row"><button type="button" data-fish-discard>Discard</button></div>' : ''}
    `;
  }
}
