import { LitElement, css, html, nothing } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { actions } from '../../core/actions.js';
import type { WindowLayout } from '../../core/types.js';
import { WINDOW_ACTION } from './actions.js';
import { focusRing } from '../../core/styles.js';

export type { WindowLayout } from '../../core/types.js';

type TitlebarMode = 'visible' | 'integrated' | 'hidden';

/** Imperative contract the window-manager drives each window through. */
export interface WindowApi {
  getLayout(): WindowLayout;
  setLayout(layout: WindowLayout): void;
  resetLayout(): void;
  bringToFront(): void;
  setResizeHandlesVisible(visible: boolean): void;
  setDragging(dragging: boolean): void;
  setTiled(tiled: boolean): void;
  showWindow(): void;
  hideWindow(): void;
  windowHidden: boolean;
  isFullscreen: boolean;
  enterFullscreen(): Promise<boolean>;
  exitFullscreen(): Promise<void>;
}

let topZIndex = 100;

@customElement('sz-window')
export class SzWindow extends LitElement implements WindowApi {
  @property() titlebar: TitlebarMode = 'visible';
  // Not `title`: that maps to the global HTML title attribute and shows a
  // native tooltip on hover across the whole window. Use a dedicated attribute.
  @property({ attribute: 'window-title' }) windowTitle = '';
  @property({ type: String }) width = '70vw';
  @property({ type: String }) height = '75vh';
  @property({ type: Number }) transparency = 95;
  @property({ type: Boolean, attribute: 'start-hidden' }) startHidden = false;

  @state() private positionSet = false;
  @state() private position = { x: 0, y: 0 };
  @state() private size = { w: 0, h: 0 };
  @state() private zIndex = 100;
  @state() private isHidden = false;
  @state() private isDragging = false;
  @state() private isTiled = false;

  static styles = css`
    ${focusRing}
    :host {
      display: contents;
    }

    .window {
      display: flex;
      flex-direction: column;
      border-radius: 12px;
      overflow: visible;
      pointer-events: auto;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      box-shadow:
        0 4px 16px rgba(0, 0, 0, 0.3),
        0 8px 32px rgba(0, 0, 0, 0.2),
        0 20px 60px rgba(0, 0, 0, 0.15),
        0 0 0 1px rgba(255, 255, 255, 0.05),
        0 0 80px -20px rgba(137, 180, 250, 0.06);
      transition: width 0.4s cubic-bezier(0.16, 1, 0.3, 1),
        height 0.4s cubic-bezier(0.16, 1, 0.3, 1),
        top 0.4s cubic-bezier(0.16, 1, 0.3, 1),
        left 0.4s cubic-bezier(0.16, 1, 0.3, 1),
        transform 0.4s cubic-bezier(0.16, 1, 0.3, 1),
        opacity 0.4s cubic-bezier(0.16, 1, 0.3, 1),
        border-radius 0.4s cubic-bezier(0.16, 1, 0.3, 1),
        box-shadow 0.4s cubic-bezier(0.16, 1, 0.3, 1);
    }

    .window.positioned {
      transform: none;
    }

    .window.dragging {
      transition: none;
      cursor: grabbing;
    }

    @media (prefers-reduced-motion: reduce) {
      .window { transition: none; }
    }

    .window.hidden {
      transform: scale(0.9);
      opacity: 0;
      pointer-events: none;
    }

    .window.positioned.hidden {
      transform: scale(0.9);
    }

    .window.tiled {
      border-radius: 0;
      box-shadow: none;
    }

    .window-bg {
      position: absolute;
      inset: 0;
      background: var(--sz-terminal-bg, #1e1e2e);
      z-index: 0;
      border-radius: inherit;
    }

    .window-content {
      position: relative;
      z-index: 1;
      display: flex;
      flex-direction: column;
      height: 100%;
      overflow: hidden;
      border-radius: inherit;
    }

    /* Titlebar */
    .titlebar {
      display: flex;
      align-items: center;
      justify-content: flex-end;
      height: 32px;
      background: var(--sz-mantle, #181825);
      padding: 0 8px;
      user-select: none;
      cursor: grab;
      flex-shrink: 0;
      border-bottom: 1px solid var(--sz-surface0, #313244);
    }
    .titlebar[data-mode='integrated'] {
      background: transparent;
      border-bottom: none;
    }
    .titlebar:active {
      cursor: grabbing;
    }
    .titlebar-title {
      flex: 1;
      text-align: center;
      font-size: var(--sz-font-size, 13px);
      color: var(--sz-overlay1, #7f849c);
    }

    /* Controls — subtle grey icon buttons with SVG icons */
    .controls {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .ctrl-btn {
      /* 16px dot, but a 24px hit target (transparent border) for WCAG 2.5.8. */
      box-sizing: content-box;
      width: 16px;
      height: 16px;
      border-radius: 50%;
      border: 4px solid transparent;
      background-clip: padding-box;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 0;
      background-color: var(--sz-surface1, #45475a);
      color: var(--sz-subtext, #a6adc8);
      line-height: 1;
      transition: background-color 0.2s, color 0.2s;
    }
    .ctrl-btn:hover, .ctrl-btn:focus-visible {
      background-color: var(--sz-overlay0, #6c7086);
      color: var(--sz-text, #cdd6f4);
      outline: none;
    }
    .ctrl-btn.close:hover {
      background-color: var(--sz-red, #f38ba8);
      color: var(--sz-crust, #11111b);
    }
    .ctrl-btn svg {
      width: 8px;
      height: 8px;
      stroke: currentColor;
      stroke-width: 2;
      fill: none;
    }

    .body {
      flex: 1;
      overflow: hidden;
      display: flex;
      flex-direction: column;
    }

    .bar-area {
      flex-shrink: 0;
    }

    /* Resize handles — rendered inside shadow DOM */
    .resize-handle {
      position: absolute;
      z-index: 10;
    }
    .resize-n { top: -3px; left: 8px; right: 8px; height: 6px; cursor: n-resize; }
    .resize-s { bottom: -3px; left: 8px; right: 8px; height: 6px; cursor: s-resize; }
    .resize-w { left: -3px; top: 8px; bottom: 8px; width: 6px; cursor: w-resize; }
    .resize-e { right: -3px; top: 8px; bottom: 8px; width: 6px; cursor: e-resize; }
    .resize-nw { top: -3px; left: -3px; width: 12px; height: 12px; cursor: nw-resize; }
    .resize-ne { top: -3px; right: -3px; width: 12px; height: 12px; cursor: ne-resize; }
    .resize-sw { bottom: -3px; left: -3px; width: 12px; height: 12px; cursor: sw-resize; }
    .resize-se { bottom: -3px; right: -3px; width: 12px; height: 12px; cursor: se-resize; }

    @media (max-width: 768px) {
      .window {
        box-sizing: border-box;
        width: 100vw !important;
        height: 100dvh !important;
        top: 0;
        left: 0;
        transform: none;
        border-radius: 0;
        /* Fullscreen on phones — the show/resize animation just feels laggy. */
        transition: none;
        /* Clear notches / home indicator on edge-to-edge phones (0 elsewhere). */
        padding: env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);
      }
      .titlebar {
        cursor: default;
        height: 28px;
      }
      .controls { display: none; }
      .resize-handle { display: none; }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    if (this.startHidden) {
      this.isHidden = true;
    }
  }

  // --- Public DOM API (called by window-manager) ---

  setLayout(layout: WindowLayout): void {
    this.position = { x: layout.x, y: layout.y };
    this.size = { w: layout.w, h: layout.h };
    this.positionSet = true;
  }

  getLayout(): WindowLayout {
    const el = this.shadowRoot?.querySelector('.window') as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
    }
    return { x: this.position.x, y: this.position.y, w: this.size.w, h: this.size.h };
  }

  resetLayout(): void {
    this.position = { x: 0, y: 0 };
    this.size = { w: 0, h: 0 };
    this.positionSet = false;
  }

  bringToFront(): void {
    topZIndex++;
    this.zIndex = topZIndex;
  }

  setResizeHandlesVisible(visible: boolean): void {
    const handles = this.shadowRoot?.querySelectorAll<HTMLElement>('.resize-handle');
    handles?.forEach(h => h.style.display = visible ? '' : 'none');
  }

  setDragging(dragging: boolean): void {
    this.isDragging = dragging;
  }

  setTiled(tiled: boolean): void {
    this.isTiled = tiled;
  }

  showWindow(): void {
    this.isHidden = false;
  }

  hideWindow(): void {
    this.isHidden = true;
  }

  get windowHidden(): boolean {
    return this.isHidden;
  }

  async enterFullscreen(): Promise<boolean> {
    const el = this.shadowRoot?.querySelector('.window') as HTMLElement | null;
    if (!el) return false;
    try {
      await el.requestFullscreen();
      return true;
    } catch {
      return false;
    }
  }

  async exitFullscreen(): Promise<void> {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    }
  }

  get isFullscreen(): boolean {
    // .window lives in this element's shadow root, so the Fullscreen API
    // retargets document.fullscreenElement to the shadow host (this element),
    // not the inner .window — compare against the host.
    return document.fullscreenElement === this;
  }

  render() {
    const sizeStyle = this.size.w > 0
      ? `width: ${this.size.w}px; height: ${this.size.h}px;`
      : `width: ${this.width}; height: ${this.height};`;
    const posStyle = this.positionSet
      ? `left: ${this.position.x}px; top: ${this.position.y}px;`
      : '';

    const classes = [
      'window',
      this.positionSet ? 'positioned' : '',
      this.isHidden ? 'hidden' : '',
      this.isDragging ? 'dragging' : '',
      this.isTiled ? 'tiled' : '',
    ].filter(Boolean).join(' ');

    return html`
      <div
        class=${classes}
        style="${posStyle} ${sizeStyle} z-index: ${this.zIndex};"
        role="region"
        aria-label=${this.windowTitle || 'Window'}
      >
        ${this.renderResizeHandles()}
        <div class="window-bg" style="opacity: ${this.transparency / 100}" aria-hidden="true"></div>
        <div class="window-content">
          ${this.renderTitlebar()}
          <div class="body">
            <slot></slot>
          </div>
          <div class="bar-area">
            <slot name="bar"></slot>
          </div>
        </div>
      </div>
    `;
  }

  private renderTitlebar() {
    if (this.titlebar === 'hidden') return nothing;

    return html`
      <header
        class="titlebar"
        data-mode=${this.titlebar}
        @dblclick=${this.handleTitlebarDblClick}
      >
        <span class="titlebar-title">${this.windowTitle}</span>
        <div class="controls" role="group" aria-label="Window controls">
          <button class="ctrl-btn" @click=${(e: MouseEvent) => this.handleControlClick(WINDOW_ACTION.FULLSCREEN_REQUEST, e)} title="Fullscreen (Alt+F)" aria-label="Fullscreen">
            <svg viewBox="0 0 10 10"><polyline points="1,3 1,1 3,1"/><polyline points="7,1 9,1 9,3"/><polyline points="9,7 9,9 7,9"/><polyline points="3,9 1,9 1,7"/></svg>
          </button>
          <button class="ctrl-btn" @click=${(e: MouseEvent) => this.handleControlClick(WINDOW_ACTION.MAXIMIZE_REQUEST, e)} title="Maximize (Alt+F)" aria-label="Maximize">
            <svg viewBox="0 0 10 10"><rect x="2" y="2" width="6" height="6" rx="0.5"/></svg>
          </button>
          <button class="ctrl-btn close" @click=${(e: MouseEvent) => this.handleControlClick(WINDOW_ACTION.CLOSE_REQUEST, e)} title="Close" aria-label="Close">
            <svg viewBox="0 0 10 10"><line x1="2" y1="2" x2="8" y2="8"/><line x1="8" y1="2" x2="2" y2="8"/></svg>
          </button>
        </div>
      </header>
    `;
  }

  private renderResizeHandles() {
    const dirs = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];
    return dirs.map(dir => html`
      <div
        class="resize-handle resize-${dir}"
        @mousedown=${(e: MouseEvent) => {
          e.preventDefault();
          e.stopPropagation();
          this.dispatchEvent(new CustomEvent('window-resize-start', {
            detail: { dir, clientX: e.clientX, clientY: e.clientY },
            bubbles: true, composed: true,
          }));
        }}
      ></div>
    `);
  }

  private handleControlClick(type: string, event: MouseEvent): void {
    event.stopPropagation();
    actions.dispatch(type, { windowId: this.id });
  }

  private handleTitlebarDblClick = () => {
    actions.dispatch(WINDOW_ACTION.MAXIMIZE_REQUEST, { windowId: this.id });
  };
}
