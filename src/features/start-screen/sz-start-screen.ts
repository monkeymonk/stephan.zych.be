import { LitElement, html, css, nothing } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { registry, type StartScreenItem } from '../../core/registry.js';
import { actions } from '../../core/actions.js';
import { START_SCREEN_ACTION } from './actions.js';

@customElement('sz-start-screen')
export class SzStartScreen extends LitElement {
  /** Hidden while the terminal window is open; revealed when it is closed. */
  @property({ type: Boolean }) inactive = false;

  static styles = css`
    :host {
      display: contents;
    }

    .start-screen {
      position: fixed;
      inset: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    .pill {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 64px;
      padding: 24px 32px;
      border-radius: 16px;
      background: rgba(0, 0, 0, 0.3);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.06);
      pointer-events: auto;
    }

    .item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      background: none;
      border: none;
      cursor: pointer;
      padding: 8px;
      border-radius: 8px;
      color: var(--sz-text, #cdd6f4);
      font-family: inherit;
      transition: transform 0.15s ease;
      outline: none;
    }

    .item:hover {
      transform: scale(1.05);
    }

    .item:hover .icon-wrap {
      box-shadow: 0 0 16px rgba(137, 180, 250, 0.3);
    }

    .item:focus-visible {
      outline: 2px solid var(--sz-accent, #89b4fa);
      outline-offset: 4px;
    }

    .icon-wrap {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: box-shadow 0.2s ease;
    }

    .label {
      font-size: 11px;
      text-align: center;
      text-shadow: 0 1px 3px rgba(0, 0, 0, 0.5);
      color: var(--sz-text, #cdd6f4);
    }

    @media (max-width: 768px) {
      .pill {
        gap: 48px;
        padding: 16px 20px;
      }

      .icon-wrap {
        width: 36px;
        height: 36px;
      }
    }
  `;

  private handleClick(item: StartScreenItem) {
    actions.dispatch(START_SCREEN_ACTION.LAUNCH, item);
  }

  private handleKeydown(e: KeyboardEvent, index: number) {
    const items = this.shadowRoot?.querySelectorAll<HTMLButtonElement>('.item');
    if (!items) return;

    let target: number | null = null;
    if (e.key === 'ArrowRight') target = (index + 1) % items.length;
    if (e.key === 'ArrowLeft') target = (index - 1 + items.length) % items.length;

    if (target !== null) {
      e.preventDefault();
      items[target].focus();
    }
  }

  render() {
    const items = registry.startScreenItems;
    if (this.inactive || items.length === 0) return nothing;

    return html`
      <div class="start-screen">
        <div class="pill">
          ${items.map((item, i) => html`
            <button
              class="item"
              @click=${() => this.handleClick(item)}
              @keydown=${(e: KeyboardEvent) => this.handleKeydown(e, i)}
              tabindex="0"
              title="${item.label}"
              aria-label="${item.label}"
            >
              <div class="icon-wrap">
                <sz-icon name="${item.icon}" size="22"></sz-icon>
              </div>
              <span class="label">${item.label}</span>
            </button>
          `)}
        </div>
      </div>
    `;
  }
}
