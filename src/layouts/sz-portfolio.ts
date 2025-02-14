import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { scrollbarStyles } from '../core/styles.js';

@customElement('sz-portfolio')
export class SzPortfolio extends LitElement {
  @property({
    attribute: 'filters',
    converter: {
      fromAttribute: (value: string | null) =>
        value ? value.split(',').map((filter) => filter.trim()).filter(Boolean) : [],
      toAttribute: (value: string[]) => value.join(','),
    },
  })
  filters: string[] = [];
  @state() private activeFilter = '';

  static styles = [scrollbarStyles, css`
    :host {
      display: block;
      padding: 20px;
      height: 100%;
      overflow-y: auto;
    }
    .filter-bar {
      display: flex;
      flex-wrap: wrap;
      gap: 8px;
      margin-bottom: 20px;
      padding-bottom: 12px;
      border-bottom: 1px solid var(--sz-surface0, #313244);
      position: sticky;
      top: 0;
      background: var(--sz-base, #1e1e2e);
      z-index: 2;
    }
    .filter-btn {
      padding: 4px 12px;
      border: 1px solid var(--sz-surface1, #45475a);
      border-radius: 4px;
      background: transparent;
      color: var(--sz-subtext, #a6adc8);
      cursor: pointer;
      font-family: inherit;
      font-size: var(--sz-font-size, 13px);
      transition: all 0.2s;
    }
    .filter-btn:hover {
      border-color: var(--sz-accent, #89b4fa);
      color: var(--sz-text, #cdd6f4);
    }
    .filter-btn.active {
      background: var(--sz-accent, #89b4fa);
      color: var(--sz-base, #1e1e2e);
      border-color: var(--sz-accent, #89b4fa);
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
      gap: 16px;
    }

    @media (max-width: 768px) {
      :host { padding: 12px; }
      .grid { grid-template-columns: 1fr; }
    }
  `];

  private toggleFilter(filter: string) {
    this.activeFilter = this.activeFilter === filter ? '' : filter;
    this.dispatchEvent(new CustomEvent('filter-change', {
      detail: { filter: this.activeFilter },
      bubbles: true,
      composed: true
    }));
  }

  protected updated(changedProperties: Map<PropertyKey, unknown>) {
    if (changedProperties.has('activeFilter')) {
      this.updateVisibleItems();
    }
  }

  private updateVisibleItems() {
    const items = this.querySelectorAll<HTMLElement>('[data-tags]');

    items.forEach((item) => {
      if (!this.activeFilter) {
        item.style.display = '';
        return;
      }

      const tags = item
        .getAttribute('data-tags')
        ?.split(',')
        .map((tag) => tag.trim())
        .filter(Boolean) ?? [];

      item.style.display = tags.includes(this.activeFilter) ? '' : 'none';
    });
  }

  render() {
    return html`
      ${this.filters.length > 0 ? html`
        <div class="filter-bar">
          <button
            class="filter-btn ${this.activeFilter === '' ? 'active' : ''}"
            @click=${() => this.toggleFilter('')}
          >All</button>
          ${this.filters.map(f => html`
            <button
              class="filter-btn ${this.activeFilter === f ? 'active' : ''}"
              @click=${() => this.toggleFilter(f)}
            >${f}</button>
          `)}
        </div>
      ` : nothing}
      <div class="grid">
        <slot></slot>
      </div>
    `;
  }
}
