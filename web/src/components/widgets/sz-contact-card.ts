import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { panelStyles, focusRing, clockStyles } from '../../core/styles.js';
import { clock, type ClockTime } from '../../core/clock.js';
import { copyText } from '../../core/clipboard.js';

/**
 * Terminal "contact card" — `cat ~/.contact` with copy-to-clipboard and a
 * live local clock. Data via attributes:
 *   <sz-contact-card email="..." github="..." linkedin="..."></sz-contact-card>
 */
@customElement('sz-contact-card')
export class SzContactCard extends LitElement {
  @property({ attribute: 'email' }) email = '';
  @property({ attribute: 'github' }) github = '';
  @property({ attribute: 'linkedin' }) linkedin = '';

  @state() private time: ClockTime = clock.time;
  private clockUnsub?: () => void;

  connectedCallback() {
    super.connectedCallback();
    this.clockUnsub = clock.subscribe((t) => { this.time = t; });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.clockUnsub?.();
  }

  private async copyEmail() {
    await copyText(this.email, '✓ Email copied to clipboard');
  }

  private host(url: string) {
    return url.replace(/^https?:\/\//, '').replace(/\/$/, '');
  }

  static styles = [panelStyles, focusRing, clockStyles, css`
    :host { display: block; }
    .row {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 9px 0;
      border-bottom: 1px dashed var(--sz-surface0, #313244);
    }
    .row:last-of-type { border-bottom: none; }
    .tag {
      flex: 0 0 2.4ch;
      color: var(--sz-overlay1, #7f849c);
      text-align: center;
    }
    .row a {
      color: var(--sz-text, #cdd6f4);
      text-decoration: none;
    }
    .row a:hover { color: var(--sz-accent, #89b4fa); text-decoration: underline; }
    .grow { flex: 1; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .copy {
      flex-shrink: 0;
      background: var(--sz-surface0, #313244);
      border: 1px solid var(--sz-surface1, #45475a);
      color: var(--sz-subtext0, #a6adc8);
      border-radius: 5px;
      padding: 3px 10px;
      font-family: inherit;
      font-size: calc(var(--sz-font-size, 13px) * 0.85);
      cursor: pointer;
      transition: all 0.15s ease;
    }
    .copy:hover {
      border-color: var(--sz-accent, #89b4fa);
      color: var(--sz-accent, #89b4fa);
    }
    .meta {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 14px;
      margin-top: 14px;
      color: var(--sz-overlay1, #7f849c);
      font-size: calc(var(--sz-font-size, 13px) * 0.88);
    }
    .meta .online { color: var(--sz-green, #a6e3a1); }
    .meta .online::before {
      content: "●";
      margin-right: 5px;
      animation: pulse 2s ease-in-out infinite;
    }
    @keyframes pulse { 0%, 100% { opacity: 1; } 50% { opacity: 0.4; } }
    @media (prefers-reduced-motion: reduce) {
      .meta .online::before { animation: none; }
    }
  `];

  render() {
    return html`
      <div class="panel">
        <div class="panel__body">
          ${this.email ? html`
            <div class="row">
              <span class="tag" aria-hidden="true">✉</span>
              <a class="grow" href="mailto:${this.email}">${this.email}</a>
              <button class="copy" @click=${this.copyEmail} aria-label="Copy email address">copy</button>
            </div>
          ` : ''}
          ${this.github ? html`
            <div class="row">
              <span class="tag" aria-hidden="true">gh</span>
              <a class="grow" href="${this.github}" target="_blank" rel="noopener noreferrer">${this.host(this.github)}</a>
            </div>
          ` : ''}
          ${this.linkedin ? html`
            <div class="row">
              <span class="tag" aria-hidden="true">in</span>
              <a class="grow" href="${this.linkedin}" target="_blank" rel="noopener noreferrer">${this.host(this.linkedin)}</a>
            </div>
          ` : ''}
          <div class="meta">
            <span>◍ Brussels · ${this.time.hh}<span class="clock-colon">:</span>${this.time.mm} CET</span>
            <span class="online">open to projects</span>
          </div>
        </div>
      </div>
    `;
  }
}
