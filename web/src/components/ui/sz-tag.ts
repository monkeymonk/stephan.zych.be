import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

// Inline mid-sentence tag mention in CV free-text prose, e.g.
// "...shipping with <sz-tag>Docker</sz-tag> and..." — the chip visual
// matches .sz-cv__taglist li / .sz-cv__tag in cv.css exactly (same
// colors/padding/radius), just packaged as a real element instead of a
// class on a <span> the parser had to inject.
@customElement('sz-tag')
export class SzTag extends LitElement {
  static styles = css`
    :host {
      display: inline-block;
      padding: 0 8px;
      font-size: 0.88em;
      color: color-mix(in srgb, var(--sz-lavender, #b4befe) 85%, var(--sz-text, #cdd6f4));
      background: var(--sz-surface0, #313244);
      border-radius: 2px;
    }
  `;

  render() {
    return html`<slot></slot>`;
  }
}
