import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { actions, ROUTER_ACTION } from '../../core/actions.js';
import { isInputFocused } from '../../core/keyboard.js';
import { registry } from '../../core/registry.js';
import { TMUX_ACTION } from './actions.js';

@customElement('sz-tmux-bar')
export class SzTmuxBar extends LitElement {
  @property({ attribute: 'active-path' }) activePath = '/';
  @state() private time = '';

  private timer?: number;
  private routeUnsub?: () => void;

  static styles = css`
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
    .tabs::-webkit-scrollbar { display: none; }

    .tab {
      display: flex;
      align-items: center;
      padding: 0 14px;
      height: 100%;
      color: var(--sz-overlay1, #7f849c);
      text-decoration: none;
      white-space: nowrap;
      transition: color 0.2s, background 0.2s;
      font-family: inherit;
      position: relative;
    }
    .tab:hover, .tab:focus-visible {
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
      color: var(--sz-subtext, #a6adc8);
    }
    .right-item.accent {
      background: var(--sz-accent, #89b4fa);
      color: var(--sz-crust, #11111b);
      font-weight: 700;
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
      .right { display: none; }
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
    if (tabPath === '/') return this.activePath === '/';
    return this.activePath.startsWith(tabPath);
  }

  connectedCallback() {
    super.connectedCallback();
    this.updateTime();
    this.timer = window.setInterval(() => this.updateTime(), 60000);
    document.addEventListener('keydown', this.handleKeydown);
    this.routeUnsub = actions.on(ROUTER_ACTION.ROUTE_CHANGED, (a) => {
      this.activePath = (a.payload as any).path;
    });
    document.addEventListener('visibilitychange', this.handleVisibility);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.timer) clearInterval(this.timer);
    document.removeEventListener('keydown', this.handleKeydown);
    document.removeEventListener('visibilitychange', this.handleVisibility);
    this.routeUnsub?.();
  }

  private updateTime() {
    const now = new Date();
    this.time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  private handleVisibility = () => {
    if (document.hidden) {
      if (this.timer) { clearInterval(this.timer); this.timer = undefined; }
    } else {
      this.updateTime();
      this.timer = window.setInterval(() => this.updateTime(), 60000);
    }
  };

  private handleKeydown = (e: KeyboardEvent) => {
    if (isInputFocused()) return;
    if (e.altKey && e.key >= '1' && e.key <= '9') {
      const index = parseInt(e.key) - 1;
      const tab = registry.nav[index];
      if (tab) {
        e.preventDefault();
        actions.dispatch(TMUX_ACTION.TAB_SWITCH, { path: tab.path });
      }
      return;
    }
    // Single-letter shortcut: first char of tab name (no modifiers)
    if (!e.altKey && !e.ctrlKey && !e.metaKey && e.key.length === 1) {
      const key = e.key.toLowerCase();
      const tab = registry.nav.find(t => t.name.charAt(0).toLowerCase() === key);
      if (tab) {
        e.preventDefault();
        actions.dispatch(TMUX_ACTION.TAB_SWITCH, { path: tab.path });
      }
    }
  };

  private openSearch = () => {
    actions.dispatch('neovim:palette-open', { prefix: '/' });
  };

  render() {
    const tabs = registry.nav;

    return html`
      <nav class="tabs" role="tablist">
        ${tabs.map(tab => html`
          <a
            class="tab ${this.isActive(tab.path) ? 'active' : ''}"
            href="${tab.path}"
            role="tab"
            aria-selected=${this.isActive(tab.path) ? 'true' : undefined}
          >
            <span class="tab-key">${tab.name.charAt(0)}</span>${tab.name.slice(1)}
          </a>
        `)}
      </nav>
      <button class="search-btn" @click=${this.openSearch} aria-label="Search">
        <svg viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>
      </button>
      <div class="right">
        <slot name="widget">
          <div class="right-arrow"></div>
          <span class="right-item accent">${this.time}</span>
        </slot>
      </div>
    `;
  }
}
