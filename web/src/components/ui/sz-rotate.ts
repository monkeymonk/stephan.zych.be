import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { reducedMotion } from '../../core/styles.js';

// Inline mid-sentence rotating phrase, authored as plain prose text content
// (not an attribute) so the author's sentence stays self-contained Markdown,
// e.g. "...I'm <sz-rotate>Architect | Lead | Developer</sz-rotate> at CBTW."
// Items are split on "|" from the element's own light-DOM text. One item
// renders statically; two or more cross-fade on a timer. All items are
// stacked in the same CSS Grid cell so the host's box sizes to the widest
// one and the surrounding prose never reflows when the active item swaps.
@customElement('sz-rotate')
export class SzRotate extends LitElement {
  /** Milliseconds each item stays visible before the next one fades in. */
  @property({ type: Number }) dwell = 2800;

  @state() private index = 0;

  private items: string[] = [];
  private timer?: number;
  private paused = false;

  static styles = css`
    :host {
      display: inline-grid;
      vertical-align: baseline;
      font: inherit;
      color: inherit;
    }

    .frame {
      display: inline-grid;
    }

    .item {
      grid-area: 1 / 1;
      opacity: 0;
      transition: opacity 0.25s ease;
      pointer-events: none;
    }

    .item.is-active {
      opacity: 1;
    }

    .sr-only {
      position: absolute;
      width: 1px;
      height: 1px;
      padding: 0;
      margin: -1px;
      overflow: hidden;
      clip: rect(0, 0, 0, 0);
      white-space: nowrap;
      border: 0;
    }

    @media (prefers-reduced-motion: reduce) {
      .item {
        transition: none;
      }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    if (this.items.length === 0) {
      const raw = this.textContent ?? '';
      this.items = raw
        .split('|')
        .map((part) => part.trim())
        .filter(Boolean);
    }
    // No interactive content by default; a tab stop is added only to make
    // the pause-on-focus behaviour reachable for keyboard users, and only
    // when there is actually something to pause.
    if (this.items.length > 1) {
      this.tabIndex = 0;
      this.addEventListener('mouseenter', this.pause);
      this.addEventListener('mouseleave', this.resume);
      this.addEventListener('focusin', this.pause);
      this.addEventListener('focusout', this.resume);
    }
    this.start();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.stop();
    this.removeEventListener('mouseenter', this.pause);
    this.removeEventListener('mouseleave', this.resume);
    this.removeEventListener('focusin', this.pause);
    this.removeEventListener('focusout', this.resume);
  }

  private pause = () => {
    this.paused = true;
  };

  private resume = () => {
    this.paused = false;
  };

  private start() {
    if (this.items.length < 2 || reducedMotion.matches) return;
    this.stop();
    this.timer = window.setInterval(() => {
      if (this.paused) return;
      this.index = (this.index + 1) % this.items.length;
    }, this.dwell);
  }

  private stop() {
    if (this.timer !== undefined) {
      window.clearInterval(this.timer);
      this.timer = undefined;
    }
  }

  render() {
    if (this.items.length <= 1) {
      return html`${this.items[0] ?? ''}`;
    }
    return html`
      <span class="frame" aria-hidden="true">
        ${this.items.map(
          (item, i) => html`<span class="item ${i === this.index ? 'is-active' : ''}">${item}</span>`
        )}
      </span>
      <span class="sr-only">${this.items.join(' / ')}</span>
    `;
  }
}
