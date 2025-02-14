import { LitElement, css, html, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('sz-widget')
export class SzWidget extends LitElement {
  @property() title = '';

  static styles = css`
    :host {
      display: block;
      border: 1px solid var(--sz-surface1, #45475a);
      border-radius: 8px;
      overflow: hidden;
      background: var(--sz-surface0, #313244);
    }

    .title-bar {
      display: flex;
      align-items: center;
      padding: 6px 12px;
      background: var(--sz-mantle, #181825);
      font-size: var(--sz-font-size, 13px);
      color: var(--sz-subtext, #a6adc8);
      border-bottom: 1px solid var(--sz-surface0, #313244);
    }

    .content {
      padding: 16px;
    }
  `;

  render() {
    return html`
      ${this.title ? html`<div class="title-bar">${this.title}</div>` : nothing}
      <div class="content"><slot></slot></div>
    `;
  }
}
