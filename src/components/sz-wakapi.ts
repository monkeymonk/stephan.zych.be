import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { cmdLine, reducedMotion } from '../core/styles.js';
import { jsonArrayAttribute } from '../core/data.js';

interface Lang { name: string; percent: number; text?: string; }

const BAR_COLORS = ['blue', 'mauve', 'green', 'peach', 'yellow', 'teal', 'lavender', 'red'];

/**
 * Coding activity from a self-hosted Wakapi instance. The numbers are fetched
 * at BUILD time (see src/data/wakapi.js) and injected via attributes — no API
 * key ever reaches the browser.
 *   <sz-wakapi range="..." total="..." daily="..." languages='[...]'></sz-wakapi>
 */
@customElement('sz-wakapi')
export class SzWakapi extends LitElement {
  @property({ attribute: 'range' }) range = '';
  @property({ attribute: 'total' }) total = '';
  @property({ attribute: 'daily' }) daily = '';
  @property({ attribute: 'languages', converter: jsonArrayAttribute }) languages: Lang[] = [];

  @state() private revealed = false;
  private observer?: IntersectionObserver;

  connectedCallback() {
    super.connectedCallback();
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        this.observer?.disconnect();
        this.revealed = true;
      }
    }, { threshold: 0.35 });
    this.observer.observe(this);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.observer?.disconnect();
  }

  static styles = [cmdLine, css`
    :host { display: block; margin: 1.5em 0; }
    .summary {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 6px 14px;
      margin-bottom: 16px;
    }
    .total {
      font-size: calc(var(--sz-font-size, 13px) * 1.5);
      font-weight: 700;
      color: var(--sz-accent, #89b4fa);
    }
    .muted { color: var(--sz-overlay1, #7f849c); font-size: calc(var(--sz-font-size, 13px) * 0.9); }
    .lang { margin-bottom: 10px; }
    .lang:last-child { margin-bottom: 0; }
    .lang__head {
      display: flex;
      justify-content: space-between;
      gap: 10px;
      margin-bottom: 4px;
    }
    .lang__name { color: var(--sz-subtext0, #a6adc8); }
    .lang__meta {
      color: var(--sz-overlay1, #7f849c);
      font-size: calc(var(--sz-font-size, 13px) * 0.85);
      white-space: nowrap;
    }
    .lang__track {
      height: 8px;
      border-radius: 4px;
      background: var(--sz-surface0, #313244);
      overflow: hidden;
    }
    .lang__fill {
      height: 100%;
      width: 0;
      border-radius: 4px;
      transition: width 1s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @media (prefers-reduced-motion: reduce) {
      .lang__fill { transition: none; }
    }
  `];

  render() {
    const fill = (pct: number) => (this.revealed || reducedMotion.matches ? pct : 0);
    return html`
      <div class="cmd"><span class="sigil">❯</span>wakatime --last-7-days</div>
      <div class="summary">
            <span class="total">${this.total}</span>
            ${this.daily ? html`<span class="muted">~${this.daily} / day</span>` : ''}
            <span class="muted">· ${this.range}</span>
          </div>
          ${this.languages.map((l, i) => html`
            <div class="lang">
              <div class="lang__head">
                <span class="lang__name">${l.name}</span>
                <span class="lang__meta">${l.text ? `${l.text} · ` : ''}${l.percent}%</span>
              </div>
              <div class="lang__track">
                <div class="lang__fill"
                     style="width: ${fill(l.percent)}%; background: var(--sz-${BAR_COLORS[i % BAR_COLORS.length]}, #89b4fa)"></div>
              </div>
            </div>
          `)}
    `;
  }
}
