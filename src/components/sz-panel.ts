import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { panelStyles } from '../core/styles.js';

/**
 * A boxed TUI panel for articles — wrap a code block or any content to frame
 * it as command output:
 *   <sz-panel cmd="cat snippet.ts">
 *
 *   ```ts
 *   …code…
 *   ```
 *
 *   </sz-panel>
 */
@customElement('sz-panel')
export class SzPanel extends LitElement {
  @property({ attribute: 'cmd' }) cmd = '';

  static styles = [panelStyles, css`
    :host { display: block; }
    .panel__body ::slotted(pre) { margin: 0; }
    .panel__body ::slotted(:first-child) { margin-top: 0; }
    .panel__body ::slotted(:last-child) { margin-bottom: 0; }
  `];

  render() {
    return html`
      <div class="panel">
        ${this.cmd ? html`<div class="panel__cmd"><span class="sigil">❯</span>${this.cmd}</div>` : ''}
        <div class="panel__body"><slot></slot></div>
      </div>
    `;
  }
}
