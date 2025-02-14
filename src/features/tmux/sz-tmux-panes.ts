import { LitElement, html, css, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { actions } from '../../core/actions.js';
import { isInputFocused } from '../../core/keyboard.js';
import { mobileQuery, scrollbarStyles } from '../../core/styles.js';
import { TMUX_ACTION } from './actions.js';

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
  @state() private draggedDividerIndex: number | null = null;
  @state() private paneSizes: number[] = [];
  @state() private isMobile = mobileQuery.matches;

  static styles = [scrollbarStyles, css`
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
      display: flex;
      flex-direction: column;
      overflow: hidden;
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
      display: flex;
      flex-direction: column;
      overflow: hidden;
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
  `];

  private handleMobileChange = (e: MediaQueryListEvent) => {
    this.isMobile = e.matches;
  };

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.handlePaneNav);
    mobileQuery.addEventListener('change', this.handleMobileChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handlePaneNav);
    mobileQuery.removeEventListener('change', this.handleMobileChange);
    window.removeEventListener('mousemove', this.handleDividerDrag);
    window.removeEventListener('mouseup', this.stopDividerDrag);
  }

  protected willUpdate(changedProperties: Map<PropertyKey, unknown>) {
    if (changedProperties.has('config')) {
      this.paneSizes = this.getNormalizedPaneSizes();
      if (this.config) {
        this.activePane = Math.min(this.activePane, this.config.panes.length - 1);
      } else {
        this.activePane = 0;
      }
    }
  }

  private handlePaneNav = (e: KeyboardEvent) => {
    if (isInputFocused()) return;
    if (!e.altKey || !this.config) return;
    const paneCount = this.config.panes.length;
    if (e.key === 'l' || e.key === 'j') {
      e.preventDefault();
      this.activePane = Math.min(this.activePane + 1, paneCount - 1);
      actions.dispatch(TMUX_ACTION.PANE_FOCUS, { index: this.activePane });
    } else if (e.key === 'h' || e.key === 'k') {
      e.preventDefault();
      this.activePane = Math.max(this.activePane - 1, 0);
      actions.dispatch(TMUX_ACTION.PANE_FOCUS, { index: this.activePane });
    }
  };

  private getNormalizedPaneSizes() {
    if (!this.config?.panes.length) return [];

    const sizes = this.config.panes.map((pane) => Math.max(pane.size, 0));
    const total = sizes.reduce((sum, size) => sum + size, 0);
    if (total <= 0) {
      return sizes.map(() => 100 / sizes.length);
    }

    return sizes.map((size) => (size / total) * 100);
  }

  private getLayoutDirection() {
    if (this.isMobile) {
      return 'vertical';
    }

    return this.config?.direction || 'horizontal';
  }

  private startDividerDrag = (dividerIndex: number, event: MouseEvent) => {
    if (!this.config || this.paneSizes.length < 2) return;

    event.preventDefault();
    this.draggedDividerIndex = dividerIndex;
    window.addEventListener('mousemove', this.handleDividerDrag);
    window.addEventListener('mouseup', this.stopDividerDrag);
  };

  private handleDividerDrag = (event: MouseEvent) => {
    if (this.draggedDividerIndex === null || !this.config) return;

    const container = this.renderRoot.querySelector('.panes');
    if (!(container instanceof HTMLElement)) return;

    const direction = this.getLayoutDirection();
    const rect = container.getBoundingClientRect();
    const containerSize = direction === 'horizontal' ? rect.width : rect.height;
    if (containerSize <= 0) return;

    const pointerOffset = direction === 'horizontal'
      ? event.clientX - rect.left
      : event.clientY - rect.top;
    const pointerPercent = (pointerOffset / containerSize) * 100;

    const sizes = [...this.paneSizes];
    const previousTotal = sizes
      .slice(0, this.draggedDividerIndex)
      .reduce((sum, size) => sum + size, 0);
    const combinedSize = sizes[this.draggedDividerIndex] + sizes[this.draggedDividerIndex + 1];
    const minSize = 15;
    const nextSize = Math.min(
      Math.max(pointerPercent - previousTotal, minSize),
      combinedSize - minSize,
    );

    sizes[this.draggedDividerIndex] = nextSize;
    sizes[this.draggedDividerIndex + 1] = combinedSize - nextSize;
    this.paneSizes = sizes;
  };

  private stopDividerDrag = () => {
    this.draggedDividerIndex = null;
    window.removeEventListener('mousemove', this.handleDividerDrag);
    window.removeEventListener('mouseup', this.stopDividerDrag);
  };

  private getPaneStyle(size: number) {
    const direction = this.getLayoutDirection();
    const basis = `${size}%`;

    if (direction === 'horizontal') {
      return `flex: 0 0 ${basis}; width: ${basis};`;
    }

    return `flex: 0 0 ${basis}; height: ${basis};`;
  }

  render() {
    if (!this.config) {
      return html`<div class="single"><slot name="pane-0"></slot><slot></slot></div>`;
    }

    const dir = this.config.direction || 'horizontal';
    const panes = this.config.panes;
    const sizes = this.paneSizes.length === panes.length
      ? this.paneSizes
      : this.getNormalizedPaneSizes();

    return html`
      <div class="panes ${dir}">
        ${panes.map((_pane, i) => html`
          ${i > 0 ? html`
            <div
              class="divider"
              role="separator"
              @mousedown=${(event: MouseEvent) => this.startDividerDrag(i - 1, event)}
            ></div>
          ` : nothing}
          <div
            class="pane ${i === this.activePane ? 'active' : ''}"
            style=${this.getPaneStyle(sizes[i])}
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
