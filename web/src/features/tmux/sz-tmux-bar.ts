import { LitElement, html, css, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { actions, ROUTER_ACTION } from "../../core/actions.js";
import type { RouteChangedDetail } from "../../core/router.js";
import { isInputFocused, singleKeyAllowed } from "../../core/keyboard.js";
import type { NavTab } from "../../core/registry.js";
import { jsonArrayAttribute } from "../../core/data.js";
import { focusRing, clockStyles } from "../../core/styles.js";
import { clock, type ClockTime } from "../../core/clock.js";
import { StateController } from "../../core/state-controller.js";
import { TMUX_ACTION } from "./actions.js";
import { NEOVIM_ACTION, type PaletteStateDetail } from "../neovim/actions.js";

// Text-size steps for the accessibility "aA" control. Multipliers feed
// --sz-font-scale, which rescales the whole site (see base.css :root).
const FONT_SCALES = [1, 1.15, 1.3, 1.5];

@customElement("sz-tmux-bar")
export class SzTmuxBar extends LitElement {
  @property({ attribute: "active-path" }) activePath = "/";
  @property({ attribute: "nav", converter: jsonArrayAttribute }) nav: NavTab[] =
    [];
  @state() private time: ClockTime = clock.time;
  /** Text for the polite live region: text-size and shortcut-toggle changes. */
  @state() private announcement = "";
  /** Mirrors the palette so the toggle can announce whether it is expanded. */
  @state() private searchOpen = false;
  private fontCtrl = new StateController(this, ["fontScale", "keyShortcuts"]);

  private clockUnsub?: () => void;
  private routeUnsub?: () => void;
  private paletteUnsub?: () => void;

  static styles = css`
    ${focusRing}${clockStyles}
    :host {
      display: flex;
      align-items: center;
      height: 28px;
      background: var(--sz-crust, #11111b);
      font-size: var(--sz-font-size, 13px);
      user-select: none;
      flex-shrink: 0;
    }

    .tabs {
      display: flex;
      flex: 1;
      overflow-x: auto;
      scrollbar-width: none;
      height: 100%;
    }
    .tabs::-webkit-scrollbar {
      display: none;
    }

    .tab {
      display: flex;
      align-items: center;
      padding: 0 14px;
      height: 100%;
      color: var(--sz-muted, #989caf);
      text-decoration: none;
      white-space: nowrap;
      transition:
        color 0.2s,
        background 0.2s;
      font-family: inherit;
      position: relative;
    }
    .tab:hover,
    .tab:focus-visible {
      color: var(--sz-text, #cdd6f4);
      background: var(--sz-surface0, #313244);
      outline: none;
    }
    .tab.active {
      color: var(--sz-crust, #11111b);
      background: var(--sz-accent, #89b4fa);
      font-weight: 700;
    }
    .tab-key {
      font-weight: 700;
      text-decoration: underline;
      text-underline-offset: 2px;
    }

    .right {
      display: flex;
      align-items: center;
      margin-left: auto;
      height: 100%;
      gap: 0;
    }
    .right-item {
      display: flex;
      align-items: center;
      padding: 0 10px;
      height: 100%;
      min-width: 45px;
      color: var(--sz-subtext, #a6adc8);
      line-height: 28px;
      text-align: center;
    }
    .right-item.accent {
      background: var(--sz-accent, #89b4fa);
      color: var(--sz-crust, #11111b);
      font-weight: 700;
    }
    /* Shared chrome-control look for the two accessibility toggles. */
    .font-size,
    .keys-toggle {
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100%;
      padding: 0 10px;
      background: none;
      border: none;
      color: var(--sz-subtext, #a6adc8);
      font-family: inherit;
      line-height: 1;
      cursor: pointer;
      transition:
        color 0.2s,
        background 0.2s;
    }
    .font-size:hover,
    .font-size:focus-visible,
    .keys-toggle:hover,
    .keys-toggle:focus-visible {
      color: var(--sz-text, #cdd6f4);
      background: var(--sz-surface0, #313244);
      outline: none;
    }
    /* These two express focus as a background swap and deliberately drop the
       shared ring. Windows High Contrast Mode discards author backgrounds, so
       without this they would have no focus indicator at all. */
    @media (forced-colors: active) {
      .font-size:focus-visible,
      .keys-toggle:focus-visible {
        outline: 3px solid Highlight;
        outline-offset: -3px;
      }
    }
    /* Single inline run so the two letters share a baseline, while the run as
       a whole is centered in the bar. */
    .font-size .aa {
      display: inline-block;
      white-space: nowrap;
    }
    .font-size .a-small { font-size: 0.78em; }
    .font-size .a-large { font-size: 1.1em; font-weight: 700; }
    .keys-toggle {
      font-size: 1.05em;
      letter-spacing: 0;
    }
    /* Struck through when the shortcuts are off, so the state reads at a
       glance and not only from the button's aria-pressed. */
    .keys-toggle[aria-pressed="false"] {
      color: var(--sz-muted, #989caf);
      text-decoration: line-through;
    }
    .right-arrow {
      width: 0;
      height: 0;
      border-top: 14px solid transparent;
      border-bottom: 14px solid transparent;
      border-right: 10px solid var(--sz-accent, #89b4fa);
    }

    .search-btn {
      display: none;
    }

    @media (max-width: 768px) {
      /* The document scrolls on mobile, so the bottom chrome has to be pinned
         instead of riding along at the end of a fixed-height column. The
         :host background (crust) was decorative inside an opaque window and is
         now load-bearing: article text scrolls underneath. */
      :host {
        position: fixed;
        left: 0;
        right: 0;
        bottom: 0;
        /* Below the titlebar's 30, above the article. */
        z-index: 25;
        box-sizing: border-box;
        height: calc(var(--sz-mobile-tmuxbar-h) + env(safe-area-inset-bottom));
        /* Keep the tabs clear of the home-indicator strip. */
        padding-bottom: env(safe-area-inset-bottom);
        border-top: 1px solid var(--sz-surface0, #313244);
      }
      .tabs {
        justify-content: space-around;
      }
      .tab {
        flex: 1;
        justify-content: center;
        padding: 0 8px;
        font-size: 12px;
      }
      /* Drop the decorative clock and the text-size control (mobile browsers
         provide their own text zoom); keep the search button reachable. */
      .right {
        display: flex;
        align-items: center;
      }
      .right slot[name="widget"] {
        display: none;
      }
      /* Both desktop-only: mobile browsers own text zoom, and there is no
         physical keyboard to shortcut with. */
      .font-size,
      .keys-toggle {
        display: none;
      }
      .search-btn {
        display: flex;
        align-items: center;
        justify-content: center;
        width: 40px;
        height: 100%;
        background: none;
        border: none;
        border-left: 1px solid var(--sz-surface0, #313244);
        /* The glyph is this button's only label, so it follows the content
           ramp, not the decoration ramp. */
        color: var(--sz-muted, #989caf);
        cursor: pointer;
        flex-shrink: 0;
        padding: 0;
      }
      .search-btn:active {
        color: var(--sz-accent, #89b4fa);
        background: var(--sz-surface0, #313244);
      }
      .search-btn svg {
        width: 16px;
        height: 16px;
        stroke: currentColor;
        fill: none;
        stroke-width: 2;
      }
    }

    /* Announcement-only. Clipped rather than display:none — a hidden live
       region is never announced. */
    .sr-live {
      position: absolute;
      width: 1px;
      height: 1px;
      margin: -1px;
      padding: 0;
      overflow: hidden;
      clip-path: inset(50%);
      white-space: nowrap;
      border: 0;
    }
  `;

  private isActive(tabPath: string): boolean {
    if (tabPath === "/") return this.activePath === "/";
    return this.activePath.startsWith(tabPath);
  }

  connectedCallback() {
    super.connectedCallback();
    this.clockUnsub = clock.subscribe((t) => { this.time = t; });
    document.addEventListener("keydown", this.handleKeydown);
    this.routeUnsub = actions.on(ROUTER_ACTION.ROUTE_CHANGED, (a) => {
      this.activePath = (a.payload as RouteChangedDetail).path;
    });
    this.paletteUnsub = actions.on(NEOVIM_ACTION.PALETTE_STATE, (a) => {
      this.searchOpen = (a.payload as PaletteStateDetail).open;
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.clockUnsub?.();
    document.removeEventListener("keydown", this.handleKeydown);
    this.routeUnsub?.();
    this.paletteUnsub?.();
  }

  private handleKeydown = (e: KeyboardEvent) => {
    if (isInputFocused()) return;
    if (e.altKey && e.key >= "1" && e.key <= "9") {
      const index = parseInt(e.key) - 1;
      const tab = this.nav[index];
      if (tab) {
        e.preventDefault();
        actions.dispatch(TMUX_ACTION.TAB_SWITCH, { path: tab.path });
      }
      return;
    }
    // Single-letter shortcut: first char of tab name (no modifiers). Alt+N
    // above is a modified binding and stays live regardless of the setting.
    if (!singleKeyAllowed()) return;
    if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
      const key = e.key.toLowerCase();
      const tab = this.nav.find((t) => t.name.charAt(0).toLowerCase() === key);
      if (tab) {
        e.preventDefault();
        actions.dispatch(TMUX_ACTION.TAB_SWITCH, { path: tab.path });
      }
    }
  };

  // Toggle, not open. sz-palette already toggles when re-asked for the source
  // it is showing; the button just has to declare itself a palette toggle so
  // the palette's capture-phase outside-click handler does not close it out
  // from under this click and leave the press re-opening it.
  private toggleSearch = () => {
    actions.dispatch(NEOVIM_ACTION.PALETTE_OPEN, { prefix: "/" });
  };

  // Step to the next text size, wrapping back to 100% after the largest.
  private cycleFontScale = () => {
    const current = this.fontCtrl.get("fontScale");
    const idx = FONT_SCALES.findIndex((s) => Math.abs(s - current) < 0.001);
    const next = FONT_SCALES[(idx + 1) % FONT_SCALES.length];
    this.fontCtrl.set("fontScale", next);
    // The button's own label updates, but a label change on the element you
    // just pressed is not reliably re-announced — say the new size out loud.
    this.announcement = `Text size ${Math.round(next * 100)} percent`;
  };

  // WCAG 2.1.4's "mechanism to turn the shortcut off", as a control rather
  // than only a command: `:set keys off` would otherwise be a one-way door,
  // since `:` is itself one of the single-character shortcuts it disables.
  private toggleKeyShortcuts = () => {
    const next = !this.fontCtrl.get("keyShortcuts");
    this.fontCtrl.set("keyShortcuts", next);
    this.announcement = next
      ? "Single-key shortcuts on"
      : "Single-key shortcuts off. Alt shortcuts still work.";
  };

  render() {
    const tabs = this.nav;

    return html`
      ${/* These are page links, not tabs: role="tablist" would override the
            nav element's implicit landmark and leave the site's primary
            navigation contributing nothing to the landmark tree — and a
            tablist with no aria-controls, no tabpanel and no roving tabindex
            is malformed anyway. */ ""}
      <nav class="tabs" aria-label="Sections">
        ${tabs.map(
          (tab) => html`
            <a
              class="tab ${this.isActive(tab.path) ? "active" : ""}"
              href="${tab.path}"
              aria-current=${this.isActive(tab.path) ? "page" : nothing}
            >
              <span class="tab-key">${tab.name.charAt(0)}</span
              >${tab.name.slice(1)}
            </a>
          `,
        )}
      </nav>
      <button
        class="search-btn"
        data-palette-toggle
        @click=${this.toggleSearch}
        aria-label=${this.searchOpen ? "Close search" : "Search"}
        aria-expanded=${this.searchOpen}
      >
        <svg viewBox="0 0 24 24">
          <circle cx="11" cy="11" r="7" />
          <line x1="16.5" y1="16.5" x2="21" y2="21" />
        </svg>
      </button>
      <div class="right">
        <button
          class="font-size"
          @click=${this.cycleFontScale}
          aria-label="Text size: ${Math.round(this.fontCtrl.get("fontScale") * 100)}%. Click to change."
          title="Text size: ${Math.round(this.fontCtrl.get("fontScale") * 100)}% — click to enlarge"
        >
          <span class="aa"><span class="a-small">a</span><span class="a-large">A</span></span>
        </button>
        <button
          class="keys-toggle"
          @click=${this.toggleKeyShortcuts}
          aria-pressed=${this.fontCtrl.get("keyShortcuts")}
          aria-label=${this.fontCtrl.get("keyShortcuts")
            ? "Single-key shortcuts are on. Activate to turn them off."
            : "Single-key shortcuts are off. Activate to turn them on."}
          title=${this.fontCtrl.get("keyShortcuts")
            ? "Single-key shortcuts: on — click to disable (also :set keys off)"
            : "Single-key shortcuts: off — click to enable (also :set keys on)"}
        >
          <span aria-hidden="true">⌨</span>
        </button>
        <slot name="widget">
          <div class="right-arrow"></div>
          <span class="right-item accent">${this.time.hh}<span class="clock-colon">:</span>${this.time.mm}</span>
        </slot>
      </div>
      <span class="sr-live" role="status" aria-live="polite">${this.announcement}</span>
    `;
  }
}
