import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';

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

const LINKS = [
  { label: '  Find project', key: 'p', href: '/projects/' },
  { label: '  Read blog', key: 'b', href: '/blog/' },
  { label: '  About me', key: 'a', href: '/about/' },
  { label: '  Get in touch', key: 'c', href: '/contact/' },
];

@customElement('sz-dashboard')
export class SzDashboard extends LitElement {
  @state() private taglineIndex = 0;
  @state() private displayText = '';

  private typingTimer?: number;
  private cycleTimer?: number;

  static styles = css`
    :host {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      min-height: 100%;
      padding: 40px 20px;
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
      font-size: 16px;
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
      font-size: 14px;
    }
    .link:hover {
      background: var(--sz-surface0, #313244);
      text-decoration: none;
    }
    .link-key {
      color: var(--sz-accent, #89b4fa);
      font-weight: 700;
    }

    @media (max-width: 768px) {
      .ascii { font-size: clamp(3px, 2vw, 6px); }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
    this.startTyping();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.typingTimer) clearTimeout(this.typingTimer);
    if (this.cycleTimer) clearTimeout(this.cycleTimer);
  }

  private startTyping() {
    const text = TAGLINES[this.taglineIndex];
    let i = 0;
    this.displayText = '';

    const type = () => {
      if (i < text.length) {
        this.displayText = text.slice(0, i + 1);
        i++;
        this.typingTimer = window.setTimeout(type, 60 + Math.random() * 40);
      } else {
        this.cycleTimer = window.setTimeout(() => this.startErasing(), 3000);
      }
    };
    type();
  }

  private startErasing() {
    const text = this.displayText;
    let i = text.length;

    const erase = () => {
      if (i > 0) {
        i--;
        this.displayText = text.slice(0, i);
        this.typingTimer = window.setTimeout(erase, 30);
      } else {
        this.taglineIndex = (this.taglineIndex + 1) % TAGLINES.length;
        this.typingTimer = window.setTimeout(() => this.startTyping(), 500);
      }
    };
    erase();
  }

  render() {
    return html`
      <div class="ascii">${ASCII_ART}</div>
      <div class="tagline">
        ${this.displayText}<span class="cursor"></span>
      </div>
      <div class="links">
        ${LINKS.map(link => html`
          <a class="link" href="${link.href}">
            <span class="link-key">${link.key}</span>
            ${link.label}
          </a>
        `)}
      </div>
    `;
  }
}
