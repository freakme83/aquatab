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

    this.fishCountStat = this.root.querySelector('[data-stat="fishCount"]');
    this.cleanlinessStat = this.root.querySelector('[data-stat="cleanliness"]');

    this.speedSlider = this.root.querySelector('[data-control="simSpeed"]');
    this.toggleButton = this.root.querySelector('[data-control="togglePause"]');
    this.installFilterButton = this.root.querySelector('[data-control="installFilter"]');
    this.maintainFilterButton = this.root.querySelector('[data-control="maintainFilter"]');
    this.restartButton = this.root.querySelector('[data-control="restartSim"]');
    this.restartConfirm = this.root.querySelector('[data-restart-confirm]');
    this.restartConfirmYes = this.root.querySelector('[data-control="restartConfirmYes"]');
    this.restartConfirmNo = this.root.querySelector('[data-control="restartConfirmNo"]');

    this.filterAccordion = this.root.querySelector('[data-filter-accordion]');
    this.filterAccordionToggle = this.root.querySelector('[data-control="toggleFilterAccordion"]');
    this.filterContent = this.root.querySelector('[data-filter-content]');
    this.filterMessage = this.root.querySelector('[data-filter-message]');
    this.filterFeedProgress = this.root.querySelector('[data-filter-feed-progress]');
    this.filterInstallProgressRow = this.root.querySelector('[data-filter-install-progress-row]');
    this.filterInstallProgress = this.root.querySelector('[data-filter-install-progress]');
    this.filterInstallBarTrack = this.root.querySelector('[data-filter-install-bar-track]');
    this.filterInstallBar = this.root.querySelector('[data-filter-install-bar]');
    this.filterStatusRow = this.root.querySelector('[data-filter-status-row]');
    this.filterStatus = this.root.querySelector('[data-filter-status]');
    this.filterHealthRow = this.root.querySelector('[data-filter-health-row]');
    this.filterHealth = this.root.querySelector('[data-filter-health]');
    this.filterActionRow = this.root.querySelector('[data-filter-action-row]');
    this.filterAction = this.root.querySelector('[data-filter-action]');
    this.filterToggleRow = this.root.querySelector('[data-filter-toggle-row]');

    this.installFilterButton = this.root.querySelector('[data-control="installFilter"]');
    this.maintainFilterButton = this.root.querySelector('[data-control="maintainFilter"]');
    this.restartButton = this.root.querySelector('[data-control="restartSim"]');
    this.restartConfirm = this.root.querySelector('[data-restart-confirm]');
    this.restartConfirmYes = this.root.querySelector('[data-control="restartConfirmYes"]');
    this.restartConfirmNo = this.root.querySelector('[data-control="restartConfirmNo"]');
    this.toggleFilterPowerButton = this.root.querySelector('[data-control="toggleFilterPower"]');

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
    this.speedSlider.addEventListener('input', (event) => {
      const value = Number(event.target.value);
      this.speedValue.textContent = `${value.toFixed(1)}x`;
      this.handlers.onSpeedChange(value);
    });

    this.toggleButton.addEventListener('click', () => {
      const isPaused = this.handlers.onPauseToggle();
      this.toggleButton.textContent = isPaused ? 'Resume' : 'Pause';
    });

    this.restartButton?.addEventListener('click', () => {
      if (this.restartConfirm) this.restartConfirm.hidden = false;
    });

    this.restartConfirmYes?.addEventListener('click', () => {
      if (this.restartConfirm) this.restartConfirm.hidden = true;
      this.handlers.onRestartConfirm?.();
    });

    this.restartConfirmNo?.addEventListener('click', () => {
      if (this.restartConfirm) this.restartConfirm.hidden = true;
    });

    this.filterAccordionToggle?.addEventListener('click', () => {
      const nextOpen = this.filterAccordion?.dataset.open !== 'true';
      if (this.filterAccordion) this.filterAccordion.dataset.open = String(nextOpen);
      this.filterAccordionToggle?.setAttribute('aria-expanded', String(nextOpen));
      if (this.filterContent) this.filterContent.hidden = !nextOpen;
    });

    this.installFilterButton?.addEventListener('click', () => {
      this.handlers.onFilterInstall?.();
    });

    this.maintainFilterButton?.addEventListener('click', () => {
      this.handlers.onFilterMaintain?.();
    });

    this.toggleFilterPowerButton?.addEventListener('click', () => {
      this.handlers.onFilterTogglePower?.();
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



  sync({ speedMultiplier, paused }) {
    this.speedSlider.value = String(speedMultiplier);
    this.speedValue.textContent = `${speedMultiplier.toFixed(1)}x`;
    this.toggleButton.textContent = paused ? 'Resume' : 'Pause';
    if (this.restartConfirm) this.restartConfirm.hidden = true;
  }

  updateStats({
    fishCount,
    cleanliness01,
    filterUnlocked,
    foodsConsumedCount,
    filterUnlockThreshold,
    filterInstalled,
    filterEnabled,
    filter01,
    installProgress01,
    maintenanceProgress01,
    maintenanceCooldownSec,
    filterDepletedThreshold01
  }) {
    this.fishCountStat.textContent = String(fishCount);

    if (this.cleanlinessStat) {
      const cleanlinessPct = Math.round((cleanliness01 ?? 1) * 100);
      this.cleanlinessStat.textContent = `${cleanlinessPct}%`;
    }

    const consumed = Math.max(0, Math.floor(foodsConsumedCount ?? 0));
    const target = Math.max(0, Math.floor(filterUnlockThreshold ?? 0));
    const isInstalling = (installProgress01 ?? 0) > 0;
    const isMaintaining = (maintenanceProgress01 ?? 0) > 0;
    const depleted = filterInstalled && !isMaintaining && (filter01 ?? 0) <= (filterDepletedThreshold01 ?? 0.1);

    if (this.filterAccordion) {
      this.filterAccordion.classList.toggle('is-dim', !filterInstalled);
    }

    if (this.filterFeedProgress) {
      this.filterFeedProgress.textContent = `${consumed} / ${target}`;
    }

    if (this.filterMessage) {
      if (!filterUnlocked) {
        this.filterMessage.textContent = `To install the filter: feed your fish ${target} times.`;
      } else if (isInstalling) {
        this.filterMessage.textContent = `Installing... ${Math.round((installProgress01 ?? 0) * 100)}%`;
      } else if (!filterInstalled) {
        this.filterMessage.textContent = 'Filter available. Install to start cleaning water.';
      } else {
        this.filterMessage.textContent = 'Filter installed and ready.';
      }
    }

    if (this.filterInstallProgressRow) this.filterInstallProgressRow.hidden = !isInstalling;
    if (this.filterInstallBarTrack) this.filterInstallBarTrack.hidden = !isInstalling;
    if (this.filterInstallProgress) this.filterInstallProgress.textContent = `${Math.round((installProgress01 ?? 0) * 100)}%`;
    if (this.filterInstallBar) this.filterInstallBar.style.width = `${Math.round((installProgress01 ?? 0) * 100)}%`;

    if (this.installFilterButton) {
      const canInstall = filterUnlocked && !filterInstalled && !isInstalling;
      this.installFilterButton.hidden = !canInstall;
      this.installFilterButton.disabled = !canInstall;
    }

    if (this.filterStatusRow) this.filterStatusRow.hidden = !filterInstalled;
    if (this.filterStatus) this.filterStatus.textContent = filterEnabled ? 'ON' : 'OFF';

    if (this.filterHealthRow) this.filterHealthRow.hidden = !filterInstalled;
    if (this.filterHealth) this.filterHealth.textContent = `${Math.round(Math.max(0, filter01 ?? 0) * 100)}%`;

    if (this.filterActionRow) this.filterActionRow.hidden = !filterInstalled;
    if (this.filterAction) {
      if (isMaintaining) {
        this.filterAction.textContent = `Maintaining... ${Math.round((maintenanceProgress01 ?? 0) * 100)}%`;
      } else if (depleted) {
        this.filterAction.textContent = 'Maintenance required';
      } else if ((maintenanceCooldownSec ?? 0) > 0) {
        this.filterAction.textContent = `Maintenance cooldown: ${Math.ceil(maintenanceCooldownSec ?? 0)}s`;
      } else {
        this.filterAction.textContent = '--';
      }
    }

    if (this.filterToggleRow) this.filterToggleRow.hidden = !filterInstalled;
    if (this.toggleFilterPowerButton) {
      this.toggleFilterPowerButton.hidden = !filterInstalled;
      this.toggleFilterPowerButton.textContent = filterEnabled ? 'Turn OFF' : 'Turn ON';
    }

    if (this.maintainFilterButton) {
      const canMaintain = filterInstalled && !isInstalling && !isMaintaining && (maintenanceCooldownSec ?? 0) <= 0;
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
