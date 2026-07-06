import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';

/**
 * Reusable "liquid glass" material (Apple-style). Wrap any content:
 *
 *   <sz-glass><nav>…</nav></sz-glass>
 *
 * It renders a refractive, tinted, specular-lit surface behind a slot — the
 * wallpaper/content behind it is blurred and warped through an SVG displacement
 * filter, then lit with inset speculars. The element is agnostic: it knows
 * nothing about what it wraps. Theme it with custom properties on the host:
 *
 *   --glass-radius      corner radius            (default 24px)
 *   --glass-tint        overlay tint             (default rgba(255,255,255,.1))
 *   --glass-shine-1/-2  inset specular edges
 *   --glass-backdrop    backdrop-filter value    (default blur + saturate)
 *   --glass-shadow      outer drop shadow
 *
 * and the `scale` attribute for refraction strength (default 60).
 */
@customElement('sz-glass')
export class SzGlass extends LitElement {
  /** Displacement strength — how hard the backdrop is refracted. */
  @property({ type: Number }) scale = 60;

  static styles = css`
    :host {
      position: relative;
      display: block;
      border-radius: var(--glass-radius, 24px);
      /* Clip the refraction bleed to the rounded shape; the drop shadow,
         painted outside the border box, is unaffected by the clip. */
      overflow: hidden;
      box-shadow: var(
        --glass-shadow,
        0 6px 24px rgba(0, 0, 0, 0.28),
        0 2px 6px rgba(0, 0, 0, 0.22)
      );
    }

    .warp,
    .tint,
    .shine {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      pointer-events: none;
    }

    /* Refraction: blur the backdrop, then warp it through the SVG filter. */
    .warp {
      backdrop-filter: var(--glass-backdrop, blur(2px) saturate(150%));
      -webkit-backdrop-filter: var(--glass-backdrop, blur(2px) saturate(150%));
      filter: url(#glass-distortion);
      isolation: isolate;
    }

    .tint {
      background: var(--glass-tint, rgba(255, 255, 255, 0.1));
    }

    .shine {
      box-shadow:
        inset 1px 1px 0 var(--glass-shine-1, rgba(255, 255, 255, 0.55)),
        inset -1px -1px 1px var(--glass-shine-2, rgba(255, 255, 255, 0.12)),
        inset 0 0 14px rgba(255, 255, 255, 0.05);
    }

    /* Slotted content rides above the glass layers. */
    .content {
      position: relative;
    }

    /* Off-screen host for the displacement filter definition. */
    .defs {
      position: absolute;
      width: 0;
      height: 0;
      pointer-events: none;
    }

    /* The live SVG refraction is the heaviest part and recomputes every frame
       behind an animated backdrop. Drop just the displacement (keeping the
       cheap frosted blur) where it costs most and shows least: touch devices
       and reduced-motion users. Desktop keeps the full effect. */
    @media (prefers-reduced-motion: reduce), (hover: none) {
      .warp {
        filter: none;
      }
    }
  `;

  render() {
    return html`
      <div class="warp"></div>
      <div class="tint"></div>
      <div class="shine"></div>
      <div class="content"><slot></slot></div>
      <svg class="defs" aria-hidden="true">
        <filter id="glass-distortion" x="0%" y="0%" width="100%" height="100%">
          <feTurbulence
            type="fractalNoise"
            baseFrequency="0.008 0.008"
            numOctaves="2"
            seed="42"
            result="noise"
          ></feTurbulence>
          <feGaussianBlur in="noise" stdDeviation="2" result="blurred"></feGaussianBlur>
          <feDisplacementMap
            in="SourceGraphic"
            in2="blurred"
            scale="${this.scale}"
            xChannelSelector="R"
            yChannelSelector="G"
          ></feDisplacementMap>
        </filter>
      </svg>
    `;
  }
}
