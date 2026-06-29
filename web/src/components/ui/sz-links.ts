import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { isInputFocused } from '../../core/keyboard.js';
import { scrollbarStyles, mobileQuery } from '../../core/styles.js';

interface LinkItem {
  text: string;
  el: HTMLAnchorElement;
  external: boolean;
  dest: string;
}

// sz-links is the web counterpart of the TUI's `l` link picker: press `l` to
// list every hyperlink in the current article/page, navigate with j/k, and open
// with Enter. Following a link just clicks the real anchor, so the SPA router
// (internal) and new-tab behaviour (external) are reused as-is.
@customElement('sz-links')
export class SzLinks extends LitElement {
  @state() private open = false;
  @state() private items: LinkItem[] = [];
  @state() private selected = 0;

  static styles = [
    scrollbarStyles,
    css`
      :host { display: contents; }
      .overlay {
        position: absolute;
        bottom: 24px; left: 0; right: 0;
        z-index: 20;
      }
      .panel {
        background: var(--sz-command-bg, #313244);
        border-top: 1px solid var(--sz-surface1, #45475a);
        font-size: var(--sz-font-size, 13px);
      }
      .head {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 6px 12px;
        border-bottom: 1px solid var(--sz-surface1, #45475a);
      }
      .title { color: var(--sz-mauve, #cba6f7); font-weight: 700; }
      .count { color: var(--sz-overlay1, #7f849c); }
      .list {
        max-height: 240px;
        overflow-y: auto;
        scroll-behavior: smooth;
      }
      .item {
        display: flex;
        align-items: baseline;
        gap: 10px;
        padding: 4px 12px;
        cursor: pointer;
      }
      .item:hover, .item.selected { background: var(--sz-surface1, #45475a); }
      .idx {
        color: var(--sz-overlay0, #6c7086);
        min-width: 1.5em;
        text-align: right;
        flex-shrink: 0;
        font-variant-numeric: tabular-nums;
      }
      .text {
        color: var(--sz-command-highlight, #89b4fa);
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        flex-shrink: 1;
        min-width: 0;
      }
      .dest {
        color: var(--sz-overlay1, #7f849c);
        margin-left: auto;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 45%;
        flex-shrink: 0;
      }
      .hint {
        padding: 5px 12px;
        border-top: 1px solid var(--sz-surface1, #45475a);
        color: var(--sz-overlay0, #6c7086);
      }
      @media (max-width: 768px) { .dest { display: none; } }
    `,
  ];

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.onKey);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.onKey);
  }

  // Reflect open state to the host so global wiring (e.g. [ / ] article nav) can
  // yield while the picker owns the keyboard.
  protected updated() {
    this.toggleAttribute('open', this.open);
  }

  // Gather the article-body links at open time, deduped by destination.
  private collect(): LinkItem[] {
    const anchors = document.querySelectorAll<HTMLAnchorElement>('.sz-prose a[href]');
    const seen = new Set<string>();
    const items: LinkItem[] = [];
    for (const el of anchors) {
      const href = el.getAttribute('href') ?? '';
      if (!href || href.startsWith('#') || seen.has(href)) continue;
      // Skip the article's own chrome (share / author footer) — body links only.
      if (el.closest('.sz-md-footer') || el.closest('.sz-md-header')) continue;
      seen.add(href);
      const external = /^https?:\/\//.test(href) && !href.includes(location.hostname);
      // Text without the injected 🌐/🔗 icon span.
      const clone = el.cloneNode(true) as HTMLElement;
      clone.querySelector('.sz-link-icon')?.remove();
      const text = (clone.textContent ?? '').trim() || href;
      const dest = external ? href.replace(/^https?:\/\//, '').replace(/\/$/, '') : href;
      items.push({ text, el, external, dest });
    }
    return items;
  }

  private onKey = (e: KeyboardEvent) => {
    if (this.open) {
      switch (e.key) {
        case 'Escape': case 'l': e.preventDefault(); this.close(); return;
        case 'ArrowDown': case 'j': e.preventDefault(); this.move(1); return;
        case 'ArrowUp': case 'k': e.preventDefault(); this.move(-1); return;
        case 'g': e.preventDefault(); this.selected = 0; return;
        case 'G': e.preventDefault(); this.selected = this.items.length - 1; return;
        case 'Enter': e.preventDefault(); this.follow(); return;
      }
      return;
    }

    if (e.key !== 'l' || e.ctrlKey || e.metaKey || e.altKey) return;
    if (isInputFocused()) return;
    if (mobileQuery.matches) return;
    const items = this.collect();
    if (items.length === 0) return;
    e.preventDefault();
    this.items = items;
    this.selected = 0;
    this.open = true;
  };

  private move(delta: number) {
    const n = this.items.length;
    if (n === 0) return;
    this.selected = ((this.selected + delta) % n + n) % n;
    this.updateComplete.then(() =>
      this.shadowRoot?.querySelector('.item.selected')?.scrollIntoView({ block: 'nearest' }),
    );
  }

  private close() {
    this.open = false;
  }

  private follow() {
    const item = this.items[this.selected];
    this.close();
    item?.el.click(); // internal → SPA router; external → opens its _blank target
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <div class="overlay" role="dialog" aria-modal="true" aria-label="Links in this article">
        <div class="panel">
          <div class="head">
            <span class="title">🔗 links in this article</span>
            <span class="count">${this.items.length}</span>
          </div>
          <div class="list" role="listbox" aria-label="Links in this article">
            ${this.items.map((item, i) => html`
              <div
                class="item ${i === this.selected ? 'selected' : ''}"
                role="option"
                aria-selected=${i === this.selected}
                @click=${() => { this.selected = i; this.follow(); }}
              >
                <span class="idx">${i + 1}</span>
                <span class="text">${item.text}</span>
                <span class="dest">${item.external ? '🌐 ' : '→ '}${item.dest}</span>
              </div>
            `)}
          </div>
          <div class="hint">↑↓ / j k move · ⏎ open · l / esc close</div>
        </div>
      </div>
    `;
  }
}
