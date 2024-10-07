import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { StateController } from '../shared/state-controller.js';

@customElement('sz-statusbar')
export class SzStatusbar extends LitElement {
  private stateCtrl = new StateController(this, ['theme', 'windowMode']);

  @property() route = '/';
  @state() private time = '';

  static styles = css`
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 28px;
      background: var(--sz-statusbar-bg, #181825);
      color: var(--sz-statusbar-text, #a6adc8);
      font-size: 12px;
      padding: 0 12px;
      gap: 12px;
      user-select: none;
    }
    .segment {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mode {
      background: var(--sz-statusbar-accent, #89b4fa);
      color: var(--sz-base, #1e1e2e);
      padding: 1px 8px;
      border-radius: 2px;
      font-weight: 700;
      font-size: 11px;
      text-transform: uppercase;
    }
    .route {
      color: var(--sz-text, #cdd6f4);
    }
    .branch {
      color: var(--sz-mauve, #cba6f7);
    }
    .separator {
      color: var(--sz-overlay0, #6c7086);
    }
    .social-link {
      color: var(--sz-subtext, #a6adc8);
      text-decoration: none;
      transition: color 0.2s;
    }
    .social-link:hover {
      color: var(--sz-accent, #89b4fa);
    }

    .socials {
      display: flex;
      align-items: center;
      gap: 6px;
    }

    @media (max-width: 768px) {
      .center, .encoding, .time, .socials { display: none; }
    }
  `;

  private timer?: number;

  connectedCallback() {
    super.connectedCallback();
    this.updateTime();
    this.timer = window.setInterval(() => this.updateTime(), 60000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.timer) clearInterval(this.timer);
  }

  private updateTime() {
    const now = new Date();
    this.time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false });
  }

  private routeToPath(route: string): string {
    if (route === '/') return '~/index';
    return '~' + route.replace(/\/$/, '').replace(/\//g, '/');
  }

  render() {
    const theme = this.stateCtrl.get('theme');

    return html`
      <div class="segment" role="status">
        <span class="mode">NORMAL</span>
        <span class="route">${this.routeToPath(this.route)}</span>
      </div>
      <div class="segment center">
        <span class="branch">main</span>
      </div>
      <div class="segment">
        <span>${theme}</span>
        <span class="separator">|</span>
        <span class="encoding">utf-8</span>
        <span class="separator">|</span>
        <span class="time">${this.time}</span>
        <span class="separator">|</span>
        <span class="socials">
          <a class="social-link" href="https://github.com/monkeymonk" target="_blank" rel="noopener" aria-label="GitHub">
            <sz-icon name="github" size="13"></sz-icon>
          </a>
          <a class="social-link" href="#" target="_blank" rel="noopener" aria-label="LinkedIn">
            <sz-icon name="linkedin" size="13"></sz-icon>
          </a>
          <a class="social-link" href="mailto:hello@stephan.zych.be" aria-label="Email">
            <sz-icon name="mail" size="13"></sz-icon>
          </a>
        </span>
      </div>
    `;
  }
}
