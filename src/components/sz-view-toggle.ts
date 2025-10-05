import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { StateController } from '../core/state-controller.js';
import { focusRing } from '../core/styles.js';

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
    .seg {
      display: inline-flex;
      border: 1px solid var(--sz-surface1, #45475a);
      border-radius: 6px;
      overflow: hidden;
      font-size: calc(var(--sz-font-size, 13px) * 0.82);
    }
    button {
      padding: 3px 12px;
      background: transparent;
      border: none;
      color: var(--sz-subtext0, #a6adc8);
      font-family: inherit;
      font-size: inherit;
      cursor: pointer;
      transition: background 0.15s ease, color 0.15s ease;
    }
    button:hover { color: var(--sz-text, #cdd6f4); }
    button.active {
      background: var(--sz-accent, #89b4fa);
      color: var(--sz-crust, #11111b);
      font-weight: 700;
    }
    button + button { border-left: 1px solid var(--sz-surface1, #45475a); }
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
        >nvim</button>
        <button
          class=${mode === 'reading' ? 'active' : ''}
          @click=${() => this.set('reading')}
          aria-pressed=${mode === 'reading'}
          title="Reading view — rendered article"
        >glow</button>
      </div>
    `;
  }
}
