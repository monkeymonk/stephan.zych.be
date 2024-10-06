import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';

interface PaneConfig {
  component: string;
  size: number;
}

interface SplitConfig {
  direction: 'horizontal' | 'vertical';
  panes: PaneConfig[];
}

@customElement('sz-tmux-panes')
export class SzTmuxPanes extends LitElement {
  @property({ type: Object }) config?: SplitConfig;
  @state() private activePane = 0;

  static styles = css`
    :host {
      display: flex;
      flex: 1;
      overflow: hidden;
    }
    .panes {
      display: flex;
      width: 100%;
      height: 100%;
    }
    .panes.horizontal {
      flex-direction: row;
    }
    .panes.vertical {
      flex-direction: column;
    }
    .pane {
      overflow-y: auto;
      overflow-x: hidden;
      position: relative;
      border: 1px solid transparent;
      transition: border-color 0.2s;
    }
    .pane.active {
      border-color: var(--sz-pane-active-border, #89b4fa);
    }
    .divider {
      flex-shrink: 0;
      background: var(--sz-pane-border, #313244);
      transition: background 0.2s;
      cursor: col-resize;
    }
    .divider:hover {
      background: var(--sz-accent, #89b4fa);
    }
    .panes.horizontal > .divider {
      width: 2px;
      cursor: col-resize;
    }
    .panes.vertical > .divider {
      height: 2px;
      cursor: row-resize;
    }
    .single {
      flex: 1;
      overflow-y: auto;
      overflow-x: hidden;
    }

    @media (max-width: 768px) {
      .panes.horizontal, .panes.vertical {
        flex-direction: column;
      }
      .pane {
        flex: none !important;
        width: 100% !important;
        min-height: 40vh;
      }
      .divider {
        width: 100% !important;
        height: 2px !important;
        cursor: row-resize;
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.handlePaneNav);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handlePaneNav);
  }

  private handlePaneNav = (e: KeyboardEvent) => {
    if (!e.altKey || !this.config) return;
    const paneCount = this.config.panes.length;
    if (e.key === 'l' || e.key === 'j') {
      e.preventDefault();
      this.activePane = Math.min(this.activePane + 1, paneCount - 1);
    } else if (e.key === 'h' || e.key === 'k') {
      e.preventDefault();
      this.activePane = Math.max(this.activePane - 1, 0);
    }
  };

  render() {
    if (!this.config) {
      return html`<div class="single"><slot></slot></div>`;
    }

    const dir = this.config.direction || 'horizontal';
    const panes = this.config.panes;

    return html`
      <div class="panes ${dir}">
        ${panes.map((pane, i) => html`
          ${i > 0 ? html`<div class="divider"></div>` : nothing}
          <div
            class="pane ${i === this.activePane ? 'active' : ''}"
            style="flex: ${pane.size}"
            @click=${() => { this.activePane = i; }}
            role="tabpanel"
          >
            <slot name="pane-${i}"></slot>
          </div>
        `)}
      </div>
    `;
  }
}
