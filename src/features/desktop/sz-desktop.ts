import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('sz-desktop')
export class SzDesktop extends LitElement {
  static styles = css`
    :host {
      display: contents;
    }
  `;

  render() {
    return html`<slot></slot>`;
  }
}
