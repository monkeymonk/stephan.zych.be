import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('sz-background')
export class SzBackground extends LitElement {
  static styles = css`
    :host {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 0;
      overflow: hidden;
      pointer-events: none;
    }

    .bg-default,
    .slot-layer,
    .grain,
    .grid-pattern {
      position: absolute;
      inset: 0;
    }

    .bg-default {
      background:
        radial-gradient(ellipse at 20% 50%, rgba(88, 101, 242, 0.12) 0%, transparent 50%),
        radial-gradient(ellipse at 80% 20%, rgba(137, 180, 250, 0.08) 0%, transparent 50%),
        radial-gradient(ellipse at 50% 80%, rgba(203, 166, 247, 0.06) 0%, transparent 50%),
        linear-gradient(160deg, #0a0a12 0%, #0d0d1a 40%, #0a0a12 100%);
      /* Stepped, not eased. This animates the filter property on a
         viewport-sized fixed layer, so every distinct value is a full-viewport
         repaint — measured at one per frame, forever, on every page. The drift
         is 15deg over 30s: half a degree a second, which no eye resolves frame
         to frame. Fifteen steps keep the same slow wander for one repaint
         every two seconds. */
      animation: bg-drift 30s steps(15, end) infinite alternate;
      z-index: 0;
    }

    .slot-layer {
      z-index: 1;
    }

    .grain {
      opacity: 0.03;
      background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E");
      background-repeat: repeat;
      background-size: 256px 256px;
      z-index: 2;
    }

    .grid-pattern {
      background-image:
        linear-gradient(rgba(255,255,255,0.015) 1px, transparent 1px),
        linear-gradient(90deg, rgba(255,255,255,0.015) 1px, transparent 1px);
      background-size: 60px 60px;
      z-index: 3;
    }

    @keyframes bg-drift {
      0% { filter: hue-rotate(0deg); }
      100% { filter: hue-rotate(15deg); }
    }

    @media (prefers-reduced-motion: reduce) {
      .bg-default { animation: none; }
    }
  `;

  render() {
    return html`
      <div class="bg-default"></div>
      <div class="slot-layer"><slot></slot></div>
      <div class="grain"></div>
      <div class="grid-pattern"></div>
    `;
  }
}
