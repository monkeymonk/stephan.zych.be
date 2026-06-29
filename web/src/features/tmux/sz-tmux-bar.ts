import { LitElement, html, css } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { actions, ROUTER_ACTION } from "../../core/actions.js";
import type { RouteChangedDetail } from "../../core/router.js";
import { isInputFocused } from "../../core/keyboard.js";
import type { NavTab } from "../../core/registry.js";
import { jsonArrayAttribute } from "../../core/data.js";
import { focusRing, clockStyles } from "../../core/styles.js";
import { clock, type ClockTime } from "../../core/clock.js";
import { StateController } from "../../core/state-controller.js";
import { TMUX_ACTION } from "./actions.js";

// Text-size steps for the accessibility "aA" control. Multipliers feed
// --sz-font-scale, which rescales the whole site (see base.css :root).
const FONT_SCALES = [1, 1.15, 1.3, 1.5];

@customElement("sz-tmux-bar")
export class SzTmuxBar extends LitElement {
  @property({ attribute: "active-path" }) activePath = "/";
  @property({ attribute: "nav", converter: jsonArrayAttribute }) nav: NavTab[] =
    [];
  @state() private time: ClockTime = clock.time;
  private fontCtrl = new StateController(this, ["fontScale"]);

  private clockUnsub?: () => void;
  private routeUnsub?: () => void;

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
      color: var(--sz-overlay1, #7f849c);
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
    .font-size {
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
    .font-size:focus-visible {
      color: var(--sz-text, #cdd6f4);
      background: var(--sz-surface0, #313244);
      outline: none;
    }
    /* Single inline run so the two letters share a baseline, while the run as
       a whole is centered in the bar. */
    .font-size .aa {
      display: inline-block;
      white-space: nowrap;
    }
    .font-size .a-small { font-size: 0.78em; }
    .font-size .a-large { font-size: 1.1em; font-weight: 700; }
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
      :host {
        height: 40px;
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
      .right {
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
        color: var(--sz-overlay1, #7f849c);
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
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.clockUnsub?.();
    document.removeEventListener("keydown", this.handleKeydown);
    this.routeUnsub?.();
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
    // Single-letter shortcut: first char of tab name (no modifiers)
    if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
      const key = e.key.toLowerCase();
      const tab = this.nav.find((t) => t.name.charAt(0).toLowerCase() === key);
      if (tab) {
        e.preventDefault();
        actions.dispatch(TMUX_ACTION.TAB_SWITCH, { path: tab.path });
      }
    }
  };

  private openSearch = () => {
    actions.dispatch("neovim:palette-open", { prefix: "/" });
  };

  // Step to the next text size, wrapping back to 100% after the largest.
  private cycleFontScale = () => {
    const current = this.fontCtrl.get("fontScale");
    const idx = FONT_SCALES.findIndex((s) => Math.abs(s - current) < 0.001);
    this.fontCtrl.set("fontScale", FONT_SCALES[(idx + 1) % FONT_SCALES.length]);
  };

  render() {
    const tabs = this.nav;

    return html`
      <nav class="tabs" role="tablist">
        ${tabs.map(
          (tab) => html`
            <a
              class="tab ${this.isActive(tab.path) ? "active" : ""}"
              href="${tab.path}"
              role="tab"
              aria-selected=${this.isActive(tab.path) ? "true" : undefined}
            >
              <span class="tab-key">${tab.name.charAt(0)}</span
              >${tab.name.slice(1)}
            </a>
          `,
        )}
      </nav>
      <button class="search-btn" @click=${this.openSearch} aria-label="Search">
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
        <slot name="widget">
          <div class="right-arrow"></div>
          <span class="right-item accent">${this.time.hh}<span class="clock-colon">:</span>${this.time.mm}</span>
        </slot>
      </div>
    `;
  }
}
