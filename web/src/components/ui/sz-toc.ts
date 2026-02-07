import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { scrollbarStyles } from '../../core/styles.js';

interface TocItem {
  id: string;
  text: string;
  level: number;
  el: HTMLElement;
}

/**
 * Reading aid for articles: a sticky outline rail (scroll-spy: highlights the
 * section you're in, click to jump) plus a thin top progress bar tracking
 * scroll through the article. Reads headings straight from the rendered light
 * DOM, so it needs no data wiring — drop <sz-toc> above an article body.
 *
 * The article scrolls inside #main-content (sz-neovim makes it the scroller),
 * not the window, so progress and active-section are measured against it.
 */
@customElement('sz-toc')
export class SzToc extends LitElement {
  @state() private items: TocItem[] = [];
  @state() private activeId = '';
  @state() private progress = 0;
  @state() private compact = false;

  private scroller: HTMLElement | null = null;
  private bodyEl: HTMLElement | null = null;
  private articleEl: HTMLElement | null = null;
  private ticking = false;
  private resizeObserver: ResizeObserver | null = null;
  private viewObserver: MutationObserver | null = null;
  /** px of clear space the column's right edge needs for the rail to show. */
  private readonly RAIL_SPACE = 240;
  /** px gap kept above the rail once it sticks to the top. */
  private readonly STICKY_OFFSET = 16;

  static styles = [scrollbarStyles, css`
    :host {
      position: sticky;
      top: 0;
      z-index: 4;
      display: block;
      height: 0;            /* overlay — takes no layout space */
      overflow: visible;
      pointer-events: none; /* children re-enable where interactive */
    }

    .progress {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      height: 2px;
      background: var(--sz-surface0, #313244);
    }
    .progress__fill {
      height: 100%;
      background: linear-gradient(90deg, var(--sz-accent, #89b4fa), var(--sz-mauve, #cba6f7));
      transition: width 0.08s linear;
    }

    .rail {
      position: absolute;
      top: var(--rail-top, 5.5rem);
      right: clamp(8px, 2vw, 28px);
      width: 14rem;
      max-height: 60vh;
      overflow-y: auto;
      pointer-events: auto;
      border: 1px solid var(--sz-surface1, #45475a);
      border-radius: 8px;
      background: color-mix(in srgb, var(--sz-mantle, #181825) 86%, transparent);
      backdrop-filter: blur(6px);
      padding: calc(var(--sz-line-px) * 0.5) 0;
      font-size: calc(var(--sz-font-size, 13px) * 0.86);
    }

    .rail__label {
      padding: 0 0.9rem calc(var(--sz-line-px) * 0.35);
      color: var(--sz-overlay0, #6c7086);
      text-transform: uppercase;
      letter-spacing: 0.12em;
      font-size: calc(var(--sz-font-size, 13px) * 0.72);
      user-select: none;
    }

    ul { list-style: none; margin: 0; padding: 0; }

    a {
      display: flex;
      gap: 0.45rem;
      align-items: baseline;
      padding: 1px 0.9rem;
      line-height: var(--sz-line-px);
      color: var(--sz-subtext0, #a6adc8);
      text-decoration: none;
      border-left: 2px solid transparent;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
    }
    a:hover { color: var(--sz-text, #cdd6f4); background: color-mix(in srgb, var(--sz-surface0, #313244) 60%, transparent); }
    li.lvl-3 a { padding-left: 1.9rem; font-size: 0.95em; }

    .marker { color: var(--sz-overlay0, #6c7086); flex: none; }

    a.active {
      color: var(--sz-accent, #89b4fa);
      border-left-color: var(--sz-accent, #89b4fa);
      font-weight: 600;
    }
    a.active .marker { color: var(--sz-accent, #89b4fa); }

    .text { overflow: hidden; text-overflow: ellipsis; }

    :host(.compact) .rail { display: none; }

    @media print { :host { display: none; } }
  `];

  connectedCallback() {
    super.connectedCallback();
    // Defer one frame so the article body (and its build-time heading ids) is
    // in the DOM — during SPA navigation children are appended just before.
    requestAnimationFrame(() => this.collect());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.detach();
  }

  private collect() {
    const main = document.getElementById('main-content');
    const root: ParentNode = main ?? document;
    const headings = Array.from(
      root.querySelectorAll<HTMLElement>('.sz-article__body h2[id], .sz-article__body h3[id]')
    );

    this.items = headings.map((h) => {
      const clone = h.cloneNode(true) as HTMLElement;
      clone.querySelector('.sz-heading-indicator')?.remove();
      return {
        id: h.id,
        text: (clone.textContent || '').trim(),
        level: Number(h.tagName[1]),
        el: h,
      };
    });

    if (this.items.length < 2) {
      this.items = [];
      return;
    }

    this.scroller = main;
    const scope: ParentNode = main ?? document;
    this.bodyEl = scope.querySelector<HTMLElement>('.sz-article__body');
    this.articleEl = scope.querySelector<HTMLElement>('.sz-article');
    this.attach();
    this.measureFit();
    this.recompute();
    this.settle();
  }

  /**
   * Layout lands in stages after a (SPA) navigation: children are appended,
   * the router resets scrollTop on the next frame, sz-markdown wraps the body
   * with line numbers, and the hero/body images load. Each shifts the body's
   * top — so re-measure across those stages, otherwise the rail anchors to a
   * stale position until the reader happens to scroll.
   */
  private settle() {
    requestAnimationFrame(() => {
      this.recompute();
      requestAnimationFrame(() => this.reflow());
    });
    const imgs = this.articleEl?.querySelectorAll<HTMLImageElement>('img') ?? [];
    for (const img of Array.from(imgs)) {
      if (!img.complete) img.addEventListener('load', this.onScroll, { once: true });
    }
  }

  private attach() {
    const target: EventTarget = this.scroller ?? window;
    target.addEventListener('scroll', this.onScroll, { passive: true });
    window.addEventListener('resize', this.onScroll, { passive: true });
    if (this.scroller) {
      this.resizeObserver = new ResizeObserver(() => this.reflow());
      this.resizeObserver.observe(this.scroller);
      // Observe the article too: as its height settles (images, line numbers)
      // the body's top shifts, and the rail must re-anchor to it.
      if (this.articleEl) this.resizeObserver.observe(this.articleEl);
    }
    // The code⟷reading toggle shifts the column (left-aligned vs centered),
    // changing how much room is left for the rail — re-measure on view change.
    this.viewObserver = new MutationObserver(() => this.reflow());
    this.viewObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-view'],
    });
  }

  private detach() {
    const target: EventTarget = this.scroller ?? window;
    target.removeEventListener('scroll', this.onScroll);
    window.removeEventListener('resize', this.onScroll);
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.viewObserver?.disconnect();
    this.viewObserver = null;
  }

  /** Show the rail only when the column leaves real clear space to its right. */
  private measureFit() {
    const sc = this.scroller;
    if (!sc || !this.items.length) return;
    const colRight = this.items[0].el.getBoundingClientRect().right;
    const free = sc.getBoundingClientRect().right - colRight;
    this.compact = free < this.RAIL_SPACE;
    this.classList.toggle('compact', this.compact);
  }

  private onScroll = () => {
    if (this.ticking) return;
    this.ticking = true;
    requestAnimationFrame(() => {
      this.ticking = false;
      this.recompute();
    });
  };

  private reflow() {
    this.measureFit();
    this.recompute();
  }

  private recompute() {
    const sc = this.scroller;
    const scrollTop = sc ? sc.scrollTop : window.scrollY;
    const clientH = sc ? sc.clientHeight : window.innerHeight;
    const scrollH = sc ? sc.scrollHeight : document.documentElement.scrollHeight;
    const max = Math.max(1, scrollH - clientH);
    this.progress = Math.min(100, Math.max(0, (scrollTop / max) * 100));

    const viewportTop = sc ? sc.getBoundingClientRect().top : 0;

    // Anchor the rail to the body's top so it begins just under the article
    // header, then let it ride up with the page until it sticks at the offset.
    if (this.bodyEl) {
      const bodyTop = this.bodyEl.getBoundingClientRect().top - viewportTop;
      this.style.setProperty('--rail-top', `${Math.max(this.STICKY_OFFSET, bodyTop)}px`);
    }

    const threshold = clientH * 0.3;
    let active = this.items[0]?.id ?? '';
    for (const it of this.items) {
      if (it.el.getBoundingClientRect().top - viewportTop <= threshold) active = it.id;
      else break;
    }
    this.activeId = active;
  }

  private jump(e: Event, item: TocItem) {
    e.preventDefault();
    item.el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    history.replaceState(null, '', `#${item.id}`);
    this.activeId = item.id;
  }

  render() {
    if (!this.items.length) return html``;
    return html`
      <div class="progress" role="progressbar" aria-label="Reading progress"
           aria-valuemin="0" aria-valuemax="100" aria-valuenow=${Math.round(this.progress)}>
        <div class="progress__fill" style="width:${this.progress}%"></div>
      </div>
      <nav class="rail" aria-label="Article outline">
        <div class="rail__label">outline</div>
        <ul>
          ${this.items.map((it) => html`
            <li class="lvl-${it.level}">
              <a href="#${it.id}"
                 class=${it.id === this.activeId ? 'active' : ''}
                 aria-current=${it.id === this.activeId ? 'true' : 'false'}
                 @click=${(e: Event) => this.jump(e, it)}>
                <span class="marker" aria-hidden="true">${it.id === this.activeId ? '▾' : '▸'}</span>
                <span class="text">${it.text}</span>
              </a>
            </li>
          `)}
        </ul>
      </nav>
    `;
  }
}
