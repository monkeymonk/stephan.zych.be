import { LitElement, html, css, nothing } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { deepActiveElement } from '../../core/keyboard.js';
import { KeymapController } from '../../core/keymap-controller.js';
import { OverlayController } from '../../core/overlay-controller.js';
import type { CloseReason } from '../../core/overlays.js';
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

  @query('.list') private listEl!: HTMLElement;

  /** What to hand focus back to when the picker closes. */
  private invoker: HTMLElement | null = null;

  private overlayCtrl = new OverlayController(this, {
    id: 'links',
    kind: 'modal',
    onClose: (reason) => this.hide(reason),
  });

  // The panel keys are `overlay:links`: they resolve only while the picker is
  // the current modal, which is also the WCAG 2.1.4 exemption that leaves them
  // ungated — the surface owns focus, so they cannot swallow anything the user
  // is typing. `keys` is a sequence and never an alternation, so `j`/ArrowDown
  // is two registrations of one id; the description rides the character key
  // only, so help generation dedupes by id without special-casing.
  private keysCtrl = new KeymapController(this, [
    { id: 'links.open', keys: ['l'], scope: 'page', chars: true,
      description: 'List links in the current article',
      // Desktop-only on purpose: there is no `l` key to press on a phone, and
      // the overlay would cover the article it lists.
      when: () => !mobileQuery.matches,
      run: () => this.show() },
    { id: 'links.move.down', keys: ['j'], scope: 'overlay:links', chars: false,
      run: () => { this.move(1); return true; } },
    { id: 'links.move.down', keys: ['ArrowDown'], scope: 'overlay:links', chars: false,
      run: () => { this.move(1); return true; } },
    { id: 'links.move.up', keys: ['k'], scope: 'overlay:links', chars: false,
      run: () => { this.move(-1); return true; } },
    { id: 'links.move.up', keys: ['ArrowUp'], scope: 'overlay:links', chars: false,
      run: () => { this.move(-1); return true; } },
    { id: 'links.first', keys: ['g'], scope: 'overlay:links', chars: false,
      run: () => { this.selected = 0; return true; } },
    { id: 'links.last', keys: ['G'], scope: 'overlay:links', chars: false,
      run: () => { this.selected = this.items.length - 1; return true; } },
    { id: 'links.follow', keys: ['Enter'], scope: 'overlay:links', chars: false,
      run: () => { this.follow(); return true; } },
    { id: 'links.follow', keys: [' '], scope: 'overlay:links', chars: false,
      run: () => { this.follow(); return true; } },
    { id: 'links.close', keys: ['q'], scope: 'overlay:links', chars: false,
      run: () => { this.close(); return true; } },
    { id: 'links.close', keys: ['l'], scope: 'overlay:links', chars: false,
      run: () => { this.close(); return true; } },
  ]);

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
      .count { color: var(--sz-muted, #989caf); }
      .list {
        max-height: 240px;
        overflow-y: auto;
      }
      /* Opt-in rather than a reduced-motion override: base.css's global
         scroll-behavior: auto !important cannot cross this shadow boundary. */
      @media (prefers-reduced-motion: no-preference) {
        .list { scroll-behavior: smooth; }
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
        color: var(--sz-muted, #989caf);
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
        color: var(--sz-muted, #989caf);
        margin-left: auto;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
        max-width: 45%;
        flex-shrink: 0;
      }
      /* Same reason as sz-palette: --sz-surface1 is too light to carry either
         the accent or --sz-muted at 4.5:1, so the highlighted row moves its
         whole ramp up a step rather than inheriting the resting colours. */
      .item:hover .text,
      .item.selected .text {
        color: var(--sz-text, #cdd6f4);
        font-weight: 700;
      }
      .item:hover :is(.idx, .dest),
      .item.selected :is(.idx, .dest) {
        color: var(--sz-subtext1, #bac2de);
      }
      .hint {
        padding: 5px 12px;
        border-top: 1px solid var(--sz-surface1, #45475a);
        color: var(--sz-muted, #989caf);
      }
      @media (max-width: 768px) {
        .dest { display: none; }
        /* sz-neovim is as tall as the article on mobile, not the viewport, so
           position absolute would park the picker at the bottom of the
           *document*. Pin it just above the fixed statusbar/tmux bar. */
        .overlay {
          position: fixed;
          bottom: var(--sz-mobile-chrome-bottom);
        }
      }
    `,
  ];

  // The panel declares aria-modal, which tells assistive tech to hide the rest
  // of the document — so focus has to actually be in here, or the AT user gets
  // an unreachable dialog and a hidden page. The listbox itself takes focus and
  // carries aria-activedescendant; the options stay unfocusable.
  protected updated(changed: Map<PropertyKey, unknown>) {
    if (!changed.has('open')) return;
    if (this.open) {
      this.listEl?.focus();
    } else if (this.invoker?.isConnected) {
      const target = this.invoker;
      this.invoker = null;
      target.focus();
    }
  }

  /**
   * Open the picker and take the keyboard. Returns false when the page has no
   * prose links to list, which leaves the `l` keystroke entirely alone.
   */
  private show(): boolean {
    const items = this.collect();
    if (items.length === 0) return false;
    const invoker = deepActiveElement();
    this.invoker = invoker instanceof HTMLElement ? invoker : null;
    this.items = items;
    this.selected = 0;
    this.open = true;
    this.overlayCtrl.claim();
    return true;
  }

  /** The registry's close callback — it decides when the picker goes away. */
  private hide(reason: CloseReason) {
    // A superseded picker must not take focus back: the overlay that displaced
    // it already holds it. `updated` hands focus to whatever invoker is still
    // recorded, so drop it.
    if (reason === 'superseded') this.invoker = null;
    this.open = false;
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

  // aria-modal hides the document behind us, so Tab must not walk into it. The
  // listbox is the dialog's only focusable, so holding still is the whole trap.
  // Intrinsic widget mechanics: bound to the dialog itself, never registered,
  // so it holds with no keymap mounted at all.
  private onDialogKey = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    e.preventDefault();
    this.listEl?.focus();
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
    this.overlayCtrl.release();
  }

  private follow() {
    const item = this.items[this.selected];
    this.close();
    item?.el.click(); // internal → SPA router; external → opens its _blank target
  }

  render() {
    if (!this.open) return nothing;
    return html`
      <div
        class="overlay"
        role="dialog"
        aria-modal="true"
        aria-label="Links in this article"
        @keydown=${this.onDialogKey}
      >
        <div class="panel">
          <div class="head">
            <span class="title">🔗 links in this article</span>
            <span class="count">${this.items.length}</span>
          </div>
          <div
            class="list"
            role="listbox"
            tabindex="0"
            aria-label="Links in this article"
            aria-activedescendant="sz-links-opt-${this.selected}"
          >
            ${this.items.map((item, i) => html`
              <div
                class="item ${i === this.selected ? 'selected' : ''}"
                role="option"
                id="sz-links-opt-${i}"
                aria-selected=${i === this.selected}
                @click=${() => { this.selected = i; this.follow(); }}
              >
                <span class="idx">${i + 1}</span>
                <span class="text">${item.text}</span>
                <span class="dest">${item.external ? '🌐 ' : '→ '}${item.dest}</span>
              </div>
            `)}
          </div>
          <div class="hint">↑↓ / j k move · ⏎ / space open · l / q / esc close</div>
        </div>
      </div>
    `;
  }
}
