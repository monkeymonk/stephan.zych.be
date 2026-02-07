import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { copyText } from '../../core/clipboard.js';

/**
 * Inline copy-to-clipboard chip for commands and snippets:
 *   <sz-copy>ssh stephan.zych.be</sz-copy>
 *   <sz-copy text="npm create vite@latest">npm create vite@latest</sz-copy>
 * Copies the `text` attribute, falling back to its slotted text content.
 */
@customElement('sz-copy')
export class SzCopy extends LitElement {
  @property({ attribute: 'text' }) text = '';

  private async copy() {
    const value = (this.text || this.textContent || '').trim();
    if (value) await copyText(value, `📋 Copied: ${value}`);
  }

  static styles = css`
    :host {
      display: inline-flex;
      align-items: center;
      gap: 4px;
      vertical-align: baseline;
      background: var(--sz-surface0, #313244);
      border: 1px solid var(--sz-surface1, #45475a);
      border-radius: 4px;
      padding: 1px 3px 1px 8px;
      font-family: var(--sz-font, ui-monospace, 'JetBrains Mono', monospace);
      font-size: var(--sz-font-size, 13px);
      line-height: 1.5;
    }
    .text { color: var(--sz-green, #a6e3a1); white-space: pre-wrap; }
    button {
      all: unset;
      cursor: pointer;
      padding: 0 4px;
      border-radius: 3px;
      color: var(--sz-subtext0, #a6adc8);
      transition: color 0.15s ease, background 0.15s ease;
    }
    button:hover { color: var(--sz-accent, #89b4fa); background: var(--sz-surface1, #45475a); }
    button:focus-visible { outline: 1px solid var(--sz-accent, #89b4fa); color: var(--sz-accent, #89b4fa); }
  `;

  render() {
    return html`<code class="text"><slot>${this.text}</slot></code><button @click=${this.copy} aria-label="Copy to clipboard" title="Copy">⧉</button>`;
  }
}
