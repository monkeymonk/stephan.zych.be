import { LitElement, html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import type { NavTab } from '../core/registry.js';
import { jsonArrayAttribute } from '../core/data.js';
import { TypewriterController } from '../controllers/typewriter.js';
import { focusRing } from '../core/styles.js';

@customElement('sz-dashboard')
export class SzDashboard extends LitElement {
  private typewriter = new TypewriterController(this, { speed: 60 });

  static styles = css`
    ${focusRing}
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100%;
      height: 100%;
      padding: 40px 20px;
      box-sizing: border-box;
      color: var(--sz-text, #cdd6f4);
    }
    .ascii {
      white-space: pre;
      font-size: clamp(4px, 1.2vw, 10px);
      line-height: 1.2;
      color: var(--sz-accent, #89b4fa);
      text-align: center;
      margin-bottom: 24px;
    }
    .tagline {
      color: var(--sz-subtext, #a6adc8);
      min-height: 24px;
      margin-bottom: 32px;
      text-align: center;
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
    .cursor {
      display: inline-block;
      width: 8px;
      height: 16px;
      background: var(--sz-cursor, #89b4fa);
      animation: blink 1s step-end infinite;
      vertical-align: text-bottom;
      margin-left: 2px;
    }
    @keyframes blink {
      50% { opacity: 0; }
    }
    @media (prefers-reduced-motion: reduce) {
      .cursor { animation: none; }
    }
    .links {
      display: flex;
      flex-direction: column;
      gap: 8px;
    }
    .link {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 8px 16px;
      color: var(--sz-text, #cdd6f4);
      text-decoration: none;
      border-radius: 4px;
      transition: background 0.2s;
    }
    .link:hover, .link:focus-visible {
      background: var(--sz-surface0, #313244);
      text-decoration: none;
    }
    /* The surface0 tint is 1.3:1 against the pane — hover feedback, not a
       focus indicator. Let the shared focusRing through instead of killing it.
       Inset so the ring hugs the row's own 4px radius. */
    .link:focus-visible {
      outline: 2px solid var(--sz-accent, #89b4fa);
      outline-offset: -2px;
    }
    .link-key {
      color: var(--sz-accent, #89b4fa);
      font-weight: 700;
      min-width: 16px;
      text-align: center;
    }
    .hint {
      margin-top: 32px;
      color: var(--sz-muted, #989caf);
    }
    .hint kbd {
      display: inline-block;
      padding: 1px 5px;
      background: var(--sz-surface0, #313244);
      border: 1px solid var(--sz-surface1, #45475a);
      border-radius: 3px;
      color: var(--sz-subtext, #a6adc8);
      font-family: inherit;
    }

    @media (max-width: 768px) {
      /* The document scrolls on mobile, so the host's ancestors are all
         auto-height and height:100% resolves to content height — the hero
         would stop filling the screen and lose its vertical centring. Measure
         against the viewport minus the fixed titlebar/status/tmux bars. */
      :host {
        min-height: calc(100dvh - var(--sz-mobile-chrome-top) - var(--sz-mobile-chrome-bottom));
        height: auto;
      }
      .ascii { font-size: clamp(3px, 2vw, 6px); }
      .hint { display: none; }
    }
  `;

  /** Navigation tabs, injected by the template (nav='[...]'). */
  @property({ attribute: 'nav', converter: jsonArrayAttribute }) nav: NavTab[] = [];
  /** ASCII wordmark lines, injected by the template (wordmark='[...]'). */
  @property({ attribute: 'wordmark', converter: jsonArrayAttribute }) wordmark: string[] = [];
  /** Rotating taglines, injected by the template (taglines='[...]'). */
  @property({ attribute: 'taglines', converter: jsonArrayAttribute }) taglines: string[] = [];

  private get asciiArt(): string {
    return this.wordmark.join('\n');
  }

  private get taglineList(): string[] {
    return this.taglines;
  }

  connectedCallback() {
    super.connectedCallback();
    this.typewriter.cycle(this.taglineList, { pauseBetween: 3000, eraseSpeed: 30 });
  }

  private get dashboardLinks() {
    return this.nav
      .filter(tab => tab.key && tab.name !== 'home')
      .map(tab => ({ label: tab.name, key: tab.key!, href: tab.path, icon: tab.icon || 'file' }));
  }

  // The ASCII wordmark below is decoration (aria-hidden); its text equivalent
  // is the page's h1, which lives in light DOM (src/pages/index.njk) rather
  // than in here so it is in the served HTML before — and without — the bundle.
  render() {
    return html`
      <div class="ascii" aria-hidden="true">${this.asciiArt}</div>
      <p class="sr-only">${this.taglineList.join('. ')}</p>
      <div class="tagline" aria-hidden="true">
        ${this.typewriter.text}<span class="cursor"></span>
      </div>
      <div class="links">
        ${this.dashboardLinks.map(link => html`
          <a class="link" href="${link.href}">
            <span class="link-key">${link.key}</span>
            <sz-icon name="${link.icon}" size="14"></sz-icon>
            ${link.label}
          </a>
        `)}
      </div>
      <div class="hint">
        Press <kbd>:</kbd> command palette · <kbd>/</kbd> search · <kbd>?</kbd> help · <kbd>Alt+1-5</kbd> tabs
      </div>
    `;
  }
}
