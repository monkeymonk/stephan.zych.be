import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { scrollbarStyles } from "../core/styles.js";

@customElement("sz-portfolio")
export class SzPortfolio extends LitElement {
  @property({
    attribute: "filters",
    converter: {
      fromAttribute: (value: string | null) =>
        value
          ? value
              .split(",")
              .map((filter) => filter.trim())
              .filter(Boolean)
          : [],
      toAttribute: (value: string[]) => value.join(","),
    },
  })
  filters: string[] = [];

  // Initial number of items shown, and the batch revealed each time the
  // user scrolls to the bottom (lazy-load / infinite scroll).
  @property({ attribute: "page-size", type: Number }) pageSize = 20;

  // "grid" (default) renders slotted items as a tiled card grid (projects);
  // "list" flows them as a plain block so a slotted list keeps its own styling (blog).
  @property({ attribute: "layout" }) layout = "grid";

  @state() private activeFilter = "";
  @state() private visible = 0;
  @state() private matchedCount = 0;

  private observer?: IntersectionObserver;

  static styles = [
    scrollbarStyles,
    css`
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
        padding-left: 10px;
        padding-right: 10px;
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
        .list {
          grid-template-columns: 1fr;
        }
      }
      /* plain block: let the slotted list (e.g. .post-list) keep its own layout */
      .list--list {
        display: block;
        grid-template-columns: none;
        gap: 0;
        background: transparent;
        border: 0;
      }

      /* zero-height marker observed to trigger the next lazy-load batch */
      .sentinel {
        height: 1px;
      }

      /* tmux-style status footer */
      .pager {
        display: flex;
        align-items: center;
        justify-content: flex-end;
        gap: 12px;
        margin-top: 16px;
        padding-top: 12px;
        border-top: 1px solid var(--sz-surface0, #313244);
        font-size: calc(var(--sz-font-size, 13px) * 0.9);
        color: var(--sz-overlay1, #7f849c);
      }
      .pager__info {
        white-space: nowrap;
      }

      @media (max-width: 768px) {
        :host {
          padding: 12px;
        }
        /* Filter tags: one full-bleed, horizontally-scrollable line instead of
           wrapping into many rows. Negative margins let it scroll edge-to-edge. */
        .filter-bar {
          flex-wrap: nowrap;
          overflow-x: auto;
          scrollbar-width: none;
          margin-left: -12px;
          margin-right: -12px;
          padding-left: 12px;
          padding-right: 12px;
        }
        .filter-bar::-webkit-scrollbar {
          display: none;
        }
        .filter-btn {
          flex-shrink: 0;
        }
      }
    `,
  ];

  private toggleFilter(filter: string) {
    this.activeFilter = this.activeFilter === filter ? "" : filter;
    this.visible = this.pageSize; // reset the lazy-load window on filter change
    this.dispatchEvent(
      new CustomEvent("filter-change", {
        detail: { filter: this.activeFilter },
        bubbles: true,
        composed: true,
      }),
    );
  }

  protected firstUpdated() {
    this.visible = this.pageSize;
    this.applyView();
    const slot = this.shadowRoot?.querySelector("slot");
    slot?.addEventListener("slotchange", () => this.applyView());
    this.setupObserver();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.observer?.disconnect();
  }

  protected updated(changed: Map<PropertyKey, unknown>) {
    if (
      changed.has("activeFilter") ||
      changed.has("visible") ||
      changed.has("pageSize")
    ) {
      this.applyView();
      // Keep filling while the sentinel stays in view (e.g. container taller
      // than one batch): re-observing re-fires the callback with current state.
      if (this.visible < this.matchedCount) this.reobserve();
    }
  }

  private get items(): HTMLElement[] {
    return Array.from(this.querySelectorAll<HTMLElement>("[data-tags]"));
  }

  private matched(): HTMLElement[] {
    if (!this.activeFilter) return this.items;
    return this.items.filter((el) =>
      (el.getAttribute("data-tags") ?? "")
        .split(",")
        .map((t) => t.trim())
        .filter(Boolean)
        .includes(this.activeFilter),
    );
  }

  private applyView() {
    const all = this.items;
    const matched = this.matched();
    this.matchedCount = matched.length;
    const shown = new Set(matched.slice(0, this.visible));
    for (const el of all) {
      el.style.display = shown.has(el) ? "" : "none";
    }
    this.applyGroups(shown);
  }

  // Month groups (blog archive): hide a group whose posts are all filtered out
  // or beyond the lazy-load window, and keep its header count in sync with the
  // visible posts. No-op for layouts without `.post-group` (e.g. projects).
  private applyGroups(shown: Set<HTMLElement>) {
    const groups = this.querySelectorAll<HTMLElement>(".post-group");
    for (const group of groups) {
      const posts = group.querySelectorAll<HTMLElement>("[data-tags]");
      let count = 0;
      for (const p of posts) if (shown.has(p)) count++;
      group.style.display = count ? "" : "none";
      const badge = group.querySelector<HTMLElement>(".post-month__count");
      if (badge) badge.textContent = String(count);
    }
  }

  private setupObserver() {
    const sentinel = this.shadowRoot?.querySelector(".sentinel");
    if (!sentinel) return;
    // Both layouts scroll inside the host, so observe relative to it.
    const root = this;
    this.observer?.disconnect();
    this.observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) this.revealMore();
      },
      { root, rootMargin: "300px" },
    );
    this.observer.observe(sentinel);
  }

  private reobserve() {
    const sentinel = this.shadowRoot?.querySelector(".sentinel");
    if (!sentinel || !this.observer) return;
    this.observer.unobserve(sentinel);
    this.observer.observe(sentinel);
  }

  private revealMore() {
    if (this.visible >= this.matchedCount) return;
    this.visible = Math.min(this.matchedCount, this.visible + this.pageSize);
  }

  render() {
    const noun = this.matchedCount === 1 ? "entry" : "entries";
    const shown = Math.min(this.visible, this.matchedCount);
    const hasMore = shown < this.matchedCount;
    return html`
      ${this.filters.length > 0
        ? html`
            <div class="filter-bar">
              <button
                class="filter-btn ${this.activeFilter === "" ? "active" : ""}"
                @click=${() => this.toggleFilter("")}
              >
                All
              </button>
              ${this.filters.map(
                (f) => html`
                  <button
                    class="filter-btn ${this.activeFilter === f
                      ? "active"
                      : ""}"
                    @click=${() => this.toggleFilter(f)}
                  >
                    ${f}
                  </button>
                `,
              )}
            </div>
          `
        : nothing}
      <div class="list list--${this.layout}">
        <slot></slot>
      </div>
      <div class="sentinel" aria-hidden="true"></div>
      <div class="pager">
        <span class="pager__info">
          ${hasMore
            ? `${shown} of ${this.matchedCount} — scroll to load more`
            : `${this.matchedCount} ${noun}`}
        </span>
      </div>
    `;
  }
}
