import { LitElement, html, css } from 'lit';
import { customElement } from 'lit/decorators.js';
import { registry } from '../core/registry.js';
import { TypewriterController } from '../controllers/typewriter.js';

const ASCII_ART = `
███████╗████████╗███████╗██████╗ ██╗  ██╗ █████╗ ███╗   ██╗
██╔════╝╚══██╔══╝██╔════╝██╔══██╗██║  ██║██╔══██╗████╗  ██║
███████╗   ██║   █████╗  ██████╔╝███████║███████║██╔██╗ ██║
╚════██║   ██║   ██╔══╝  ██╔═══╝ ██╔══██║██╔══██║██║╚██╗██║
███████║   ██║   ███████╗██║     ██║  ██║██║  ██║██║ ╚████║
╚══════╝   ╚═╝   ╚══════╝╚═╝     ╚═╝  ╚═╝╚═╝  ╚═╝╚═╝  ╚═══╝
`;

const TAGLINES = [
  'Software Developer',
  'Web Components Enthusiast',
  'Terminal Lover',
  'Open Source Contributor',
  'Creative Coder',
];

@customElement('sz-dashboard')
export class SzDashboard extends LitElement {
  private typewriter = new TypewriterController(this, { speed: 60 });

  static styles = css`
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
      outline: none;
    }
    .link-key {
      color: var(--sz-accent, #89b4fa);
      font-weight: 700;
      min-width: 16px;
      text-align: center;
    }
    .hint {
      margin-top: 32px;
      color: var(--sz-overlay0, #6c7086);
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
      .ascii { font-size: clamp(3px, 2vw, 6px); }
      .hint { display: none; }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.computeDashboardLinks();
    this.typewriter.cycle(TAGLINES, { pauseBetween: 3000, eraseSpeed: 30 });
  }

  private dashboardLinks: { label: string; key: string; href: string; icon: string }[] = [];

  private computeDashboardLinks() {
    this.dashboardLinks = registry.nav
      .filter(tab => tab.key && tab.name !== 'home')
      .map(tab => ({ label: tab.name, key: tab.key!, href: tab.path, icon: tab.icon || 'file' }));
  }

  render() {
    return html`
      <div class="ascii">${ASCII_ART}</div>
      <div class="tagline">
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
