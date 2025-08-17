import { LitElement, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { actions } from '../../core/actions.js';
import { mobileQuery } from '../../core/styles.js';
import { WM_ACTION } from './actions.js';
import { FocusTrap } from './focus-trap.js';
import type { WindowLayout } from '../../core/types.js';
import type { WindowApi } from '../window/sz-window.js';

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

@customElement('sz-window-manager')
export class SzWindowManager extends LitElement {
  @state() private tiled = false;

  private windows = new Map<HTMLElement, ManagedWindow>();
  private drag: DragState | null = null;
  private resize: ResizeState | null = null;
  private observer: MutationObserver | null = null;
  private actionUnsubs: (() => void)[] = [];
  private isMobile = mobileQuery.matches;

  connectedCallback() {
    super.connectedCallback();

    this.observer = new MutationObserver((mutations) => this.handleMutations(mutations));
    this.observer.observe(this, { childList: true });

    this.scanChildren();

    document.addEventListener('mousemove', this.handleMouseMove);
    document.addEventListener('mouseup', this.handleMouseUp);
    this.addEventListener('mousedown', this.handleMouseDown);
    this.addEventListener('mousedown', this.handleWindowFocus, true);
    this.addEventListener('focusin', this.handleWindowFocus, true);
    this.addEventListener('window-resize-start', this.handleResizeStart as EventListener);
    mobileQuery.addEventListener('change', this.handleMobileChange);

    this.actionUnsubs.push(
      actions.on(WM_ACTION.SHOW, (a) => this.handleShow(a.payload as { windowId: string })),
      actions.on(WM_ACTION.HIDE, (a) => this.handleHide(a.payload as { windowId: string })),
      actions.on(WM_ACTION.MAXIMIZE, (a) => this.handleMaximize(a.payload as { windowId: string })),
      actions.on(WM_ACTION.FULLSCREEN, (a) => this.handleFullscreen(a.payload as { windowId: string })),
      actions.on(WM_ACTION.TOGGLE_MODE, (a) => this.handleToggleMode(a.payload as { windowId: string })),
      actions.on(WM_ACTION.TILE_RETILE, () => this.toggleTiling()),
    );

    if (this.isMobile) {
      this.forceFullPage();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();

    // Clear active interaction state first
    if (this.drag) {
      this.w(this.drag.win).setDragging(false);
      this.drag = null;
    }
    if (this.resize) {
      this.w(this.resize.win).setDragging(false);
      this.resize = null;
    }

    this.observer?.disconnect();
    document.removeEventListener('mousemove', this.handleMouseMove);
    document.removeEventListener('mouseup', this.handleMouseUp);
    this.removeEventListener('mousedown', this.handleMouseDown);
    this.removeEventListener('mousedown', this.handleWindowFocus, true);
    this.removeEventListener('focusin', this.handleWindowFocus, true);
    this.removeEventListener('window-resize-start', this.handleResizeStart as EventListener);
    mobileQuery.removeEventListener('change', this.handleMobileChange);
    this.actionUnsubs.forEach((fn) => fn());

    for (const [, managed] of this.windows) {
      managed.focusTrap.destroy();
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
      this.applyTileLayout(this.getVisibleWindows());
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
    this.w(el).bringToFront();
  }

  private unregisterWindow(el: HTMLElement) {
    const managed = this.windows.get(el);
    if (managed) {
      managed.focusTrap.destroy();
      this.windows.delete(el);
    }
  }

  // --- Drag ---

  private handleMouseDown = (e: MouseEvent) => {
    if (this.isMobile) return;

    const path = e.composedPath();
    let titlebarEl: Element | null = null;

    for (const node of path) {
      if (node instanceof Element) {
        if (node.classList.contains('titlebar')) {
          titlebarEl = node;
        }
        if (node.tagName === 'BUTTON') return;
      }
    }

    if (!titlebarEl) return;

    let windowEl: HTMLElement | null = null;
    for (const node of path) {
      if (node instanceof HTMLElement && node.tagName === 'SZ-WINDOW' && this.windows.has(node)) {
        windowEl = node;
        break;
      }
    }

    if (!windowEl) return;

    const managed = this.windows.get(windowEl)!;
    if (managed.maximized || this.tiled) return;

    const layout = this.w(windowEl).getLayout();
    this.drag = {
      win: windowEl,
      offsetX: e.clientX - layout.x,
      offsetY: e.clientY - layout.y,
    };

    this.w(windowEl).setDragging(true);
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

    const layout = this.w(win).getLayout();
    this.w(win).setLayout({ x, y, w: layout.w, h: layout.h });
  };

  private handleMouseUp = () => {
    if (this.drag) {
      this.w(this.drag.win).setDragging(false);
      this.drag = null;
    }
    if (this.resize) {
      this.w(this.resize.win).setDragging(false);
      this.resize = null;
    }
  };

  // --- Resize ---

  private handleResizeStart = (e: CustomEvent) => {
    if (this.isMobile) return;

    const { dir, clientX, clientY } = e.detail;

    const path = e.composedPath();
    let windowEl: HTMLElement | null = null;
    for (const node of path) {
      if (node instanceof HTMLElement && node.tagName === 'SZ-WINDOW' && this.windows.has(node)) {
        windowEl = node;
        break;
      }
    }
    if (!windowEl) return;

    const managed = this.windows.get(windowEl);
    if (!managed || managed.maximized || this.tiled) return;

    const layout = this.w(windowEl).getLayout();
    this.resize = {
      win: windowEl,
      dir,
      startX: clientX,
      startY: clientY,
      startLayout: { ...layout },
    };

    this.w(windowEl).setDragging(true);
    this.w(windowEl).bringToFront();
  };

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

    this.w(win).setLayout({ x, y, w, h });
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
    for (const managed of this.windows.values()) {
      if (managed.el !== el) {
        managed.focusTrap.deactivate();
      }
    }
    this.w(el).bringToFront();
    const managed = this.windows.get(el);
    managed?.focusTrap.activate();
  }

  // --- Tiling ---

  private getVisibleWindows(): HTMLElement[] {
    const visible: HTMLElement[] = [];
    for (const [el] of this.windows) {
      if (!this.w(el).windowHidden) visible.push(el);
    }
    return visible;
  }

  private toggleTiling() {
    if (this.tiled) {
      this.untileWindows();
    } else {
      this.tileWindows();
    }
    actions.dispatch(WM_ACTION.TILE_CHANGED, { tiled: this.tiled });
  }

  private tileWindows() {
    const visible = this.getVisibleWindows();
    if (visible.length === 0) return;

    this.tiled = true;
    for (const el of visible) {
      const managed = this.windows.get(el)!;
      managed.preTileLayout = this.w(el).getLayout();
      this.w(el).setTiled(true);
    }
    this.applyTileLayout(visible);
  }

  private untileWindows() {
    if (!this.tiled) return;
    this.tiled = false;

    for (const [el, managed] of this.windows) {
      this.w(el).setTiled(false);
      if (managed.preTileLayout) {
        this.w(el).setLayout(managed.preTileLayout);
        managed.preTileLayout = null;
      } else {
        this.w(el).resetLayout();
      }
      this.w(el).setResizeHandlesVisible(true);
    }
  }

  private applyTileLayout(windows: HTMLElement[]) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const count = windows.length;
    const gap = 2;

    if (count === 0) return;

    if (count === 1) {
      this.w(windows[0]).setLayout({ x: 0, y: 0, w: vw, h: vh });
    } else if (count === 2) {
      const halfW = Math.floor((vw - gap) / 2);
      this.w(windows[0]).setLayout({ x: 0, y: 0, w: halfW, h: vh });
      this.w(windows[1]).setLayout({ x: halfW + gap, y: 0, w: vw - halfW - gap, h: vh });
    } else {
      const masterW = Math.floor((vw - gap) / 2);
      const stackW = vw - masterW - gap;
      const stackCount = count - 1;
      const cellH = Math.floor((vh - gap * (stackCount - 1)) / stackCount);

      this.w(windows[0]).setLayout({ x: 0, y: 0, w: masterW, h: vh });
      for (let i = 1; i < count; i++) {
        const row = i - 1;
        const y = row * (cellH + gap);
        const h = row === stackCount - 1 ? vh - y : cellH;
        this.w(windows[i]).setLayout({ x: masterW + gap, y, w: stackW, h });
      }
    }

    for (const win of windows) {
      this.w(win).setResizeHandlesVisible(false);
    }
  }

  // --- Show / Hide ---

  private handleShow(payload: { windowId: string }) {
    const win = this.findWindowById(payload?.windowId);
    if (!win) return;
    this.w(win).showWindow();
    this.focusWindow(win);
    if (this.tiled) this.applyTileLayout(this.getVisibleWindows());
  }

  private handleHide(payload: { windowId: string }) {
    const win = this.findWindowById(payload?.windowId);
    if (!win) return;
    this.w(win).hideWindow();
    const managed = this.windows.get(win);
    managed?.focusTrap.deactivate();
    if (this.tiled) this.applyTileLayout(this.getVisibleWindows());
  }

  // --- Maximize ---

  private handleMaximize(payload: { windowId: string }) {
    const win = this.findWindowById(payload?.windowId);
    if (!win) return;

    const managed = this.windows.get(win);
    if (!managed) return;

    if (managed.maximized) {
      managed.maximized = false;
      if (managed.preMaxLayout) {
        this.w(win).setLayout(managed.preMaxLayout);
        managed.preMaxLayout = null;
      } else {
        this.w(win).resetLayout();
      }
      if (!this.isMobile) {
        this.w(win).setResizeHandlesVisible(true);
      }
    } else {
      managed.preMaxLayout = this.w(win).getLayout();
      managed.maximized = true;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      this.w(win).setLayout({ x: 0, y: 0, w: vw, h: vh });
      this.w(win).setResizeHandlesVisible(false);
    }
  }

  // --- Fullscreen ---

  private async handleFullscreen(payload: { windowId: string }) {
    const win = this.findWindowById(payload?.windowId);
    if (!win) return;

    const szWin = this.w(win);
    if (szWin.isFullscreen) {
      await szWin.exitFullscreen();
    } else {
      const ok = await szWin.enterFullscreen();
      if (!ok) {
        this.handleMaximize(payload);
      }
    }
  }

  // --- Toggle Mode (windowed <-> maximized) ---

  private handleToggleMode(payload: { windowId: string }) {
    this.handleMaximize(payload);
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
      this.w(el).setResizeHandlesVisible(false);
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      this.w(el).setLayout({ x: 0, y: 0, w: vw, h: vh });
    }
  }

  private restoreFromFullPage() {
    for (const [el] of this.windows) {
      this.w(el).resetLayout();
      this.w(el).setResizeHandlesVisible(true);
    }
  }

  // --- DOM API bridge ---

  private w(el: HTMLElement): WindowApi {
    return el as unknown as WindowApi;
  }

  private findWindowById(id: string | undefined): HTMLElement | null {
    if (!id) return null;
    for (const el of this.windows.keys()) {
      if (el.id === id) return el;
    }
    return null;
  }

  render() {
    return html`<slot></slot>`;
  }
}
