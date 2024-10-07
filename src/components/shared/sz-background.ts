import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('sz-background')
export class SzBackground extends LitElement {
  @property() mode: 'image' | 'slideshow' | 'video' | 'dynamic' | 'none' = 'none';
  @property() src = '';

  static styles = css`
    :host {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 0;
      overflow: hidden;
    }
    .bg {
      position: absolute;
      inset: 0;
    }
    .bg-image {
      background-size: cover;
      background-position: center;
      background-repeat: no-repeat;
    }
    .bg-video {
      object-fit: cover;
      width: 100%;
      height: 100%;
    }

    /* Default ambient gradient when no explicit background is set */
    .bg-default {
      background:
        radial-gradient(ellipse at 20% 50%, rgba(88, 101, 242, 0.12) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(137, 180, 250, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 80%, rgba(203, 166, 247, 0.06) 0%, transparent 50%),
        linear-gradient(160deg, #0a0a12 0%, #0d0d1a 40%, #0a0a12 100%);
      animation: bg-drift 30s ease-in-out infinite alternate;
    }

    @keyframes bg-drift {
      0% { filter: hue-rotate(0deg); }
      100% { filter: hue-rotate(15deg); }
    }

    /* Subtle noise grain overlay */
    .grain {
      position: absolute;
      inset: 0;
      opacity: 0.03;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      background-repeat: repeat;
      background-size: 256px 256px;
      pointer-events: none;
      z-index: 1;
    }

    /* Grid pattern overlay */
    .grid-pattern {
      position: absolute;
      inset: 0;
      background-image:
        linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
      background-size: 60px 60px;
      pointer-events: none;
      z-index: 1;
    }

    ::slotted(*) {
      position: relative;
      z-index: 2;
    }

    @media (prefers-reduced-motion: reduce) {
      .bg-default { animation: none; }
    }
  `;

  render() {
    const hasExplicitBg = this.mode !== 'none' && this.src;

    return html`
      ${hasExplicitBg && this.mode === 'image'
        ? html`<div class="bg bg-image" style="background-image: url('${this.src}')"></div>`
        : ''}
      ${hasExplicitBg && this.mode === 'video'
        ? html`<video class="bg bg-video" src="${this.src}" autoplay loop muted playsinline></video>`
        : ''}
      ${!hasExplicitBg
        ? html`<div class="bg bg-default"></div>`
        : ''}
      <div class="grain"></div>
      <div class="grid-pattern"></div>
      <slot></slot>
    `;
  }
}
