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
      color: var(--sz-overlay0, #6c7086);
      user-select: none;
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
      color: var(--sz-subtext, #a6adc8);
      border-bottom-color: currentColor;
      outline: none;
    }
  `;

  render() {
    return html`<span>© Stéphan Zych</span> ·
      <a href="/terms-and-conditions/">Terms &amp; Conditions</a> ·
      <a href="/privacy/">Privacy</a>`;
  }
}
