import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

/**
 * Discreet copyright notice pinned to the bottom-left corner, floating over the
 * desktop background beneath the terminal window. Only the link is interactive,
 * so the rest of the desktop stays clickable. The SPA router picks up the link
 * via composedPath(), so navigation stays client-side.
 */
@customElement('sz-copyright-footer')
export class SzCopyrightFooter extends LitElement {
  static styles = css`
    :host {
      position: fixed;
      bottom: 12px;
      left: 14px;
      z-index: 2;
      pointer-events: none;
      font-size: 11px;
      letter-spacing: 0.02em;
      user-select: none;

      /* This is the one piece of text that lives outside the terminal window,
         sitting straight on the rotating wallpaper — so its contrast is not
         merely low, it is undefined: a bright slide takes the pair toward 1:1
         and no colour choice can fix that. The plate below is what makes the
         background knowable at all. At 82% crust the worst case (pure white
         wallpaper showing through) still lands at 6.2:1 mocha / 5.4:1 gruvbox
         / 4.9:1 tokyonight against --sz-subtext1, so the pair passes AA
         whatever photograph is up. Keep the tint opaque enough for that to
         hold if you retune it.
         The blur is the same frosted vocabulary as sz-glass, minus the
         refraction: this is a 11px label, not a surface. */
      padding: 3px 8px;
      border-radius: 5px;
      color: var(--sz-subtext1, #bac2de);
      background: color-mix(in srgb, var(--sz-crust, #11111b) 82%, transparent);
      border: 1px solid color-mix(in srgb, var(--sz-surface1, #45475a) 55%, transparent);
      backdrop-filter: blur(6px) saturate(140%);
      -webkit-backdrop-filter: blur(6px) saturate(140%);
    }
    a {
      pointer-events: auto;
      color: inherit;
      text-decoration: none;
      border-bottom: 1px solid transparent;
      transition: color 0.15s ease, border-color 0.15s ease;
    }
    a:hover,
    a:focus-visible {
      color: var(--sz-text, #cdd6f4);
      border-bottom-color: currentColor;
    }
    /* A 1px underline plus a colour shift is not a focus indicator — WCAG
       2.4.11 wants a 3:1 area, and the shift here is well under it. This is
       the focusRing pattern from core/styles.ts, inlined because this
       component does not otherwise pull in the shared sheet. */
    a:focus-visible {
      outline: 2px solid var(--sz-accent, #89b4fa);
      outline-offset: 2px;
      border-radius: 2px;
    }
  `;

  render() {
    return html`<span>© Stéphan Zych</span> ·
      <a href="/terms-and-conditions/">Terms &amp; Conditions</a> ·
      <a href="/privacy/">Privacy</a>`;
  }
}
