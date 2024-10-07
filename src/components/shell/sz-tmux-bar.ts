import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

interface Tab {
  index: number;
  name: string;
  path: string;
}

const TABS: Tab[] = [
  { index: 0, name: 'home', path: '/' },
  { index: 1, name: 'about', path: '/about/' },
  { index: 2, name: 'projects', path: '/projects/' },
  { index: 3, name: 'blog', path: '/blog/' },
  { index: 4, name: 'contact', path: '/contact/' },
];

const DEFAULT_SESSION_NAME = 'stephan.zych';

interface NavData {
  tabs?: Tab[];
  sessionName?: string;
}

@customElement('sz-tmux-bar')
export class SzTmuxBar extends LitElement {
  @property({ attribute: 'active-path' }) activePath = '/';
  @state() private tabs: Tab[] = TABS;
  @state() private sessionName = DEFAULT_SESSION_NAME;

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      height: 36px;
      background: var(--sz-tab-bg, #181825);
      font-size: 13px;
      user-select: none;
      cursor: grab;
      padding: 0 12px;
    }
    :host(:active) {
      cursor: grabbing;
    }
    .dots {
      display: flex;
      gap: 8px;
      margin-right: 16px;
      flex-shrink: 0;
    }
    .dot {
      width: 12px;
      height: 12px;
      border-radius: 50%;
      cursor: pointer;
      transition: opacity 0.2s;
    }
    .dot:hover { opacity: 0.8; }
    .dot.close { background: #ff5f57; }
    .dot.minimize { background: #febc2e; }
    .dot.maximize { background: #28c840; }

    .tabs {
      display: flex;
      gap: 2px;
      flex: 1;
      overflow-x: auto;
      scrollbar-width: none;
    }
    .tabs::-webkit-scrollbar { display: none; }

    .tab {
      display: flex;
      align-items: center;
      padding: 4px 12px;
      color: var(--sz-tab-text, #a6adc8);
      text-decoration: none;
      white-space: nowrap;
      border-radius: 4px 4px 0 0;
      transition: color 0.2s, background 0.2s;
      font-family: inherit;
    }
    .tab:hover {
      color: var(--sz-text, #cdd6f4);
      background: var(--sz-surface0, #313244);
    }
    .tab.active {
      color: var(--sz-tab-active-text, #cdd6f4);
      background: var(--sz-base, #1e1e2e);
      border-bottom: 2px solid var(--sz-tab-active, #89b4fa);
    }
    .tab-index {
      color: var(--sz-overlay0, #6c7086);
      margin-right: 4px;
    }

    .session {
      flex-shrink: 0;
      margin-left: 16px;
      color: var(--sz-green, #a6e3a1);
      font-size: 12px;
    }

    @media (max-width: 768px) {
      .dots { display: none; }
      .session { display: none; }
      :host { padding: 0 8px; cursor: default; }
    }
  `;

  private isActive(tabPath: string): boolean {
    if (tabPath === '/') return this.activePath === '/';
    return this.activePath.startsWith(tabPath);
  }

  connectedCallback() {
    super.connectedCallback();
    const navData = this.readNavData();
    this.tabs = navData.tabs ?? TABS;
    this.sessionName = navData.sessionName ?? DEFAULT_SESSION_NAME;
    document.addEventListener('keydown', this.handleKeydown);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleKeydown);
  }

  private handleKeydown = (e: KeyboardEvent) => {
    if (e.altKey && e.key >= '1' && e.key <= '5') {
      e.preventDefault();
      const index = parseInt(e.key) - 1;
      const tab = this.tabs[index];
      if (tab) window.location.href = tab.path;
    }
  };

  private readNavData(): NavData {
    const el = document.getElementById('sz-nav-data');
    if (!el?.textContent) return {};

    try {
      return JSON.parse(el.textContent) as NavData;
    } catch {
      return {};
    }
  }

  private handleDotClick(action: string, e: MouseEvent) {
    e.stopPropagation();
    const terminal = this.closest('sz-terminal') as any;
    if (!terminal) return;
    if (action === 'minimize') terminal.toggleWindowMode();
    if (action === 'maximize') terminal.toggleFullscreen();
  }

  render() {
    return html`
      <div class="dots" role="group" aria-label="Window controls">
        <div class="dot close" @click=${(e: MouseEvent) => this.handleDotClick('close', e)} title="Close"></div>
        <div class="dot minimize" @click=${(e: MouseEvent) => this.handleDotClick('minimize', e)} title="Toggle window mode"></div>
        <div class="dot maximize" @click=${(e: MouseEvent) => this.handleDotClick('maximize', e)} title="Fullscreen"></div>
      </div>
      <nav class="tabs" role="tablist">
        ${this.tabs.map(tab => html`
          <a
            class="tab ${this.isActive(tab.path) ? 'active' : ''}"
            href="${tab.path}"
            role="tab"
            aria-selected="${this.isActive(tab.path)}"
          >
            <span class="tab-index">${tab.index}:</span>${tab.name}
          </a>
        `)}
      </nav>
      <span class="session">${this.sessionName}</span>
    `;
  }
}
