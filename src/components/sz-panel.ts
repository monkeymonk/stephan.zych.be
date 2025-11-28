import { html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { panelStyles } from '../core/styles.js';
import { ViewAwareElement } from '../core/view-aware.js';

/**
 * A TUI panel for articles — wrap a code block or any content. In the reading
 * ("glow") view it is framed as command output (boxed, "❯ cmd"); in the code
 * ("nvim") view the box is dropped so the content sits inline in the source.
 *   <sz-panel cmd="cat snippet.ts">
 *
 *   ```ts
 *   …code…
 *   ```
 *
 *   </sz-panel>
 */
@customElement('sz-panel')
export class SzPanel extends ViewAwareElement {
  @property({ attribute: 'cmd' }) cmd = '';

  static styles = [panelStyles, css`
    :host { display: block; }
    .panel__body ::slotted(pre) { margin: 0; }
    .panel__body ::slotted(:first-child) { margin-top: 0; }
    .panel__body ::slotted(:last-child) { margin-bottom: 0; }
    .bare ::slotted(pre) { margin: 0; }
  `];

  renderCode() {
    return html`<div class="bare"><slot></slot></div>`;
  }

  renderGlow() {
    return html`
      <div class="panel">
        ${this.cmd ? html`<div class="panel__cmd"><span class="sigil">❯</span>${this.cmd}</div>` : ''}
        <div class="panel__body"><slot></slot></div>
      </div>
    `;
  }
}
