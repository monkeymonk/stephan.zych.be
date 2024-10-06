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
    ::slotted(*) {
      position: relative;
      z-index: 1;
    }
  `;

  render() {
    return html`
      ${this.mode === 'image' && this.src
        ? html`<div class="bg bg-image" style="background-image: url('${this.src}')"></div>`
        : ''}
      ${this.mode === 'video' && this.src
        ? html`<video class="bg bg-video" src="${this.src}" autoplay loop muted playsinline></video>`
        : ''}
      <slot></slot>
    `;
  }
}
