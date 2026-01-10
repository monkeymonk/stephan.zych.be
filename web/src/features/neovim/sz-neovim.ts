import { LitElement } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('sz-neovim')
export class SzNeovim extends LitElement {
  @property({ type: Boolean, attribute: 'show-gutter' }) showGutter = false;

  // Light DOM for SEO — content is slotted from Eleventy templates
  createRenderRoot() { return this; }

  connectedCallback() {
    super.connectedCallback();
    this.style.display = 'flex';
    this.style.flexDirection = 'column';
    this.style.flex = '1';
    this.style.overflow = 'hidden';
    this.style.position = 'relative';
    this.style.fontFamily = "'JetBrains Mono', monospace";
    this.style.fontSize = 'var(--sz-font-size, 13px)';
    this.style.lineHeight = '1.5';

    // Make #main-content scrollable
    requestAnimationFrame(() => {
      const mainContent = this.querySelector('#main-content');
      if (mainContent instanceof HTMLElement) {
        mainContent.style.flex = '1';
        mainContent.style.overflowY = 'auto';
        mainContent.style.overflowX = 'hidden';
      }
    });
  }
}
