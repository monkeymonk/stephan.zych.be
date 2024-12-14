import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { actions } from '../../core/actions.js';
import { mobileQuery } from '../../core/styles.js';
import { WM_ACTION } from './actions.js';
import { FocusTrap } from './focus-trap.js';

/**
 * Window layout stored per managed window.
 * Mirrors the shape returned by sz-window.getLayout().
 */
interface WindowLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface DragState {
  win: HTMLElement;
  offsetX: number;
  offsetY: number;
}

interface ResizeState {
  win: HTMLElement;
  dir: string;
  startX: number;
  startY: number;
  startLayout: WindowLayout;
}

interface ManagedWindow {
  el: HTMLElement;
  focusTrap: FocusTrap;
  preTileLayout: WindowLayout | null;
  maximized: boolean;
  preMaxLayout: WindowLayout | null;
}

const MIN_W = 300;
const MIN_H = 200;
const RESIZE_HANDLE_SIZE = 6;
const RESIZE_CORNER_SIZE = 12;

@customElement('sz-window-manager')
export class SzWindowManager extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }

    .wm-resize-handle {
      position: absolute;
      z-index: 10000;
      pointer-events: auto;
    }

    .wm-resize-n { top: -3px; left: 8px; right: 8px; height: ${RESIZE_HANDLE_SIZE}px; cursor: n-resize; }
    .wm-resize-s { bottom: -3px; left: 8px; right: 8px; height: ${RESIZE_HANDLE_SIZE}px; cursor: s-resize; }
    .wm-resize-w { left: -3px; top: 8px; bottom: 8px; width: ${RESIZE_HANDLE_SIZE}px; cursor: w-resize; }
    .wm-resize-e { right: -3px; top: 8px; bottom: 8px; width: ${RESIZE_HANDLE_SIZE}px; cursor: e-resize; }
    .wm-resize-nw { top: -3px; left: -3px; width: ${RESIZE_CORNER_SIZE}px; height: ${RESIZE_CORNER_SIZE}px; cursor: nw-resize; }
    .wm-resize-ne { top: -3px; right: -3px; width: ${RESIZE_CORNER_SIZE}px; height: ${RESIZE_CORNER_SIZE}px; cursor: ne-resize; }
    .wm-resize-sw { bottom: -3px; left: -3px; width: ${RESIZE_CORNER_SIZE}px; height: ${RESIZE_CORNER_SIZE}px; cursor: sw-resize; }
    .wm-resize-se { bottom: -3px; right: -3px; width: ${RESIZE_CORNER_SIZE}px; height: ${RESIZE_CORNER_SIZE}px; cursor: se-resize; }
  `;

  @state() private tiled = false;

  private windows = new Map<HTMLElement, ManagedWindow>();
  private drag: DragState | null = null;
  private resize: ResizeState | null = null;
  private observer: MutationObserver | null = null;
  private actionUnsubs: (() => void)[] = [];
  private isMobile = mobileQuery.matches;
  private resizeHandleEls = new Map<HTMLElement, HTMLElement[]>();

  // --- Lifecycle ---

  connectedCallback() {
    super.connectedCallback();

    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
    this.observer.observe(this, { childList: true });

    // Register existing children
    this.scanChildren();

    // Global mouse handlers for drag/resize
    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);

    // Titlebar drag detection via composed event path
    this.addEventListener('mousedown', this.handleMouseDown);

    // Z-stack: click on any window brings to front
    this.addEventListener('mousedown', this.handleWindowFocus, true);

    // Mobile query
    mobileQuery.addEventListener('change', this.handleMobileChange);

    // Action bus subscriptions
    this.actionUnsubs.push(
      actions.on(WM_ACTION.SHOW, (a) => this.handleShow(a.payload as { windowId: string })),
      actions.on(WM_ACTION.HIDE, (a) => this.handleHide(a.payload as { windowId: string })),
      actions.on(WM_ACTION.MAXIMIZE, (a) => this.handleMaximize(a.payload as { windowId: string })),
      actions.on(WM_ACTION.FULLSCREEN, (a) => this.handleFullscreen(a.payload as { windowId: string })),
      actions.on(WM_ACTION.TOGGLE_MODE, (a) => this.handleToggleMode(a.payload as { windowId: string })),
      actions.on(WM_ACTION.TILE_RETILE, () => this.retileWindows()),
    );

    // Force full-page on mobile
    if (this.isMobile) {
      this.forceFullPage();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.observer?.disconnect();
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    this.removeEventListener('mousedown', this.handleMouseDown);
    this.removeEventListener('mousedown', this.handleWindowFocus, true);
    mobileQuery.removeEventListener('change', this.handleMobileChange);
    this.actionUnsubs.forEach((fn) => fn());

    // Cleanup resize handles and focus traps
    for (const [el, managed] of this.windows) {
      managed.focusTrap.destroy();
      this.removeResizeHandles(el);
    }
    this.windows.clear();
  }

  // --- Child scanning ---

  private scanChildren() {
    const current = new Set<HTMLElement>();
    for (const child of Array.from(this.children)) {
      if (child.tagName === 'SZ-WINDOW') {
        const el = child as HTMLElement;
        current.add(el);
        if (!this.windows.has(el)) {
          this.registerWindow(el);
        }
      }
    }
    // Remove windows no longer in DOM
    for (const el of this.windows.keys()) {
      if (!current.has(el)) {
        this.unregisterWindow(el);
      }
    }
  }

  private handleMutations(mutations: MutationRecord[]) {
    let changed = false;
    for (const m of mutations) {
      for (const node of Array.from(m.addedNodes)) {
        if (node instanceof HTMLElement && node.tagName === 'SZ-WINDOW') {
          if (!this.windows.has(node)) {
            this.registerWindow(node);
            changed = true;
          }
        }
      }
      for (const node of Array.from(m.removedNodes)) {
        if (node instanceof HTMLElement && this.windows.has(node)) {
          this.unregisterWindow(node);
          changed = true;
        }
      }
    }
    if (changed && this.tiled) {
      this.retileWindows();
    }
  }

  private registerWindow(el: HTMLElement) {
    const focusTrap = new FocusTrap(el);
    const managed: ManagedWindow = {
      el,
      focusTrap,
      preTileLayout: null,
      maximized: false,
      preMaxLayout: null,
    };
    this.windows.set(el, managed);

    // Position absolutely within viewport
    el.style.position = 'fixed';

    if (!this.isMobile && !this.tiled) {
      this.injectResizeHandles(el);
    }

    // Bring to front on register
    this.callDOM(el, 'bringToFront');
  }

  private unregisterWindow(el: HTMLElement) {
    const managed = this.windows.get(el);
    if (managed) {
      managed.focusTrap.destroy();
      this.removeResizeHandles(el);
      this.windows.delete(el);
    }
  }

  // --- Resize handles (injected as overlay divs) ---

  private injectResizeHandles(el: HTMLElement) {
    if (this.resizeHandleEls.has(el)) return;

    const directions = ['n', 's', 'w', 'e', 'nw', 'ne', 'sw', 'se'];
    const handles: HTMLElement[] = [];

    for (const dir of directions) {
      const handle = document.createElement('div');
      handle.className = `wm-resize-handle wm-resize-${dir}`;
      handle.dataset.resizeDir = dir;
      handle.addEventListener('mousedown', (e) => {
        e.preventDefault();
        e.stopPropagation();
        this.startResize(el, dir, e);
      });
      el.appendChild(handle);
      handles.push(handle);
    }

    this.resizeHandleEls.set(el, handles);
  }

  private removeResizeHandles(el: HTMLElement) {
    const handles = this.resizeHandleEls.get(el);
    if (handles) {
      for (const h of handles) {
        h.remove();
      }
      this.resizeHandleEls.delete(el);
    }
  }

  private setResizeHandlesVisible(el: HTMLElement, visible: boolean) {
    const handles = this.resizeHandleEls.get(el);
    if (handles) {
      for (const h of handles) {
        h.style.display = visible ? '' : 'none';
      }
    }
  }

  // --- Drag ---

  private handleMouseDown = (e: MouseEvent) => {
    if (this.isMobile) return;

    // Walk composedPath to find a titlebar element
    const path = e.composedPath();
    let titlebarEl: Element | null = null;
    let windowEl: HTMLElement | null = null;

    for (const node of path) {
      if (node instanceof Element) {
        if (node.classList.contains('titlebar')) {
          titlebarEl = node;
        }
        // Don't start drag if clicking a button inside the titlebar
        if (node.tagName === 'BUTTON') return;
      }
    }

    if (!titlebarEl) return;

    // Find the sz-window ancestor
    for (const node of path) {
      if (node instanceof HTMLElement && node.tagName === 'SZ-WINDOW' && this.windows.has(node)) {
        windowEl = node;
        break;
      }
    }

    if (!windowEl) return;

    const managed = this.windows.get(windowEl)!;
    if (managed.maximized || this.tiled) return;

    const rect = windowEl.getBoundingClientRect();
    this.drag = {
      win: windowEl,
      offsetX: e.clientX - rect.left,
      offsetY: e.clientY - rect.top,
    };
  };

  private handleMouseMove = (e: MouseEvent) => {
    if (this.resize) {
      this.performResize(e);
      return;
    }
    if (!this.drag) return;

    const { win, offsetX, offsetY } = this.drag;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 50;

    let x = e.clientX - offsetX;
    let y = e.clientY - offsetY;
    x = Math.max(-vw + margin, Math.min(vw - margin, x));
    y = Math.max(-vh + margin, Math.min(vh - margin, y));

    this.callDOM(win, 'setLayout', {
      x,
      y,
      w: win.getBoundingClientRect().width,
      h: win.getBoundingClientRect().height,
    });
  };

  private handleMouseUp = () => {
    this.drag = null;
    this.resize = null;
  };

  // --- Resize ---

  private startResize(win: HTMLElement, dir: string, e: MouseEvent) {
    if (this.isMobile) return;

    const managed = this.windows.get(win);
    if (!managed || managed.maximized || this.tiled) return;

    const layout = this.callDOM(win, 'getLayout') as WindowLayout;
    this.resize = {
      win,
      dir,
      startX: e.clientX,
      startY: e.clientY,
      startLayout: { ...layout },
    };

    this.callDOM(win, 'bringToFront');
  }

  private performResize(e: MouseEvent) {
    if (!this.resize) return;

    const { win, dir, startX, startY, startLayout } = this.resize;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    let { x, y, w, h } = startLayout;

    if (dir.includes('e')) w = Math.max(MIN_W, startLayout.w + dx);
    if (dir.includes('s')) h = Math.max(MIN_H, startLayout.h + dy);
    if (dir.includes('w')) {
      const newW = Math.max(MIN_W, startLayout.w - dx);
      if (newW > MIN_W) x = startLayout.x + dx;
      w = newW;
    }
    if (dir.includes('n')) {
      const newH = Math.max(MIN_H, startLayout.h - dy);
      if (newH > MIN_H) y = startLayout.y + dy;
      h = newH;
    }

    this.callDOM(win, 'setLayout', { x, y, w, h });
  }

  // --- Z-Stack ---

  private handleWindowFocus = (e: MouseEvent) => {
    const path = e.composedPath();
    for (const node of path) {
      if (node instanceof HTMLElement && node.tagName === 'SZ-WINDOW' && this.windows.has(node)) {
        this.focusWindow(node);
        break;
      }
    }
  };

  private focusWindow(el: HTMLElement) {
    // Deactivate all focus traps, then activate the focused one
    for (const managed of this.windows.values()) {
      if (managed.el !== el) {
        managed.focusTrap.deactivate();
      }
    }
    this.callDOM(el, 'bringToFront');
    const managed = this.windows.get(el);
    managed?.focusTrap.activate();
  }

  // --- Tiling: master-stack layout ---

  private getVisibleWindows(): HTMLElement[] {
    const visible: HTMLElement[] = [];
    for (const [el] of this.windows) {
      if (!el.hidden) {
        visible.push(el);
      }
    }
    return visible;
  }

  private applyTileLayout(windows: HTMLElement[]) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const count = windows.length;

    if (count === 0) return;

    if (count === 1) {
      this.callDOM(windows[0], 'setLayout', { x: 0, y: 0, w: vw, h: vh });
    } else if (count === 2) {
      const halfW = Math.floor(vw / 2);
      this.callDOM(windows[0], 'setLayout', { x: 0, y: 0, w: halfW, h: vh });
      this.callDOM(windows[1], 'setLayout', { x: halfW, y: 0, w: vw - halfW, h: vh });
    } else {
      // Master-stack: first window = left half, rest stacked on right half
      const masterW = Math.floor(vw / 2);
      const stackW = vw - masterW;
      const stackCount = count - 1;
      const cellH = Math.floor(vh / stackCount);

      this.callDOM(windows[0], 'setLayout', { x: 0, y: 0, w: masterW, h: vh });
      for (let i = 1; i < count; i++) {
        const row = i - 1;
        const h = row === stackCount - 1 ? vh - row * cellH : cellH;
        this.callDOM(windows[i], 'setLayout', {
          x: masterW,
          y: row * cellH,
          w: stackW,
          h,
        });
      }
    }

    // Disable drag/resize on tiled windows
    for (const win of windows) {
      this.setResizeHandlesVisible(win, false);
    }
  }

  private retileWindows() {
    const visible = this.getVisibleWindows();
    if (visible.length === 0) return;

    if (!this.tiled) {
      // Save pre-tile layouts, enter tiling
      this.tiled = true;
      for (const el of visible) {
        const managed = this.windows.get(el)!;
        managed.preTileLayout = this.callDOM(el, 'getLayout') as WindowLayout;
      }
    } else {
      // Update saved layouts for new windows
      for (const el of visible) {
        const managed = this.windows.get(el)!;
        if (!managed.preTileLayout) {
          managed.preTileLayout = this.callDOM(el, 'getLayout') as WindowLayout;
        }
      }
      // Clear stale entries
      for (const [el, managed] of this.windows) {
        if (el.hidden && managed.preTileLayout) {
          managed.preTileLayout = null;
        }
      }
    }

    this.applyTileLayout(visible);
  }

  untileWindows() {
    if (!this.tiled) return;
    this.tiled = false;

    for (const [el, managed] of this.windows) {
      if (managed.preTileLayout) {
        this.callDOM(el, 'setLayout', managed.preTileLayout);
        managed.preTileLayout = null;
      } else {
        this.callDOM(el, 'resetLayout');
      }
      this.setResizeHandlesVisible(el, true);
    }
  }

  // --- Show / Hide ---

  private handleShow(payload: { windowId: string }) {
    const win = this.findWindowById(payload?.windowId);
    if (!win) return;
    win.hidden = false;
    this.focusWindow(win);
    if (this.tiled) this.retileWindows();
  }

  private handleHide(payload: { windowId: string }) {
    const win = this.findWindowById(payload?.windowId);
    if (!win) return;
    win.hidden = true;
    const managed = this.windows.get(win);
    managed?.focusTrap.deactivate();
    if (this.tiled) this.retileWindows();
  }

  // --- Maximize ---

  private handleMaximize(payload: { windowId: string }) {
    const win = this.findWindowById(payload?.windowId);
    if (!win) return;

    const managed = this.windows.get(win);
    if (!managed) return;

    if (managed.maximized) {
      // Restore
      managed.maximized = false;
      if (managed.preMaxLayout) {
        this.callDOM(win, 'setLayout', managed.preMaxLayout);
        managed.preMaxLayout = null;
      } else {
        this.callDOM(win, 'resetLayout');
      }
      if (!this.isMobile) {
        this.setResizeHandlesVisible(win, true);
      }
    } else {
      // Maximize to manager bounds
      managed.preMaxLayout = this.callDOM(win, 'getLayout') as WindowLayout;
      managed.maximized = true;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      this.callDOM(win, 'setLayout', { x: 0, y: 0, w: vw, h: vh });
      this.setResizeHandlesVisible(win, false);
    }

    actions.dispatch(WM_ACTION.MODE_CHANGED, {
      windowId: payload.windowId,
      mode: managed.maximized ? 'maximized' : 'windowed',
    });
  }

  // --- Fullscreen ---

  private async handleFullscreen(payload: { windowId: string }) {
    const win = this.findWindowById(payload?.windowId);
    if (!win) return;

    if (document.fullscreenElement === win) {
      await document.exitFullscreen();
      actions.dispatch(WM_ACTION.MODE_CHANGED, {
        windowId: payload.windowId,
        mode: 'windowed',
      });
    } else {
      try {
        await win.requestFullscreen();
        actions.dispatch(WM_ACTION.MODE_CHANGED, {
          windowId: payload.windowId,
          mode: 'fullscreen',
        });
      } catch {
        // Fullscreen not available, fall back to maximize
        this.handleMaximize(payload);
      }
    }
  }

  // --- Toggle Mode ---

  private handleToggleMode(payload: { windowId: string }) {
    const win = this.findWindowById(payload?.windowId);
    if (!win) return;

    const managed = this.windows.get(win);
    if (!managed) return;

    if (managed.maximized) {
      this.handleMaximize(payload); // un-maximize
    } else {
      this.handleMaximize(payload); // maximize
    }
  }

  // --- Transparency ---

  setWindowOpacity(windowId: string, opacity: number) {
    const win = this.findWindowById(windowId);
    if (win) {
      win.style.setProperty('--sz-window-opacity', String(opacity / 100));
    }
  }

  // --- Mobile ---

  private handleMobileChange = (e: MediaQueryListEvent) => {
    this.isMobile = e.matches;
    if (this.isMobile) {
      this.forceFullPage();
    } else {
      this.restoreFromFullPage();
    }
  };

  private forceFullPage() {
    for (const [el] of this.windows) {
      this.setResizeHandlesVisible(el, false);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      this.callDOM(el, 'setLayout', { x: 0, y: 0, w: vw, h: vh });
    }
  }

  private restoreFromFullPage() {
    for (const [el] of this.windows) {
      this.callDOM(el, 'resetLayout');
      this.injectResizeHandles(el);
      this.setResizeHandlesVisible(el, true);
    }
  }

  // --- DOM API bridge (no TS imports from window feature) ---

  private callDOM(el: HTMLElement, method: string, arg?: unknown): unknown {
    const fn = (el as Record<string, unknown>)[method];
    if (typeof fn === 'function') {
      return fn.call(el, arg);
    }
    return undefined;
  }

  private findWindowById(id: string | undefined): HTMLElement | null {
    if (!id) return null;
    for (const el of this.windows.keys()) {
      if (el.id === id) return el;
    }
    return null;
  }

  // --- Render ---

  render() {
    return html`<slot></slot>`;
  }
}
