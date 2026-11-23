import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { StateController } from '../../core/state-controller.js';
import { focusRing } from '../../core/styles.js';

/**
 * Switches an article between the code-like (line-numbered, "nvim") view and
 * the readable ("glow") view. Backed by the persisted appState.viewMode and
 * applied globally via <html data-view>. Also driven by `:set view`.
 */
@customElement('sz-view-toggle')
export class SzViewToggle extends LitElement {
  private stateCtrl = new StateController(this, ['viewMode']);

  static styles = [focusRing, css`
    :host { display: inline-flex; }
    /* Discreet, text-only: same size and muted tone as the article breadcrumb
       it shares a row with, so the two read as one quiet line of chrome. */
    .seg {
      display: inline-flex;
      align-items: baseline;
      font-size: calc(var(--sz-font-size, 13px) * 0.88);
      color: var(--sz-muted, #989caf);
    }
    button {
      padding: 0 2px;
      background: transparent;
      border: none;
      color: var(--sz-subtext0, #a6adc8);
      font-family: inherit;
      font-size: inherit;
      line-height: inherit;
      cursor: pointer;
      transition: color 0.15s ease;
    }
    button:hover { color: var(--sz-accent, #89b4fa); }
    button.active {
      color: var(--sz-text, #cdd6f4);
      cursor: default;
    }
    button + button::before {
      content: "/";
      margin: 0 6px 0 4px;
      color: var(--sz-muted, #989caf);
    }
  `];

  private set(mode: 'code' | 'reading') {
    this.stateCtrl.set('viewMode', mode);
  }

  render() {
    const mode = this.stateCtrl.get('viewMode');
    return html`
      <div class="seg" role="group" aria-label="View mode">
        <button
          class=${mode === 'code' ? 'active' : ''}
          @click=${() => this.set('code')}
          aria-pressed=${mode === 'code'}
          title="Code view — line-numbered source"
        >markdown</button>
        <button
          class=${mode === 'reading' ? 'active' : ''}
          @click=${() => this.set('reading')}
          aria-pressed=${mode === 'reading'}
          title="Reading view — rendered article"
        >html</button>
      </div>
    `;
  }
}
