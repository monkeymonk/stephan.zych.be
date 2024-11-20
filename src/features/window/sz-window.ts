import { LitElement, css, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { actions } from '../../core/actions.js';
import { WINDOW_ACTION } from './actions.js';

type TitlebarMode = 'visible' | 'integrated' | 'hidden';
type WindowButton = 'close' | 'maximize' | 'minimize';

export interface WindowLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

const DEFAULT_BUTTONS: WindowButton[] = ['close', 'maximize', 'minimize'];

@customElement('sz-window')
export class SzWindow extends LitElement {
  static zCounter = 100;

  @property() titlebar: TitlebarMode = 'visible';
  @property() title = '';
  @property({ type: Array }) buttons: WindowButton[] = [...DEFAULT_BUTTONS];

  static styles = css`
    :host {
      position: relative;
      display: block;
      min-width: 0;
      min-height: 0;
    }

    .window {
      position: relative;
      display: flex;
      min-width: 0;
      min-height: 0;
      height: 100%;
      flex-direction: column;
      overflow: hidden;
      border-radius: 12px;
      background: rgb(30 30 46 / 0.82);
      backdrop-filter: blur(24px) saturate(130%);
      -webkit-backdrop-filter: blur(24px) saturate(130%);
      box-shadow:
        0 4px 16px rgb(0 0 0 / 0.3),
        0 8px 32px rgb(0 0 0 / 0.2),
        0 20px 60px rgb(0 0 0 / 0.15),
        0 0 0 1px rgb(255 255 255 / 0.05),
        0 0 80px -20px rgb(137 180 250 / 0.06);
    }

    .frame {
      position: relative;
      z-index: 1;
      display: flex;
      min-width: 0;
      min-height: 0;
      flex: 1;
      flex-direction: column;
    }

    .titlebar {
      display: flex;
      align-items: center;
      gap: 12px;
      min-height: 32px;
      padding: 0 12px;
      user-select: none;
      flex-shrink: 0;
      background: var(--sz-mantle, #181825);
      border-bottom: 1px solid var(--sz-surface0, #313244);
    }

    .titlebar[data-mode='integrated'] {
      background: transparent;
      border-bottom: none;
      min-height: 36px;
      padding-top: 6px;
      padding-bottom: 6px;
    }

    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
      flex-shrink: 0;
    }

    .traffic {
      width: 12px;
      height: 12px;
      padding: 0;
      border: none;
      border-radius: 999px;
      cursor: pointer;
      transition: transform 0.2s ease, filter 0.2s ease, opacity 0.2s ease;
    }

    .traffic:hover,
    .traffic:focus-visible {
      transform: scale(1.06);
      filter: brightness(1.08);
      outline: none;
    }

    .traffic[data-kind='close'] {
      background: #ff5f57;
      box-shadow: 0 0 0 1px rgb(0 0 0 / 0.15) inset;
    }

    .traffic[data-kind='minimize'] {
      background: #febc2e;
      box-shadow: 0 0 0 1px rgb(0 0 0 / 0.12) inset;
    }

    .traffic[data-kind='maximize'] {
      background: #28c840;
      box-shadow: 0 0 0 1px rgb(0 0 0 / 0.12) inset;
    }

    .title {
      flex: 1;
      min-width: 0;
      color: var(--sz-overlay1, #7f849c);
      font-size: var(--sz-font-size, 13px);
      line-height: 1.2;
      text-align: center;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      pointer-events: none;
    }

    .title-spacer {
      width: 52px;
      flex-shrink: 0;
    }

    .bar {
      position: relative;
      z-index: 1;
      flex-shrink: 0;
    }

    .body {
      position: relative;
      z-index: 1;
      display: flex;
      min-width: 0;
      min-height: 0;
      flex: 1;
      flex-direction: column;
    }

    .content {
      display: flex;
      min-width: 0;
      min-height: 0;
      flex: 1;
      flex-direction: column;
    }

    .overlay {
      position: absolute;
      inset: 0;
      z-index: 5;
      pointer-events: none;
    }

    .overlay ::slotted(*) {
      pointer-events: auto;
    }

    @media (max-width: 768px) {
      .window {
        border-radius: 0;
      }
    }
  `;

  setLayout(layout: WindowLayout): void {
    this.style.left = `${layout.x}px`;
    this.style.top = `${layout.y}px`;
    this.style.width = `${layout.w}px`;
    this.style.height = `${layout.h}px`;
  }

  getLayout(): WindowLayout {
    const rect = this.getBoundingClientRect();
    return {
      x: rect.left,
      y: rect.top,
      w: rect.width,
      h: rect.height,
    };
  }

  resetLayout(): void {
    this.style.removeProperty('left');
    this.style.removeProperty('top');
    this.style.removeProperty('width');
    this.style.removeProperty('height');
  }

  bringToFront(): void {
    SzWindow.zCounter += 1;
    this.style.zIndex = String(SzWindow.zCounter);
  }

  render() {
    return html`
      <section class="window" role="application" aria-label=${this.title || 'Window'}>
        <div class="frame">
          ${this.renderTitlebar()}
          <div class="bar">
            <slot name="bar"></slot>
          </div>
          <div class="body">
            <div class="content">
              <slot></slot>
            </div>
            <div class="overlay">
              <slot name="overlay"></slot>
            </div>
          </div>
        </div>
      </section>
    `;
  }

  private renderTitlebar() {
    if (this.titlebar === 'hidden') return null;

    return html`
      <header class="titlebar" data-mode=${this.titlebar}>
        <div class="controls" role="group" aria-label="Window controls">
          ${this.renderControl('close', WINDOW_ACTION.CLOSE_REQUEST, 'Close')}
          ${this.renderControl('minimize', WINDOW_ACTION.MINIMIZE_REQUEST, 'Minimize')}
          ${this.renderControl('maximize', WINDOW_ACTION.MAXIMIZE_REQUEST, 'Maximize')}
        </div>
        <div class="title">${this.title}</div>
        <div class="title-spacer" aria-hidden="true"></div>
      </header>
    `;
  }

  private renderControl(button: WindowButton, type: string, label: string) {
    if (!this.buttons.includes(button)) return null;

    return html`
      <button
        class="traffic"
        data-kind=${button}
        type="button"
        aria-label=${label}
        title=${label}
        @click=${(event: MouseEvent) => this.handleControlClick(type, event)}
      ></button>
    `;
  }

  private handleControlClick(type: string, event: MouseEvent): void {
    event.stopPropagation();
    actions.dispatch(type, { windowId: this.id });
  }
}
