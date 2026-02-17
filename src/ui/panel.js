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
    this.fishDetailTab = 'profile';

    this.tabButtons = [...this.root.querySelectorAll('.tab-button')];
    this.tabContents = [...this.root.querySelectorAll('.tab-content')];

    this.fpsStat = this.root.querySelector('[data-stat="fps"]');
    this.fishCountStat = this.root.querySelector('[data-stat="fishCount"]');
    this.qualityStat = this.root.querySelector('[data-stat="quality"]');
    this.simulationTimeStat = this.root.querySelector('[data-stat="simulationTime"]');

    this.fishSlider = this.root.querySelector('[data-control="fishCount"]');
    this.speedSlider = this.root.querySelector('[data-control="simSpeed"]');
    this.toggleButton = this.root.querySelector('[data-control="togglePause"]');
    this.qualityButton = this.root.querySelector('[data-control="toggleQuality"]');

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
      if (discardButton && this.currentInspectorSelectedFishId != null) {
        this.handlers.onFishDiscard?.(this.currentInspectorSelectedFishId);
        return;
      }

      const detailTabButton = event.target.closest('[data-fish-detail-tab]');
      if (detailTabButton) {
        this.fishDetailTab = detailTabButton.dataset.fishDetailTab;
      }
    });
  }

  #setQualityText(quality) {
    const label = quality === 'low' ? 'Low' : 'High';
    this.qualityStat.textContent = label;
    this.qualityButton.textContent = `Quality: ${label}`;
  }

  #formatClock(totalSeconds) {
    const sec = Math.max(0, Math.floor(totalSeconds));
    const hh = String(Math.floor(sec / 3600)).padStart(2, '0');
    const mm = String(Math.floor((sec % 3600) / 60)).padStart(2, '0');
    const ss = String(sec % 60).padStart(2, '0');
    return hh === '00' ? `${mm}:${ss}` : `${hh}:${mm}:${ss}`;
  }

  sync({ fishCount, speedMultiplier, paused, quality }) {
    this.fishSlider.value = String(fishCount);
    this.speedSlider.value = String(speedMultiplier);
    this.fishValue.textContent = String(fishCount);
    this.speedValue.textContent = `${speedMultiplier.toFixed(1)}x`;
    this.toggleButton.textContent = paused ? 'Resume' : 'Pause';
    this.#setQualityText(quality);
    if (this.simulationTimeStat) this.simulationTimeStat.textContent = '00:00';
  }

  updateStats({ fps, fishCount, quality, simTimeSec }) {
    this.fpsStat.textContent = String(Math.round(fps));
    this.fishCountStat.textContent = String(fishCount);
    this.#setQualityText(quality);
    if (this.simulationTimeStat) this.simulationTimeStat.textContent = this.#formatClock(simTimeSec ?? 0);
  }

  updateFishInspector(fishList, selectedFishId, simTimeSec) {
    if (!this.fishInspector) return;

    const activeInput = this.fishInspector.querySelector('[data-fish-name-input]:focus');
    if (activeInput) return;

    const previousList = this.fishInspector.querySelector('.fish-list');
    const previousScrollTop = previousList?.scrollTop ?? 0;

    const sorted = [...fishList].sort((a, b) => a.id - b.id);
    const byId = new Map(sorted.map((fish) => [fish.id, fish]));

    const selectedFish = sorted.find((fish) => fish.id === selectedFishId) ?? null;
    const selectedLiveAgeSec = selectedFish ? Math.floor(selectedFish.ageSeconds(simTimeSec)) : -1;
    const selectedHungerPct = selectedFish ? Math.round((selectedFish.hunger01 ?? 0) * 100) : -1;
    const selectedWellbeingPct = selectedFish ? Math.round((selectedFish.wellbeing01 ?? 0) * 100) : -1;
    const selectedGrowthPct = selectedFish ? Math.round((selectedFish.growth01 ?? 0) * 100) : -1;
    const selectedChildrenSignature = selectedFish ? (selectedFish.childrenIds ?? []).join(',') : '';

    const signature = sorted
      .map((fish) => `${fish.id}|${fish.name ?? ''}|${fish.lifeState}|${fish.hungerState}|${fish.lifeStage ?? ''}|${fish.mealsEaten ?? 0}|${fish.matingCount ?? 0}|${(fish.childrenIds ?? []).join(',')}|${fish.pregnantUntilSec ?? 'none'}`)
      .join(';')
      + `::selected=${selectedFishId ?? 'none'}`
      + `::tab=${this.fishDetailTab}`
      + `::age=${selectedLiveAgeSec}`
      + `::hunger=${selectedHungerPct}`
      + `::wellbeing=${selectedWellbeingPct}`
      + `::growth=${selectedGrowthPct}`
      + `::children=${selectedChildrenSignature}`;

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
      ? this.#fishDetailsMarkup(selectedFish, sorted, byId, simTimeSec)
      : '<p class="fish-empty">Bir balık seçin.</p>';

    this.fishInspector.innerHTML = `
      <div class="fish-list">${listHtml}</div>
      <div class="fish-detail">${detailHtml}</div>
    `;

    const nextList = this.fishInspector.querySelector('.fish-list');
    if (nextList) nextList.scrollTop = previousScrollTop;
  }

  #fishDisplayName(fish) {
    if (!fish) return '-';
    const nm = fish.name?.trim();
    return nm ? nm : `#${fish.id}`;
  }

  #fishRefLabel(fishId, byId) {
    if (!Number.isFinite(fishId)) return '-';
    const fish = byId.get(fishId);
    return fish ? this.#fishDisplayName(fish) : `#${fishId}`;
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

  #fishDetailsMarkup(fish, fishList, byId, simTimeSec) {
    const ageSec = Math.round(fish.ageSeconds(simTimeSec));
    const canDiscard = fish.lifeState !== 'ALIVE';
    const liveName = fish.name?.trim() || '';
    const draftName = this.nameDraftByFishId.get(fish.id) ?? liveName;
    const statuses = typeof fish.temporaryStatuses === 'function' ? fish.temporaryStatuses(simTimeSec) : [];
    const isPregnant = statuses.includes('pregnant');

    const historyRows = this.#fishHistoryMarkup(fish, fishList, byId, simTimeSec);
    const summaryRows = `
      <label class="control-group fish-name-group"><span>İsim</span><input type="text" maxlength="24" value="${this.#escapeAttribute(draftName)}" data-fish-name-input placeholder="Balık ismi" /></label>
      <div class="stat-row"><span>Cinsiyet</span><strong>${fish.sex}</strong></div>
      <div class="stat-row"><span>Life</span><strong>${fish.lifeState}</strong></div>
      <div class="stat-row"><span>Yaş Evresi</span><strong>${typeof fish.lifeStageLabel === 'function' ? fish.lifeStageLabel() : (fish.lifeStage ?? '')}</strong></div>
      <div class="stat-row"><span>Hunger</span><strong>${fish.hungerState} (${Math.round(fish.hunger01 * 100)}%)</strong></div>
      <div class="stat-row"><span>Wellbeing</span><strong>${Math.round(fish.wellbeing01 * 100)}%</strong></div>
      <div class="stat-row"><span>Büyüme</span><strong>${Math.round((fish.growth01 ?? 0) * 100)}%</strong></div>
      <div class="stat-row"><span>Akvaryum Süresi</span><strong>${this.#formatClock(ageSec)}</strong></div>
      ${isPregnant ? '<div class="status-pill pregnant">pregnant</div>' : ''}
      ${canDiscard ? '<div class="button-row"><button type="button" data-fish-discard>At</button></div>' : ''}
    `;

    return `
      <div class="stat-row"><span>ID</span><strong>#${fish.id}</strong></div>
      <div class="fish-detail-tabs">
        <button type="button" class="fish-detail-tab${this.fishDetailTab === 'profile' ? ' active' : ''}" data-fish-detail-tab="profile">Genel</button>
        <button type="button" class="fish-detail-tab${this.fishDetailTab === 'history' ? ' active' : ''}" data-fish-detail-tab="history">History</button>
      </div>
      ${this.fishDetailTab === 'history' ? historyRows : summaryRows}
    `;
  }

  #fishHistoryMarkup(fish, fishList, byId, simTimeSec) {
    const children = (fish.childrenIds ?? [])
      .map((id) => this.#fishRefLabel(id, byId))
      .join(', ');

    return `
      <div class="stat-row"><span>Anne</span><strong>${this.#escapeHtml(this.#fishRefLabel(fish.motherId, byId))}</strong></div>
      <div class="stat-row"><span>Baba</span><strong>${this.#escapeHtml(this.#fishRefLabel(fish.fatherId, byId))}</strong></div>
      <div class="stat-row"><span>Akvaryum Doğumu</span><strong>${fish.bornInAquarium ? 'Evet' : 'Hayır'}</strong></div>
      <div class="stat-row"><span>Toplam Yaşam</span><strong>${this.#formatClock(fish.totalLifeSeconds?.(simTimeSec) ?? fish.ageSeconds(simTimeSec))}</strong></div>
      <div class="stat-row"><span>Yemek Sayısı</span><strong>${fish.mealsEaten ?? 0}</strong></div>
      <div class="stat-row"><span>Çiftleşme</span><strong>${fish.matingCount ?? 0}</strong></div>
      <div class="stat-row"><span>Çocuklar</span><strong>${children || '-'}</strong></div>
    `;
  }
}
