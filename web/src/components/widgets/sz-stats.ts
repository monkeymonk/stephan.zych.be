import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { panelStyles, reducedMotion } from '../../core/styles.js';
import { jsonArrayAttribute } from '../../core/data.js';
import { RevealController } from '../../controllers/reveal.js';

interface Counter { value: number; suffix?: string; label: string; }
interface Skill { name: string; level: number; }

/**
 * Animated "receipts" counters + htop-style skill bars. Data via template:
 *   <sz-stats counters='[...]' skills='[...]'></sz-stats>
 * Counts up / fills bars when scrolled into view (respects reduced-motion).
 */
@customElement('sz-stats')
export class SzStats extends LitElement {
  @property({ attribute: 'counters', converter: jsonArrayAttribute }) counters: Counter[] = [];
  @property({ attribute: 'skills', converter: jsonArrayAttribute }) skills: Skill[] = [];

  @state() private display: number[] = [];
  @state() private revealed = false;

  private revealOnView = new RevealController(this, () => this.reveal());

  private reveal() {
    this.revealed = true;
    if (reducedMotion.matches) {
      this.display = this.counters.map(c => c.value);
      return;
    }
    const duration = 1100;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.display = this.counters.map(c => Math.round(c.value * eased));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }

  static styles = [panelStyles, css`
    :host { display: block; }
    .counters {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(110px, 1fr));
      gap: 14px;
    }
    .counter { text-align: center; }
    .counter__num {
      font-size: calc(var(--sz-font-size, 13px) * 2.1);
      font-weight: 700;
      line-height: 1.1;
      color: var(--sz-accent, #89b4fa);
      font-variant-numeric: tabular-nums;
    }
    .counter__num .suffix { color: var(--sz-mauve, #cba6f7); }
    .counter__label {
      margin-top: 2px;
      color: var(--sz-overlay1, #7f849c);
      font-size: calc(var(--sz-font-size, 13px) * 0.85);
    }
    .divider {
      height: 1px;
      background: var(--sz-surface0, #313244);
      margin: 16px 0;
    }
    .skill { margin-bottom: 11px; }
    .skill:last-child { margin-bottom: 0; }
    .skill__head {
      display: flex;
      justify-content: space-between;
      margin-bottom: 4px;
    }
    .skill__name { color: var(--sz-subtext0, #a6adc8); }
    .skill__pct {
      color: var(--sz-overlay1, #7f849c);
      font-variant-numeric: tabular-nums;
    }
    .skill__track {
      height: 8px;
      border-radius: 4px;
      background: var(--sz-surface0, #313244);
      overflow: hidden;
    }
    .skill__fill {
      height: 100%;
      width: 0;
      border-radius: 4px;
      background: linear-gradient(90deg, var(--sz-accent, #89b4fa), var(--sz-mauve, #cba6f7));
      transition: width 1s cubic-bezier(0.16, 1, 0.3, 1);
    }
    @media (prefers-reduced-motion: reduce) {
      .skill__fill { transition: none; }
    }
  `];

  render() {
    return html`
      <div class="panel">
        <div class="panel__cmd"><span class="sigil">❯</span>./stats --receipts</div>
        <div class="panel__body">
          <div class="counters">
            ${this.counters.map((c, i) => html`
              <div class="counter">
                <div class="counter__num">
                  ${this.revealed ? (this.display[i] ?? c.value) : 0}<span class="suffix">${c.suffix ?? ''}</span>
                </div>
                <div class="counter__label">${c.label}</div>
              </div>
            `)}
          </div>
          ${this.skills.length ? html`
            <div class="divider"></div>
            ${this.skills.map(s => html`
              <div class="skill">
                <div class="skill__head">
                  <span class="skill__name">${s.name}</span>
                  <span class="skill__pct">${s.level}%</span>
                </div>
                <div class="skill__track">
                  <div class="skill__fill" style="width: ${this.revealed ? s.level : 0}%"></div>
                </div>
              </div>
            `)}
          ` : ''}
        </div>
      </div>
    `;
  }
}
