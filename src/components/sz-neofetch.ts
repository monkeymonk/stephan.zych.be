import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { panelStyles } from '../core/styles.js';
import { jsonArrayAttribute } from '../core/data.js';

const LOGO = String.raw`
 ███████╗███████╗
 ██╔════╝╚══███╔╝
 ███████╗  ███╔╝
 ╚════██║ ███╔╝
 ███████║███████╗
 ╚══════╝╚══════╝`;

const PALETTE = ['red', 'peach', 'yellow', 'green', 'teal', 'blue', 'mauve', 'lavender'];

/**
 * neofetch-style identity card. Data is injected by the template:
 *   <sz-neofetch user="..." rows='[["OS","Brussels"], ...]'></sz-neofetch>
 */
@customElement('sz-neofetch')
export class SzNeofetch extends LitElement {
  @property({ attribute: 'user' }) user = '';
  @property({ attribute: 'rows', converter: jsonArrayAttribute }) rows: [string, string][] = [];

  static styles = [panelStyles, css`
    :host { display: block; }
    .fetch {
      display: flex;
      gap: 22px;
      align-items: center;
      flex-wrap: wrap;
    }
    .logo {
      margin: 0;
      color: var(--sz-accent, #89b4fa);
      font-size: calc(var(--sz-font-size, 13px) * 0.7);
      line-height: 1.05;
      white-space: pre;
      text-shadow: 0 0 18px color-mix(in srgb, var(--sz-accent, #89b4fa) 40%, transparent);
    }
    .info {
      flex: 1;
      min-width: 230px;
      display: flex;
      flex-direction: column;
      gap: 2px;
    }
    .user {
      color: var(--sz-green, #a6e3a1);
      font-weight: 700;
    }
    .user .host { color: var(--sz-text, #cdd6f4); }
    .rule {
      height: 1px;
      background: var(--sz-surface1, #45475a);
      margin: 5px 0 7px;
    }
    .row { display: flex; gap: 8px; line-height: 1.7; }
    .k {
      color: var(--sz-accent, #89b4fa);
      font-weight: 700;
      flex: 0 0 64px;
    }
    .v { color: var(--sz-subtext0, #a6adc8); }
    .status .v { color: var(--sz-green, #a6e3a1); }
    .status .v::before {
      content: "●";
      margin-right: 6px;
      animation: pulse 2s ease-in-out infinite;
    }
    .palette {
      display: flex;
      gap: 4px;
      margin-top: 12px;
    }
    .palette span {
      width: 16px;
      height: 16px;
      border-radius: 3px;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    @media (prefers-reduced-motion: reduce) {
      .status .v::before { animation: none; }
    }
    @media (max-width: 600px) {
      .logo { font-size: calc(var(--sz-font-size, 13px) * 0.6); }
    }
  `];

  render() {
    const [name, host] = this.user.split('@');
    return html`
      <div class="panel">
        <div class="panel__cmd"><span class="sigil">❯</span>neofetch</div>
        <div class="panel__body">
          <div class="fetch">
            <pre class="logo" aria-hidden="true">${LOGO}</pre>
            <div class="info">
              <div class="user">${name}${host ? html`<span class="host">@${host}</span>` : ''}</div>
              <div class="rule"></div>
              ${this.rows.map(([k, v]) => html`
                <div class="row ${k.toLowerCase() === 'status' ? 'status' : ''}">
                  <span class="k">${k}</span><span class="v">${v}</span>
                </div>
              `)}
              <div class="palette" aria-hidden="true">
                ${PALETTE.map(c => html`<span style="background: var(--sz-${c}, #888)"></span>`)}
              </div>
            </div>
          </div>
        </div>
      </div>
    `;
  }
}
