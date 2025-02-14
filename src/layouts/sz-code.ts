import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { scrollbarStyles } from '../core/styles.js';

@customElement('sz-code')
export class SzCode extends LitElement {
  @property() mode: 'code' | 'tree' = 'code';
  @property({ type: Boolean, attribute: 'line-numbers' }) lineNumbers = true;

  static styles = [scrollbarStyles, css`
    :host {
      display: block;
      height: 100%;
      overflow-y: auto;
      background: var(--sz-base, #1e1e2e);
      color: var(--sz-text, #cdd6f4);
      font-size: var(--sz-font-size, 13px);
    }
    .code-view {
      display: flex;
      min-height: 100%;
    }
    .gutter {
      flex-shrink: 0;
      padding: 16px 12px 16px 16px;
      text-align: right;
      color: var(--sz-overlay0, #6c7086);
      user-select: none;
      border-right: 1px solid var(--sz-surface0, #313244);
      line-height: 1.6;
    }
    .content {
      flex: 1;
      padding: 16px;
      overflow-x: auto;
      line-height: 1.6;
    }
    .tree-view {
      padding: 12px;
    }
    .tree-item {
      display: flex;
      align-items: center;
      gap: 8px;
      padding: 3px 8px;
      border-radius: 4px;
      cursor: pointer;
      color: var(--sz-text, #cdd6f4);
      text-decoration: none;
      transition: background 0.15s;
    }
    .tree-item:hover {
      background: var(--sz-surface0, #313244);
    }
    .tree-item.dir {
      color: var(--sz-accent, #89b4fa);
    }
    .tree-item.file {
      color: var(--sz-text, #cdd6f4);
    }
    .tree-indent {
      display: inline-block;
    }
    .tree-icon {
      flex-shrink: 0;
      width: 16px;
      text-align: center;
    }
  `];

  render() {
    if (this.mode === 'tree') {
      return html`<div class="tree-view"><slot></slot></div>`;
    }

    return html`
      <div class="code-view">
        ${this.lineNumbers ? html`<div class="gutter"><slot name="gutter"></slot></div>` : nothing}
        <div class="content"><slot></slot></div>
      </div>
    `;
  }
}
