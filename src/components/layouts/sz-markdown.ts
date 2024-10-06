import { LitElement, html } from 'lit';
import { customElement } from 'lit/decorators.js';

@customElement('sz-markdown')
export class SzMarkdown extends LitElement {
  // Use light DOM so Eleventy-rendered HTML is styled directly
  // This also ensures content is visible to search engines
  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.classList.add('sz-prose');
  }

  render() {
    return html``;
  }
}
