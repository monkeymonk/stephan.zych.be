import { LitElement, css, html, nothing } from "lit";
import { customElement, property, state } from "lit/decorators.js";
import { actions } from "../../core/actions.js";
import type { WindowLayout } from "../../core/types.js";
import { WINDOW_ACTION } from "./actions.js";
import { focusRing, mobileQuery } from "../../core/styles.js";
import { scrollEventTarget, scrollRoot, scrollToTop } from "../../core/scroll.js";

export type { WindowLayout } from "../../core/types.js";

type TitlebarMode = "visible" | "integrated" | "hidden";

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
  setMaximized(maximized: boolean): void;
  windowHidden: boolean;
  isFullscreen: boolean;
  enterFullscreen(): Promise<boolean>;
  exitFullscreen(): Promise<void>;
}

let topZIndex = 100;

// How far down the reader must be before the tap-to-top control appears, in
// viewports. Half a screen is far enough that the way back is worth offering,
// and near enough that it is already there when the reader wants it.
const TO_TOP_AFTER_VIEWPORTS = 0.5;

@customElement("sz-window")
export class SzWindow extends LitElement implements WindowApi {
  @property() titlebar: TitlebarMode = "visible";
  // Not `title`: that maps to the global HTML title attribute and shows a
  // native tooltip on hover across the whole window. Use a dedicated attribute.
  @property({ attribute: "window-title" }) windowTitle = "";
  @property({ type: String }) width = "70vw";
  @property({ type: String }) height = "75vh";
  @property({ type: Number }) transparency = 95;
  @property({ type: Boolean, attribute: "start-hidden" }) startHidden = false;
  // Opt-in modality. Nothing in the site sets it today; when something does,
  // the wrapper becomes a real dialog and sz-window-manager arms the focus
  // trap for it. Focus alone must never do that (WCAG 2.1.2).
  @property({ type: Boolean, reflect: true }) modal = false;

  @state() private positionSet = false;
  @state() private position = { x: 0, y: 0 };
  @state() private size = { w: 0, h: 0 };
  @state() private zIndex = 100;
  @state() private isHidden = false;
  @state() private isDragging = false;
  @state() private isTiled = false;
  @state() private isMaximized = false;
  // Mirrors the Fullscreen API so the control can announce its pressed state;
  // Esc / F11 exit fullscreen without ever routing through our own button.
  @state() private fullscreenActive = false;
  // Whether the reader has moved far enough down to want a way back. At rest
  // the control would be a no-op, and a permanently-parked button in a 28px
  // titlebar is just noise.
  @state() private scrolled = false;

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
      transition:
        width 0.4s cubic-bezier(0.16, 1, 0.3, 1),
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
      .window {
        transition: none;
      }
    }

    /* Visually gone only. Keyboard and screen-reader removal is the [inert]
       attribute render() sets alongside this class: opacity 0 leaves every
       control tabbable and readable behind the start screen. */
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
    .titlebar[data-mode="integrated"] {
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
      /* The window title is the document title, i.e. content — so it takes the
         content token, not decoration. --sz-overlay1 lands at 4.46:1 (gruvbox)
         and 3.85:1 (tokyonight) on --sz-mantle, both under AA. */
      color: var(--sz-muted, #989caf);
    }

    /* Controls — subtle grey icon buttons with SVG icons */
    .controls {
      display: flex;
      align-items: center;
      /* gap 0: each .ctrl-btn carries a 4px transparent border (24px hit target),
         so adjacent 16px dots still sit 8px apart. */
      gap: 0;
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
      transition:
        background-color 0.2s,
        color 0.2s;
    }
    .ctrl-btn:hover,
    .ctrl-btn:focus-visible {
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

    /* Tap-to-top — mobile only, and only once the reader has scrolled. The
       titlebar has no window controls there, and the iOS status-bar gesture is
       not discoverable, so the document scroller gets a visible affordance.
       display:none (not visibility/opacity) is what keeps it out of the tab
       order and the a11y tree while it does not apply. */
    .to-top {
      display: none;
      align-items: center;
      justify-content: center;
      width: 28px;
      padding: 0;
      border: none;
      background: none;
      color: var(--sz-overlay1, #7f849c);
      cursor: pointer;
      flex-shrink: 0;
    }
    .to-top:active {
      color: var(--sz-accent, #89b4fa);
    }
    .to-top svg {
      width: 14px;
      height: 14px;
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
    .resize-n {
      top: -3px;
      left: 8px;
      right: 8px;
      height: 6px;
      cursor: n-resize;
    }
    .resize-s {
      bottom: -3px;
      left: 8px;
      right: 8px;
      height: 6px;
      cursor: s-resize;
    }
    .resize-w {
      left: -3px;
      top: 8px;
      bottom: 8px;
      width: 6px;
      cursor: w-resize;
    }
    .resize-e {
      right: -3px;
      top: 8px;
      bottom: 8px;
      width: 6px;
      cursor: e-resize;
    }
    .resize-nw {
      top: -3px;
      left: -3px;
      width: 12px;
      height: 12px;
      cursor: nw-resize;
    }
    .resize-ne {
      top: -3px;
      right: -3px;
      width: 12px;
      height: 12px;
      cursor: ne-resize;
    }
    .resize-sw {
      bottom: -3px;
      left: -3px;
      width: 12px;
      height: 12px;
      cursor: sw-resize;
    }
    .resize-se {
      bottom: -3px;
      right: -3px;
      width: 12px;
      height: 12px;
      cursor: se-resize;
    }

    @media (max-width: 768px) {
      .window {
        box-sizing: border-box;
        /* Stop being a fixed, viewport-sized box: the document is the scroller
           now, so the window has to flow and grow with its content. Position
           relative rather than static because the inline z-index must keep applying
           (sz-background is a fixed z-index:0 layer that would otherwise paint
           over the content) and .window-bg still resolves against this box.
           The !important beats the inline width/height render() emits. */
        position: relative;
        width: 100% !important;
        height: auto !important;
        min-height: 100dvh;
        /* Inline left/top px can survive a desktop drag, and on a relative box
           they would shift the whole page instead of being ignored. */
        top: 0 !important;
        left: 0 !important;
        transform: none;
        border-radius: 0;
        /* Fullscreen on phones — the show/resize animation just feels laggy. */
        transition: none;
        /* Only the horizontal notch insets belong here: the top/bottom insets
           are carried by the fixed chrome and .window-content's padding. */
        padding: 0 env(safe-area-inset-right) 0 env(safe-area-inset-left);
      }
      .window-content {
        /* No longer a height-constrained flex column — the chrome is fixed
           (out of flow), so plain block flow is all that is left to do. */
        display: block;
        height: auto;
        overflow: visible;
        /* Reserve the space the fixed chrome takes out of flow. */
        padding-top: var(--sz-mobile-chrome-top);
        padding-bottom: var(--sz-mobile-chrome-bottom);
      }
      .body {
        height: auto;
        overflow: visible;
      }
      .titlebar {
        cursor: default;
        /* Pinned: with a document scroller an in-flow titlebar scrolls away. */
        position: fixed;
        top: 0;
        left: 0;
        right: 0;
        z-index: 30;
        box-sizing: border-box;
        height: calc(var(--sz-mobile-titlebar-h) + env(safe-area-inset-top));
        padding: env(safe-area-inset-top) max(8px, env(safe-area-inset-right)) 0
          max(8px, env(safe-area-inset-left));
      }
      /* The "integrated" titlebar is transparent on desktop; fixed chrome has
         to be opaque or the article scrolls visibly through it. */
      .titlebar,
      .titlebar[data-mode="integrated"] {
        background: var(--sz-mantle, #181825);
        border-bottom: 1px solid var(--sz-surface0, #313244);
      }
      .controls {
        display: none;
      }
      /* Absolute, not a flex item: the titlebar carries a horizontal padding
         for the notch, and the control should sit against the screen edge
         rather than be inset by it. Absolute offsets resolve against the
         padding box, so this clears that padding — and taking the button out
         of the flex row also stops it nudging the centred title. Width stays
         the plain 28px square from the base rule; widening it to swallow the
         inset just made the tap area lopsided. The right offset still honours
         the safe-area inset, which is 0 except in landscape on a notched phone. */
      .to-top.is-shown {
        display: flex;
        position: absolute;
        right: env(safe-area-inset-right);
        top: env(safe-area-inset-top);
        bottom: 0;
      }
      .resize-handle {
        display: none;
      }
    }

    /* Print: the window is the whole reason a printed page comes out clipped.
       Placed after the mobile block on purpose — an A4 page box is ~680px
       wide, so (max-width: 768px) matches while printing too and this has to
       be the later of the two. The !important marks beat the inline
       width/height/top/left render() writes onto .window. */
    @media print {
      .window {
        position: static !important;
        width: auto !important;
        height: auto !important;
        min-height: 0 !important;
        top: auto !important;
        left: auto !important;
        transform: none !important;
        transition: none;
        padding: 0;
        box-shadow: none;
        border-radius: 0;
      }
      .window-content {
        display: block;
        height: auto;
        overflow: visible;
        padding: 0;
      }
      .body {
        height: auto;
        overflow: visible;
      }
      /* Terminal furniture: the opaque backdrop, the window titlebar and the
         slot the tmux tab bar sits in. */
      .window-bg,
      .titlebar,
      .bar-area,
      .resize-handle {
        display: none !important;
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    if (this.startHidden) {
      this.isHidden = true;
    }
    document.addEventListener("fullscreenchange", this.syncFullscreen);
    // Which element scrolls flips at the breakpoint, so the listener has to
    // move with it — and the target is not always the element itself, see
    // scrollEventTarget().
    this.bindScrollTarget();
    mobileQuery.addEventListener("change", this.bindScrollTarget);
    window.addEventListener("resize", this.syncScrolled, { passive: true });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener("fullscreenchange", this.syncFullscreen);
    this.scrollTarget?.removeEventListener("scroll", this.syncScrolled);
    this.scrollTarget = undefined;
    mobileQuery.removeEventListener("change", this.bindScrollTarget);
    window.removeEventListener("resize", this.syncScrolled);
  }

  private scrollTarget?: EventTarget;

  private bindScrollTarget = () => {
    this.scrollTarget?.removeEventListener("scroll", this.syncScrolled);
    this.scrollTarget = scrollEventTarget();
    this.scrollTarget.addEventListener("scroll", this.syncScrolled, { passive: true });
    this.syncScrolled();
  };

  // Lit dedupes an unchanged primitive, so this is a no-op re-render while the
  // answer holds — which matters, since scroll fires on every frame of a flick.
  private syncScrolled = () => {
    this.scrolled = scrollRoot().scrollTop > window.innerHeight * TO_TOP_AFTER_VIEWPORTS;
  };

  private syncFullscreen = () => {
    this.fullscreenActive = this.isFullscreen;
  };

  // --- Public DOM API (called by window-manager) ---

  setLayout(layout: WindowLayout): void {
    this.position = { x: layout.x, y: layout.y };
    this.size = { w: layout.w, h: layout.h };
    this.positionSet = true;
  }

  getLayout(): WindowLayout {
    const el = this.shadowRoot?.querySelector(".window") as HTMLElement | null;
    if (el) {
      const rect = el.getBoundingClientRect();
      return { x: rect.left, y: rect.top, w: rect.width, h: rect.height };
    }
    return {
      x: this.position.x,
      y: this.position.y,
      w: this.size.w,
      h: this.size.h,
    };
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
    const handles =
      this.shadowRoot?.querySelectorAll<HTMLElement>(".resize-handle");
    handles?.forEach((h) => (h.style.display = visible ? "" : "none"));
  }

  setDragging(dragging: boolean): void {
    this.isDragging = dragging;
  }

  setTiled(tiled: boolean): void {
    this.isTiled = tiled;
  }

  setMaximized(maximized: boolean): void {
    this.isMaximized = maximized;
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
    const el = this.shadowRoot?.querySelector(".window") as HTMLElement | null;
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
    const sizeStyle =
      this.size.w > 0
        ? `width: ${this.size.w}px; height: ${this.size.h}px;`
        : `width: ${this.width}; height: ${this.height};`;
    const posStyle = this.positionSet
      ? `left: ${this.position.x}px; top: ${this.position.y}px;`
      : "";

    const classes = [
      "window",
      this.positionSet ? "positioned" : "",
      this.isHidden ? "hidden" : "",
      this.isDragging ? "dragging" : "",
      this.isTiled ? "tiled" : "",
    ]
      .filter(Boolean)
      .join(" ");

    return html`
      ${/* No role in the ordinary case: a role="region" wrapping the entire
            page demoted banner / main / navigation to non-top-level landmarks
            and its label only repeated the document title. A window that
            declares itself modal is a different thing — that one is a dialog,
            and the window-manager arms a focus trap for it. */ ""}
      <div
        class=${classes}
        style="${posStyle} ${sizeStyle} z-index: ${this.zIndex};"
        role=${this.modal ? "dialog" : nothing}
        aria-modal=${this.modal ? "true" : nothing}
        aria-label=${this.modal ? this.windowTitle || "Window" : nothing}
        ?inert=${this.isHidden}
      >
        ${this.renderResizeHandles()}
        <div
          class="window-bg"
          style="opacity: ${this.transparency / 100}"
          aria-hidden="true"
        ></div>
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
    if (this.titlebar === "hidden") return nothing;

    return html`
      <header
        class="titlebar"
        data-mode=${this.titlebar}
        @dblclick=${this.handleTitlebarDblClick}
      >
        <span class="titlebar-title">${this.windowTitle}</span>
        <button
          class="to-top ${this.scrolled ? "is-shown" : ""}"
          type="button"
          aria-label="Scroll to top"
          @click=${this.handleScrollTop}
          @dblclick=${(e: Event) => e.stopPropagation()}
        >
          <svg viewBox="0 0 16 16" aria-hidden="true">
            <line x1="3" y1="3" x2="13" y2="3" />
            <polyline points="4,10 8,6 12,10" />
          </svg>
        </button>
        <div class="controls" role="group" aria-label="Window controls">
          <button
            class="ctrl-btn"
            @click=${(e: MouseEvent) =>
              this.handleControlClick(WINDOW_ACTION.FULLSCREEN_REQUEST, e)}
            title="Fullscreen (Alt+F)"
            aria-label="Fullscreen"
            aria-pressed=${this.fullscreenActive}
          >
            <svg viewBox="0 0 10 10">
              <polyline points="1,3 1,1 3,1" />
              <polyline points="7,1 9,1 9,3" />
              <polyline points="9,7 9,9 7,9" />
              <polyline points="3,9 1,9 1,7" />
            </svg>
          </button>
          <button
            class="ctrl-btn"
            @click=${(e: MouseEvent) =>
              this.handleControlClick(WINDOW_ACTION.MAXIMIZE_REQUEST, e)}
            title="Maximize (Alt+F)"
            aria-label="Maximize"
            aria-pressed=${this.isMaximized}
          >
            <svg viewBox="0 0 10 10">
              <rect x="2" y="2" width="6" height="6" rx="0.5" />
            </svg>
          </button>
          <button
            class="ctrl-btn close"
            @click=${(e: MouseEvent) =>
              this.handleControlClick(WINDOW_ACTION.CLOSE_REQUEST, e)}
            title="Close"
            aria-label="Close"
          >
            <svg viewBox="0 0 10 10">
              <line x1="2" y1="2" x2="8" y2="8" />
              <line x1="8" y1="2" x2="2" y2="8" />
            </svg>
          </button>
        </div>
      </header>
    `;
  }

  private renderResizeHandles() {
    const dirs = ["n", "s", "w", "e", "nw", "ne", "sw", "se"];
    return dirs.map(
      (dir) => html`
        <div
          class="resize-handle resize-${dir}"
          @mousedown=${(e: MouseEvent) => {
            e.preventDefault();
            e.stopPropagation();
            this.dispatchEvent(
              new CustomEvent("window-resize-start", {
                detail: { dir, clientX: e.clientX, clientY: e.clientY },
                bubbles: true,
                composed: true,
              }),
            );
          }}
        ></div>
      `,
    );
  }

  private handleControlClick(type: string, event: MouseEvent): void {
    event.stopPropagation();
    actions.dispatch(type, { windowId: this.id });
  }

  private handleTitlebarDblClick = () => {
    actions.dispatch(WINDOW_ACTION.MAXIMIZE_REQUEST, { windowId: this.id });
  };

  // Mobile-only tap-to-top. stopPropagation so the press never reaches the
  // titlebar's drag/maximize handlers.
  private handleScrollTop = (event: MouseEvent) => {
    event.stopPropagation();
    scrollToTop(true);
  };
}
