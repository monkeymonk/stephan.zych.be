import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

@customElement('sz-portfolio')
export class SzPortfolio extends LitElement {
  @property({ type: Array }) filters: string[] = [];
  @state() private activeFilter = '';

  static styles = css`
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
      font-size: 12px;
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
  `;

  private toggleFilter(filter: string) {
    this.activeFilter = this.activeFilter === filter ? '' : filter;
    this.dispatchEvent(new CustomEvent('filter-change', {
      detail: { filter: this.activeFilter },
      bubbles: true,
      composed: true
    }));
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
      ` : ''}
      <div class="grid">
        <slot></slot>
      </div>
    `;
  }
}
