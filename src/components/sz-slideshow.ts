import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { registry } from '../core/registry.js';
import { reducedMotion } from '../core/styles.js';

@customElement('sz-slideshow')
export class SzSlideshow extends LitElement {
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
  `;

  connectedCallback() {
    super.connectedCallback();
    if (this.images.length === 0) {
      this.setImages([...registry.wallpapers]);
    } else {
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
    `;
  }
}
