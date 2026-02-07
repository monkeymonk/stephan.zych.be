import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';

// sz-diagram wraps a ```mermaid block (emitted as <sz-diagram><pre class="mermaid">…).
// Once mermaid has rendered the inline <svg>, it reveals an "enlarge" button that
// opens the diagram in a zoom/pan overlay so dense diagrams stay legible.
@customElement('sz-diagram')
export class SzDiagram extends LitElement {
  @state() private ready = false;
  @state() private open = false;
  @state() private scale = 1;
  @state() private tx = 0;
  @state() private ty = 0;

  private observer?: MutationObserver;
  private dragging = false;
  private startX = 0;
  private startY = 0;

  static styles = css`
    :host { position: relative; display: block; }

    .enlarge {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 1;
      width: 28px;
      height: 28px;
      display: grid;
      place-items: center;
      border: 1px solid var(--sz-surface1, #45475a);
      border-radius: 6px;
      background: color-mix(in srgb, var(--sz-base, #1e1e2e) 80%, transparent);
      color: var(--sz-subtext, #a6adc8);
      cursor: pointer;
      opacity: 0.5;
      transition: opacity 0.15s ease, color 0.15s ease, border-color 0.15s ease;
      font-size: 15px;
      line-height: 1;
    }
    :host(:hover) .enlarge,
    .enlarge:focus-visible {
      opacity: 1;
    }
    .enlarge:hover {
      color: var(--sz-accent, #89b4fa);
      border-color: var(--sz-accent, #89b4fa);
    }

    .modal {
      position: fixed;
      inset: 0;
      z-index: 9999;
      background: color-mix(in srgb, var(--sz-crust, #11111b) 90%, transparent);
    }
    .stage {
      position: absolute;
      inset: 0;
      overflow: hidden;
      display: flex;
      align-items: center;
      justify-content: center;
      cursor: grab;
      touch-action: none;
    }
    .stage:active { cursor: grabbing; }
    .zoomable {
      transform-origin: center center;
      will-change: transform;
    }
    .zoomable svg {
      display: block;
      width: auto;
      height: auto;
      max-width: 90vw;
      max-height: 82vh;
      background: var(--sz-base, #1e1e2e);
      border-radius: 8px;
      padding: 12px;
    }

    .toolbar {
      position: absolute;
      top: 16px;
      right: 16px;
      z-index: 1;
      display: flex;
      gap: 6px;
    }
    .toolbar button {
      width: 32px;
      height: 32px;
      display: grid;
      place-items: center;
      border: 1px solid var(--sz-surface1, #45475a);
      border-radius: 6px;
      background: var(--sz-surface0, #313244);
      color: var(--sz-text, #cdd6f4);
      cursor: pointer;
      font-size: 15px;
      line-height: 1;
      transition: color 0.15s ease, border-color 0.15s ease;
    }
    .toolbar button:hover {
      color: var(--sz-accent, #89b4fa);
      border-color: var(--sz-accent, #89b4fa);
    }
    .hint {
      position: absolute;
      bottom: 16px;
      left: 50%;
      transform: translateX(-50%);
      color: var(--sz-overlay1, #7f849c);
      font-size: calc(var(--sz-font-size, 13px) * 0.85);
      pointer-events: none;
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    if (this.querySelector('svg')) {
      this.ready = true;
    } else {
      // Reveal the button once mermaid swaps its source for an <svg>.
      this.observer = new MutationObserver(() => {
        if (this.querySelector('svg')) {
          this.ready = true;
          this.observer?.disconnect();
        }
      });
      this.observer.observe(this, { childList: true, subtree: true });
    }
    document.addEventListener('keydown', this.onKey);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.observer?.disconnect();
    document.removeEventListener('keydown', this.onKey);
  }

  private onKey = (e: KeyboardEvent) => {
    if (!this.open) return;
    switch (e.key) {
      case 'Escape': e.preventDefault(); this.close(); break;
      case '+': case '=': e.preventDefault(); this.zoom(1.25); break;
      case '-': e.preventDefault(); this.zoom(1 / 1.25); break;
      case '0': e.preventDefault(); this.reset(); break;
    }
  };

  private enlarge() {
    if (!this.querySelector('svg')) return;
    this.reset();
    this.open = true;
  }

  private close() { this.open = false; }
  private reset() { this.scale = 1; this.tx = 0; this.ty = 0; }
  private zoom(factor: number) {
    this.scale = Math.min(8, Math.max(0.4, this.scale * factor));
  }

  private onWheel = (e: WheelEvent) => {
    e.preventDefault();
    this.zoom(e.deltaY < 0 ? 1.1 : 1 / 1.1);
  };
  private onPointerDown = (e: PointerEvent) => {
    this.dragging = true;
    this.startX = e.clientX - this.tx;
    this.startY = e.clientY - this.ty;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  private onPointerMove = (e: PointerEvent) => {
    if (!this.dragging) return;
    this.tx = e.clientX - this.startX;
    this.ty = e.clientY - this.startY;
  };
  private onPointerUp = () => { this.dragging = false; };

  // Mount a real clone of the rendered SVG into the stage when the modal opens.
  // (Cloning the node — rather than re-parsing its HTML — keeps the SVG intact;
  // we give it a definite, viewport-fitted size so it can't collapse to zero.)
  protected updated(changed: Map<string, unknown>) {
    if (changed.has('open') && this.open) {
      const stage = this.renderRoot.querySelector('.zoomable') as HTMLElement | null;
      const svg = this.querySelector('svg') as SVGSVGElement | null;
      if (!stage || !svg) return;
      const clone = svg.cloneNode(true) as SVGElement;
      this.fitToViewport(clone, svg);
      stage.replaceChildren(clone);
    }
  }

  private fitToViewport(clone: SVGElement, src: SVGSVGElement) {
    let w = src.viewBox?.baseVal?.width || 0;
    let h = src.viewBox?.baseVal?.height || 0;
    if (!w || !h) {
      const r = src.getBoundingClientRect();
      w = r.width; h = r.height;
    }
    if (!w || !h) return;
    const k = Math.min((window.innerWidth * 0.9) / w, (window.innerHeight * 0.82) / h);
    clone.style.maxWidth = 'none';
    clone.style.width = `${Math.round(w * k)}px`;
    clone.style.height = `${Math.round(h * k)}px`;
  }

  render() {
    return html`
      <slot></slot>
      ${this.ready
        ? html`<button class="enlarge" @click=${this.enlarge} title="Enlarge diagram" aria-label="Enlarge diagram">⤢</button>`
        : nothing}
      ${this.open
        ? html`
            <div class="modal" @click=${(e: MouseEvent) => { if (e.target === e.currentTarget) this.close(); }}>
              <div class="toolbar">
                <button @click=${() => this.zoom(1.25)} title="Zoom in" aria-label="Zoom in">+</button>
                <button @click=${() => this.zoom(1 / 1.25)} title="Zoom out" aria-label="Zoom out">−</button>
                <button @click=${this.reset} title="Reset" aria-label="Reset zoom">⟳</button>
                <button @click=${this.close} title="Close (Esc)" aria-label="Close">✕</button>
              </div>
              <div
                class="stage"
                @wheel=${this.onWheel}
                @pointerdown=${this.onPointerDown}
                @pointermove=${this.onPointerMove}
                @pointerup=${this.onPointerUp}
                @pointercancel=${this.onPointerUp}
              >
                <div class="zoomable" style=${`transform: translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`}></div>
              </div>
              <div class="hint">scroll to zoom · drag to pan · esc to close</div>
            </div>
          `
        : nothing}
    `;
  }
}
