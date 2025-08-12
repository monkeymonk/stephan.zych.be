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

  @property({ attribute: 'page-size', type: Number }) pageSize = 8;

  @state() private activeFilter = '';
  @state() private page = 1;
  @state() private totalPages = 1;
  @state() private matchedCount = 0;

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
      margin-bottom: 16px;
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
    /* tmux tiled-pane grid: 1px gaps over a border-coloured backplate
       render as shared single-line pane separators */
    .list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(260px, 1fr));
      grid-auto-rows: 1fr;
      gap: 1px;
      background: var(--sz-surface0, #313244);
      border: 1px solid var(--sz-surface0, #313244);
    }
    @media (max-width: 768px) {
      .list { grid-template-columns: 1fr; }
    }

    /* tmux-style status / pager footer */
    .pager {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-top: 16px;
      padding-top: 12px;
      border-top: 1px solid var(--sz-surface0, #313244);
      font-size: calc(var(--sz-font-size, 13px) * 0.9);
      color: var(--sz-overlay1, #7f849c);
    }
    .pager--static { justify-content: flex-end; }
    .pager__info { white-space: nowrap; }
    .pager__btn {
      background: transparent;
      border: 1px solid var(--sz-surface1, #45475a);
      border-radius: 4px;
      color: var(--sz-subtext, #a6adc8);
      cursor: pointer;
      font-family: inherit;
      font-size: inherit;
      padding: 3px 12px;
      transition: all 0.2s;
    }
    .pager__btn:hover:not(:disabled) {
      border-color: var(--sz-accent, #89b4fa);
      color: var(--sz-text, #cdd6f4);
    }
    .pager__btn:disabled { opacity: 0.4; cursor: default; }

    @media (max-width: 768px) {
      :host { padding: 12px; }
    }
  `];

  private toggleFilter(filter: string) {
    this.activeFilter = this.activeFilter === filter ? '' : filter;
    this.page = 1;
    this.dispatchEvent(new CustomEvent('filter-change', {
      detail: { filter: this.activeFilter },
      bubbles: true,
      composed: true,
    }));
  }

  protected firstUpdated() {
    this.applyView();
    const slot = this.shadowRoot?.querySelector('slot');
    slot?.addEventListener('slotchange', () => this.applyView());
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    if (changed.has('activeFilter') || changed.has('page') || changed.has('pageSize')) {
      this.applyView();
    }
  }

  private get items(): HTMLElement[] {
    return Array.from(this.querySelectorAll<HTMLElement>('[data-tags]'));
  }

  private matched(): HTMLElement[] {
    if (!this.activeFilter) return this.items;
    return this.items.filter((el) =>
      (el.getAttribute('data-tags') ?? '')
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean)
        .includes(this.activeFilter)
    );
  }

  private applyView() {
    const all = this.items;
    const matched = this.matched();
    this.matchedCount = matched.length;
    this.totalPages = Math.max(1, Math.ceil(matched.length / this.pageSize));
    if (this.page > this.totalPages) {
      this.page = this.totalPages; // re-runs applyView via updated()
      return;
    }
    const start = (this.page - 1) * this.pageSize;
    const visible = new Set(matched.slice(start, start + this.pageSize));
    for (const el of all) {
      el.style.display = visible.has(el) ? '' : 'none';
    }
  }

  private go(delta: number) {
    const next = Math.min(this.totalPages, Math.max(1, this.page + delta));
    if (next !== this.page) this.page = next;
  }

  private get rangeLabel(): string {
    if (this.matchedCount === 0) return 'no entries';
    const start = (this.page - 1) * this.pageSize + 1;
    const end = Math.min(this.matchedCount, this.page * this.pageSize);
    return `${start}–${end} of ${this.matchedCount}`;
  }

  render() {
    const noun = this.matchedCount === 1 ? 'entry' : 'entries';
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
      <div class="list">
        <slot></slot>
      </div>
      ${this.totalPages > 1 ? html`
        <div class="pager">
          <button class="pager__btn" ?disabled=${this.page <= 1} @click=${() => this.go(-1)}>‹ prev</button>
          <span class="pager__info">${this.rangeLabel} · page ${this.page}/${this.totalPages}</span>
          <button class="pager__btn" ?disabled=${this.page >= this.totalPages} @click=${() => this.go(1)}>next ›</button>
        </div>
      ` : html`
        <div class="pager pager--static">
          <span class="pager__info">${this.matchedCount} ${noun}</span>
        </div>
      `}
    `;
  }
}
