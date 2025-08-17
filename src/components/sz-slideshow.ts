import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { reducedMotion } from '../core/styles.js';
import { actions } from '../core/actions.js';
import { SLIDESHOW_ACTION } from './slideshow-actions.js';

/** Public contract consumed by the slideshow wiring. */
export interface SlideshowApi {
  setImages(urls: string[]): void;
  next(): void;
  prev(): void;
}

@customElement('sz-slideshow')
export class SzSlideshow extends LitElement implements SlideshowApi {
  @property({ type: Number }) interval = 30000;

  @state() private layerAImage = '';
  @state() private layerBImage = '';
  @state() private activeLayer: 'a' | 'b' = 'a';

  private timer?: number;
  private images: string[] = [];
  private imageIndex = 0;

  static styles = css`
    :host {
      display: block;
      position: absolute;
      inset: 0;
      overflow: hidden;
      pointer-events: none;
    }

    .slideshow {
      position: absolute;
      inset: 0;
    }

    .layer {
      position: absolute;
      inset: -20px;
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
      transition: opacity 2s ease-in-out;
      will-change: opacity, transform;
      animation: ken-burns 30s ease-in-out infinite alternate;
    }

    .layer-a { z-index: 0; }

    .layer-b {
      z-index: 1;
      animation-direction: alternate-reverse;
    }

    .layer.active { opacity: 1; }
    .layer.inactive { opacity: 0; }

    @keyframes ken-burns {
      0% { transform: scale(1) translate(0, 0); }
      100% { transform: scale(1.08) translate(-10px, -5px); }
    }

    @media (prefers-reduced-motion: reduce) {
      .layer {
        inset: 0;
        transition: none;
        animation: none;
      }
    }

    .fab-container {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: auto;
    }
    .fab {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: var(--sz-surface0, #313244);
      color: var(--sz-subtext, #a6adc8);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s, color 0.2s;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
    .fab:hover {
      background: var(--sz-accent, #89b4fa);
      color: var(--sz-crust, #11111b);
    }
    .fab svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
    }
    @media (max-width: 768px) {
      .fab-container { display: none; }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    // Images are set externally via setImages()
    if (this.images.length > 0) {
      this.restartTimer();
    }
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stopTimer();
  }

  next(): void {
    this.step(1);
  }

  prev(): void {
    this.step(-1);
  }

  setImages(urls: string[]): void {
    this.images = urls.filter(Boolean);
    this.stopTimer();

    if (this.images.length === 0) {
      this.imageIndex = 0;
      this.layerAImage = '';
      this.layerBImage = '';
      this.activeLayer = 'a';
      this.requestUpdate();
      return;
    }

    this.imageIndex = 0;
    this.layerAImage = this.images[0];
    this.layerBImage = this.images[0];
    this.activeLayer = 'a';
    this.preloadOffset(1);
    this.restartTimer();
  }

  private restartTimer(): void {
    this.stopTimer();
    if (this.images.length <= 1 || this.interval <= 0) return;
    this.timer = window.setInterval(() => this.next(), this.interval);
  }

  private stopTimer(): void {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  private step(direction: 1 | -1): void {
    if (this.images.length === 0) return;

    this.imageIndex = (this.imageIndex + direction + this.images.length) % this.images.length;
    const nextImage = this.images[this.imageIndex];

    if (this.activeLayer === 'a') {
      this.layerBImage = nextImage;
      this.activeLayer = 'b';
      if (reducedMotion.matches) this.layerAImage = nextImage;
    } else {
      this.layerAImage = nextImage;
      this.activeLayer = 'a';
      if (reducedMotion.matches) this.layerBImage = nextImage;
    }

    this.preloadOffset(direction >= 0 ? 1 : -1);
    this.restartTimer();
  }

  private preloadOffset(offset: number): void {
    if (this.images.length <= 1) return;
    const preloadIndex = (this.imageIndex + offset + this.images.length) % this.images.length;
    this.preloadImage(this.images[preloadIndex]);
  }

  private preloadImage(src: string): void {
    const img = new Image();
    img.src = src;
  }

  render() {
    if (this.images.length === 0) {
      return html``;
    }

    return html`
      <div class="slideshow">
        <div
          class="layer layer-a ${this.activeLayer === 'a' ? 'active' : 'inactive'}"
          style="background-image: url('${this.layerAImage}')"
        ></div>
        <div
          class="layer layer-b ${this.activeLayer === 'b' ? 'active' : 'inactive'}"
          style="background-image: url('${this.layerBImage}')"
        ></div>
      </div>
      <div class="fab-container">
        <button class="fab" @click=${() => actions.dispatch(SLIDESHOW_ACTION.PREV)} title="Previous wallpaper" aria-label="Previous wallpaper">
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <button class="fab" @click=${() => actions.dispatch(SLIDESHOW_ACTION.NEXT)} title="Next wallpaper" aria-label="Next wallpaper">
          <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      </div>
    `;
  }
}
