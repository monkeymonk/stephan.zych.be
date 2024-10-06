import { LitElement, html, css, nothing } from 'lit';
import { customElement, state, query } from 'lit/decorators.js';
import { appState } from '../shared/state.js';

interface Command {
  name: string;
  description: string;
  args?: string[];
  category: string;
}

const COMMANDS: Command[] = [
  { name: 'home', description: 'Go to home page', category: 'navigation' },
  { name: 'about', description: 'Go to about page', category: 'navigation' },
  { name: 'projects', description: 'Go to projects page', category: 'navigation' },
  { name: 'blog', description: 'Go to blog page', category: 'navigation' },
  { name: 'contact', description: 'Go to contact page', category: 'navigation' },
  { name: 'colorscheme', description: 'Switch color theme', args: ['catppuccin-mocha', 'gruvbox-dark', 'tokyonight'], category: 'theme' },
  { name: 'fullscreen', description: 'Enter fullscreen', category: 'window' },
  { name: 'windowed', description: 'Enter windowed mode', category: 'window' },
  { name: 'fullpage', description: 'Enter full-page mode', category: 'window' },
  { name: 'set', description: 'Set configuration', args: ['transparency', 'shader'], category: 'settings' },
  { name: 'help', description: 'Show commands', category: 'help' },
  { name: 'matrix', description: 'Enter the Matrix', category: 'easter-egg' },
  { name: 'sudo', description: 'Try root access', category: 'easter-egg' },
  { name: 'coffee', description: 'Brew coffee', category: 'easter-egg' },
  { name: '42', description: 'The answer', category: 'easter-egg' },
  { name: 'party', description: 'Celebrate!', category: 'easter-egg' },
];

const NAV_MAP: Record<string, string> = {
  home: '/', about: '/about/', projects: '/projects/',
  blog: '/blog/', contact: '/contact/',
};

@customElement('sz-command')
export class SzCommand extends LitElement {
  @state() private open = false;
  @state() private input = '';
  @state() private selectedIndex = 0;
  @state() private message = '';

  @query('input') private inputEl!: HTMLInputElement;

  static styles = css`
    :host {
      display: block;
    }
    .overlay {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      z-index: 20;
    }
    .command-line {
      display: flex;
      align-items: center;
      background: var(--sz-command-bg, #313244);
      padding: 6px 12px;
      font-family: inherit;
      font-size: 14px;
    }
    .prefix {
      color: var(--sz-command-highlight, #89b4fa);
      margin-right: 4px;
      font-weight: 700;
    }
    input {
      flex: 1;
      background: transparent;
      border: none;
      color: var(--sz-command-text, #cdd6f4);
      font-family: inherit;
      font-size: 14px;
      outline: none;
    }
    .message {
      color: var(--sz-yellow, #f9e2af);
      padding: 4px 12px;
      background: var(--sz-command-bg, #313244);
      font-size: 13px;
    }
    .suggestions {
      max-height: 200px;
      overflow-y: auto;
      background: var(--sz-command-bg, #313244);
      border-top: 1px solid var(--sz-surface1, #45475a);
    }
    .suggestion {
      display: flex;
      justify-content: space-between;
      padding: 4px 12px;
      cursor: pointer;
      font-size: 13px;
    }
    .suggestion:hover, .suggestion.selected {
      background: var(--sz-surface1, #45475a);
    }
    .suggestion-name {
      color: var(--sz-command-highlight, #89b4fa);
    }
    .suggestion-desc {
      color: var(--sz-overlay1, #7f849c);
      font-size: 12px;
    }
    .hidden { display: none; }
  `;

  connectedCallback() {
    super.connectedCallback();
    document.addEventListener('keydown', this.handleGlobalKey);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleGlobalKey);
  }

  private handleGlobalKey = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

    // Check mobile
    if (window.innerWidth <= 768) return;

    if (e.key === ':' && !this.open) {
      e.preventDefault();
      this.show();
    }
    if (e.key === '?' && !this.open) {
      e.preventDefault();
      this.executeCommand('help');
    }
  };

  private show() {
    this.open = true;
    this.input = '';
    this.selectedIndex = 0;
    this.message = '';
    this.updateComplete.then(() => this.inputEl?.focus());
  }

  private hide() {
    this.open = false;
    this.input = '';
    this.message = '';
  }

  private get filtered(): Command[] {
    if (!this.input) return COMMANDS;
    const q = this.input.toLowerCase();
    return COMMANDS.filter(c =>
      c.name.toLowerCase().includes(q) ||
      c.description.toLowerCase().includes(q)
    );
  }

  private handleInput(e: InputEvent) {
    this.input = (e.target as HTMLInputElement).value;
    this.selectedIndex = 0;
    this.message = '';
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      this.hide();
    } else if (e.key === 'Enter') {
      if (!this.input) {
        this.hide();
        return;
      }
      const parts = this.input.trim().split(/\s+/);
      this.executeCommand(parts[0], parts.slice(1));
    } else if (e.key === 'ArrowDown' || (e.key === 'Tab' && !e.shiftKey)) {
      e.preventDefault();
      this.selectedIndex = Math.min(this.selectedIndex + 1, this.filtered.length - 1);
    } else if (e.key === 'ArrowUp' || (e.key === 'Tab' && e.shiftKey)) {
      e.preventDefault();
      this.selectedIndex = Math.max(this.selectedIndex - 1, 0);
    }
  }

  private selectSuggestion(cmd: Command) {
    this.input = cmd.name;
    this.inputEl?.focus();
  }

  private executeCommand(name: string, args: string[] = []) {
    // Navigation
    if (name in NAV_MAP) {
      window.location.href = NAV_MAP[name];
      return;
    }

    // Theme
    if (name === 'colorscheme' && args[0]) {
      appState.set('theme', args[0]);
      document.documentElement.setAttribute('data-theme', args[0]);
      // Load theme CSS dynamically
      const link = document.querySelector('link[data-theme-css]') as HTMLLinkElement;
      if (link) link.href = `/assets/themes/${args[0]}.css`;
      this.message = `Theme: ${args[0]}`;
      setTimeout(() => this.hide(), 1000);
      return;
    }

    // Window
    if (name === 'fullscreen' || name === 'windowed' || name === 'fullpage') {
      const mode = name === 'fullpage' ? 'full-page' : name;
      const terminal = document.querySelector('sz-terminal') as any;
      if (name === 'fullscreen') {
        terminal?.toggleFullscreen();
      } else {
        appState.set('windowMode', mode as any);
      }
      this.hide();
      return;
    }

    // Settings
    if (name === 'set' && args.length >= 2) {
      if (args[0] === 'transparency') {
        const val = parseInt(args[1]);
        if (val >= 0 && val <= 100) {
          appState.set('transparency', val);
          this.message = `Transparency: ${val}%`;
          setTimeout(() => this.hide(), 1000);
          return;
        }
      }
      if (args[0] === 'shader') {
        if (['off', 'css', 'webgl'].includes(args[1])) {
          appState.set('shaderMode', args[1] as any);
          this.message = `Shader: ${args[1]}`;
          setTimeout(() => this.hide(), 1000);
          return;
        }
      }
    }

    // Help
    if (name === 'help') {
      this.message = 'Commands: ' + COMMANDS.map(c => c.name).join(', ');
      return;
    }

    // Easter eggs
    if (name === 'sudo') {
      this.message = 'Permission denied. This incident will be reported.';
      return;
    }
    if (name === '42') {
      this.message = 'The answer to life, the universe, and everything.';
      return;
    }
    if (name === 'coffee') {
      this.message = '☕ Brewing...';
      return;
    }

    this.message = `Unknown command: ${name}. Type :help`;
  }

  render() {
    if (!this.open) return nothing;
    const suggestions = this.filtered;

    return html`
      <div class="overlay">
        ${suggestions.length > 0 ? html`
          <div class="suggestions">
            ${suggestions.map((cmd, i) => html`
              <div
                class="suggestion ${i === this.selectedIndex ? 'selected' : ''}"
                @click=${() => this.selectSuggestion(cmd)}
              >
                <span class="suggestion-name">${cmd.name}</span>
                <span class="suggestion-desc">${cmd.description}</span>
              </div>
            `)}
          </div>
        ` : ''}
        ${this.message ? html`<div class="message">${this.message}</div>` : ''}
        <div class="command-line">
          <span class="prefix">:</span>
          <input
            type="text"
            .value=${this.input}
            @input=${this.handleInput}
            @keydown=${this.handleKeydown}
            spellcheck="false"
            autocomplete="off"
          />
        </div>
      </div>
    `;
  }
}
