/**
 * UI side panel controller.
 * Responsibility: tabs, controls binding, and stat presentation.
 */

export class Panel {
  constructor(rootElement, handlers) {
    this.root = rootElement;
    this.handlers = handlers;

    this.tabButtons = [...this.root.querySelectorAll('.tab-button')];
    this.tabContents = [...this.root.querySelectorAll('.tab-content')];

    this.fpsStat = this.root.querySelector('[data-stat="fps"]');
    this.fishCountStat = this.root.querySelector('[data-stat="fishCount"]');
    this.qualityStat = this.root.querySelector('[data-stat="quality"]');

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

  updateStats({ fps, fishCount, quality }) {
    this.fpsStat.textContent = String(Math.round(fps));
    this.fishCountStat.textContent = String(fishCount);
    this.#setQualityText(quality);
  }

  updateFishInspector(fishList, selectedFishId, simTimeSec) {
    if (!this.fishInspector) return;

    const sorted = [...fishList].sort((a, b) => a.id - b.id);
    const listHtml = sorted
      .map((fish) => {
        const selectedClass = fish.id === selectedFishId ? ' selected' : '';
        const state = `${fish.lifeState} · ${fish.hungerState}`;
        return `<button type="button" class="fish-row${selectedClass}" data-fish-id="${fish.id}">#${fish.id} · ${fish.sex} · ${state}</button>`;
      })
      .join('');

    const selectedFish = sorted.find((fish) => fish.id === selectedFishId) ?? null;
    const detailHtml = selectedFish
      ? this.#fishDetailsMarkup(selectedFish, simTimeSec)
      : '<p class="fish-empty">Bir balık seçin.</p>';

    this.fishInspector.innerHTML = `
      <div class="fish-list">${listHtml}</div>
      <div class="fish-detail">${detailHtml}</div>
    `;

    this.fishInspector.querySelectorAll('[data-fish-id]').forEach((el) => {
      el.addEventListener('click', () => {
        this.handlers.onFishSelect?.(Number(el.dataset.fishId));
      });
    });
  }

  #fishDetailsMarkup(fish, simTimeSec) {
    const ageSec = Math.round(fish.ageSeconds(simTimeSec));
    const mm = String(Math.floor(ageSec / 60)).padStart(2, '0');
    const ss = String(ageSec % 60).padStart(2, '0');

    return `
      <div class="stat-row"><span>ID</span><strong>#${fish.id}</strong></div>
      <div class="stat-row"><span>Cinsiyet</span><strong>${fish.sex}</strong></div>
      <div class="stat-row"><span>Life</span><strong>${fish.lifeState}</strong></div>
      <div class="stat-row"><span>Hunger</span><strong>${fish.hungerState} (${Math.round(fish.hunger01 * 100)}%)</strong></div>
      <div class="stat-row"><span>Wellbeing</span><strong>${Math.round(fish.wellbeing01 * 100)}%</strong></div>
      <div class="stat-row"><span>Akvaryum Süresi</span><strong>${mm}:${ss}</strong></div>
    `;
  }
}
