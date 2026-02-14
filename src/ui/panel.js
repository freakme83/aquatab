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

    this.deckToggle = document.getElementById('deckToggle');

    this.#bindTabs();
    this.#bindControls();
    this.#bindDeckToggle();
  }

  #bindTabs() {
    this.tabButtons.forEach((button) => {
      button.addEventListener('click', () => {
        const tabName = button.dataset.tab;

        for (const b of this.tabButtons) {
          const active = b === button;
          b.classList.toggle('active', active);
          b.setAttribute('aria-selected', String(active));
        }

        for (const content of this.tabContents) {
          content.classList.toggle('active', content.dataset.content === tabName);
        }
      });
    });
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
}
