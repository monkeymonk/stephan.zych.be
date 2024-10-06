import { LitElement, html, css } from 'lit';
import { customElement, property, state, query } from 'lit/decorators.js';
import { StateController } from '../shared/state-controller.js';

@customElement('sz-terminal')
export class SzTerminal extends LitElement {
  private stateCtrl = new StateController(this, ['windowMode', 'transparency', 'theme']);

  @property({ attribute: 'window-mode' }) initialWindowMode: 'windowed' | 'full-page' | 'fullscreen' = 'windowed';

  @state() private dragging = false;
  @state() private position = { x: 0, y: 0 };
  @state() private offset = { x: 0, y: 0 };

  @query('.terminal') private terminalEl!: HTMLElement;

  private isMobile = false;
  private mediaQuery?: MediaQueryList;

  static styles = css`
    :host {
      display: block;
      width: 100%;
      height: 100%;
      position: relative;
    }
    .terminal {
      display: flex;
      flex-direction: column;
      border-radius: 12px;
      overflow: hidden;
      box-shadow: 0 8px 32px var(--sz-shadow, rgba(0,0,0,0.4));
      transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
      position: absolute;
    }
    .terminal.windowed {
      width: 70vw;
      height: 75vh;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      border-radius: 12px;
    }
    .terminal.full-page {
      width: 100vw;
      height: 100dvh;
      top: 0;
      left: 0;
      transform: none;
      border-radius: 0;
    }
    .terminal.fullscreen {
      width: 100vw;
      height: 100vh;
      top: 0;
      left: 0;
      transform: none;
      border-radius: 0;
    }
    .terminal.dragging {
      transition: none;
      cursor: grabbing;
    }
    .terminal-bg {
      position: absolute;
      inset: 0;
      background: var(--sz-terminal-bg, #1e1e2e);
      opacity: var(--sz-terminal-opacity, 0.95);
      z-index: 0;
    }
    .terminal-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
    }
    ::slotted([slot="bar"]) {
      flex-shrink: 0;
    }
    .content-area {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }
    ::slotted([slot="statusbar"]) {
      flex-shrink: 0;
    }
    ::slotted([slot="command"]) {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 10;
    }

    @media (max-width: 768px) {
      .terminal, .terminal.windowed {
        width: 100vw;
        height: 100dvh;
        top: 0;
        left: 0;
        transform: none;
        border-radius: 0;
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.mediaQuery = window.matchMedia('(max-width: 768px)');
    this.isMobile = this.mediaQuery.matches;
    this.mediaQuery.addEventListener('change', this.handleMediaChange);

    // Apply theme from state on page load
    const theme = this.stateCtrl.get('theme');
    document.documentElement.setAttribute('data-theme', theme);

    if (this.isMobile) {
      this.stateCtrl.set('windowMode', 'full-page');
    } else if (this.initialWindowMode !== 'windowed') {
      // Frontmatter override takes precedence
      this.stateCtrl.set('windowMode', this.initialWindowMode);
    } else {
      const saved = this.stateCtrl.get('windowMode');
      if (saved === 'fullscreen') {
        this.stateCtrl.set('windowMode', 'windowed');
      }
    }

    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
    document.addEventListener('fullscreenchange', this.handleFullscreenChange);
  }

  updated() {
    // Sync theme attribute whenever state changes
    const theme = this.stateCtrl.get('theme');
    const current = document.documentElement.getAttribute('data-theme');
    if (theme !== current) {
      document.documentElement.setAttribute('data-theme', theme);
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.mediaQuery?.removeEventListener('change', this.handleMediaChange);
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    document.removeEventListener('fullscreenchange', this.handleFullscreenChange);
  }

  private handleMediaChange = (e: MediaQueryListEvent) => {
    this.isMobile = e.matches;
    if (this.isMobile) {
      this.stateCtrl.set('windowMode', 'full-page');
      this.position = { x: 0, y: 0 };
    }
  };

  handleDragStart(e: MouseEvent) {
    if (this.stateCtrl.get('windowMode') !== 'windowed' || this.isMobile) return;
    this.dragging = true;
    const rect = this.terminalEl.getBoundingClientRect();
    this.offset = {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  private handleMouseMove = (e: MouseEvent) => {
    if (!this.dragging) return;
    const viewportW = window.innerWidth;
    const viewportH = window.innerHeight;
    let x = e.clientX - this.offset.x;
    let y = e.clientY - this.offset.y;

    // Constrain to viewport with 50px margin
    const margin = 50;
    x = Math.max(-viewportW + margin, Math.min(viewportW - margin, x));
    y = Math.max(-viewportH + margin, Math.min(viewportH - margin, y));

    this.position = { x, y };
  };

  private handleMouseUp = () => {
    this.dragging = false;
  };

  private handleFullscreenChange = () => {
    if (!document.fullscreenElement) {
      this.stateCtrl.set('windowMode', 'windowed');
      this.position = { x: 0, y: 0 };
    }
  };

  async toggleFullscreen() {
    if (this.stateCtrl.get('windowMode') === 'fullscreen') {
      await document.exitFullscreen();
    } else {
      this.stateCtrl.set('windowMode', 'fullscreen');
      await this.terminalEl.requestFullscreen().catch(() => {
        // Fallback to full-page if fullscreen denied
        this.stateCtrl.set('windowMode', 'full-page');
      });
    }
  }

  toggleWindowMode() {
    const current = this.stateCtrl.get('windowMode');
    if (current === 'windowed') {
      this.stateCtrl.set('windowMode', 'full-page');
    } else {
      this.stateCtrl.set('windowMode', 'windowed');
      this.position = { x: 0, y: 0 };
    }
  }

  render() {
    const mode = this.stateCtrl.get('windowMode');
    const transparency = this.stateCtrl.get('transparency');
    const isWindowed = mode === 'windowed' && !this.isMobile;

    const posStyle = isWindowed && (this.position.x !== 0 || this.position.y !== 0)
      ? `left: ${this.position.x}px; top: ${this.position.y}px; transform: none;`
      : '';

    return html`
      <div
        class="terminal ${mode} ${this.dragging ? 'dragging' : ''}"
        style="${posStyle}"
        role="application"
        aria-label="Terminal"
      >
        <div class="terminal-bg" style="opacity: ${transparency / 100}"></div>
        <div class="terminal-content">
          <slot name="bar" @mousedown=${(e: MouseEvent) => this.handleDragStart(e)}></slot>
          <div class="content-area">
            <slot name="content"></slot>
          </div>
          <slot name="statusbar"></slot>
          <slot name="command"></slot>
        </div>
      </div>
    `;
  }
}
