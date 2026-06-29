import { LitElement, html, css, nothing } from 'lit';
import { customElement, state, query, property } from 'lit/decorators.js';
import { paletteRegistry, type PaletteSource, type PaletteItem } from '../../core/palette.js';
import { actions } from '../../core/actions.js';
import { NEOVIM_ACTION } from './actions.js';
import { isInputFocused } from '../../core/keyboard.js';
import { scrollbarStyles, focusRing, mobileQuery } from '../../core/styles.js';
import type { Shortcut } from '../../core/registry.js';
import { jsonArrayAttribute } from '../../core/data.js';

@customElement('sz-palette')
export class SzPalette extends LitElement {
  @state() private open = false;
  @state() private activeSource: PaletteSource | null = null;
  @state() private input = '';
  @state() private items: PaletteItem[] = [];
  @state() private selectedIndex = -1;
  @state() private helpOpen = false;

  @query('input') private inputEl!: HTMLInputElement;
  @query('.suggestions') private suggestionsEl!: HTMLElement;
  @query('.help-overlay') private helpEl!: HTMLElement;

  /** Keyboard-shortcut help rows, injected by the template (shortcuts='[...]'). */
  @property({ attribute: 'shortcuts', converter: jsonArrayAttribute }) shortcuts: Shortcut[] = [];

  private sources: PaletteSource[] = [];
  private unsubPaletteOpen?: () => void;
  private unsubPaletteHelp?: () => void;

  static styles = [scrollbarStyles, focusRing, css`
    :host { display: contents; }
    .overlay {
      position: absolute;
      bottom: 24px; left: 0; right: 0;
      z-index: 20;
    }
    .command-line {
      display: flex;
      align-items: center;
      background: var(--sz-command-bg, #313244);
      padding: 6px 12px;
      font-family: inherit;
      font-size: var(--sz-font-size, 13px);
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
      font-size: var(--sz-font-size, 13px);
      outline: none;
    }
    /* The command/search input never shows the shared focus ring. */
    input:focus-visible { outline: none; }
    .ghost {
      color: var(--sz-overlay0, #6c7086);
      pointer-events: none;
    }
    .match-count {
      color: var(--sz-overlay1, #7f849c);
      white-space: nowrap;
      margin-left: 8px;
    }
    .suggestions {
      max-height: 200px;
      overflow-y: auto;
      background: var(--sz-command-bg, #313244);
      border-top: 1px solid var(--sz-surface1, #45475a);
      scroll-behavior: smooth;
    }
    .suggestion {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 4px 12px;
      cursor: pointer;
    }
    .suggestion:hover, .suggestion.selected {
      background: var(--sz-surface1, #45475a);
    }
    .suggestion-name {
      color: var(--sz-command-highlight, #89b4fa);
    }
    .suggestion-args {
      color: var(--sz-overlay0, #6c7086);
      margin-left: 6px;
    }
    .suggestion-desc {
      color: var(--sz-overlay1, #7f849c);
    }
    .suggestion-path {
      color: var(--sz-overlay0, #6c7086);
      margin-left: 6px;
    }
    .suggestion-context {
      color: var(--sz-overlay1, #7f849c);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 300px;
    }

    /* Help man page */
    .help-overlay {
      position: absolute;
      bottom: 24px; left: 0; right: 0; top: 0;
      z-index: 20;
      overflow-y: auto;
      background: var(--sz-command-bg, #313244);
      border-top: 1px solid var(--sz-surface1, #45475a);
      padding: 16px 20px;
      font-size: var(--sz-font-size, 13px);
      color: var(--sz-text, #cdd6f4);
      line-height: 1.6;
    }
    .help-header {
      color: var(--sz-accent, #89b4fa);
      font-weight: 700;
      margin-bottom: 12px;
    }
    .help-section { margin-bottom: 16px; }
    .help-section-title {
      color: var(--sz-green, #a6e3a1);
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 6px;
      border-bottom: 1px solid var(--sz-surface1, #45475a);
      padding-bottom: 4px;
    }
    .help-row { display: flex; padding: 2px 0; }
    .help-cmd {
      color: var(--sz-command-highlight, #89b4fa);
      min-width: 180px;
      flex-shrink: 0;
    }
    .help-cmd-args { color: var(--sz-mauve, #cba6f7); }
    .help-desc { color: var(--sz-subtext, #a6adc8); }
    .help-keys { min-width: 140px; flex-shrink: 0; }
    .help-keys kbd {
      display: inline-block;
      padding: 1px 5px;
      background: var(--sz-surface0, #313244);
      border: 1px solid var(--sz-surface1, #45475a);
      border-radius: 3px;
      color: var(--sz-yellow, #f9e2af);
      font-family: inherit;
    }
    .help-footer {
      color: var(--sz-overlay0, #6c7086);
      margin-top: 8px;
      border-top: 1px solid var(--sz-surface1, #45475a);
      padding-top: 8px;
    }
  `];

  connectedCallback() {
    super.connectedCallback();
    this.sources = paletteRegistry.getAll();
    document.addEventListener('keydown', this.handleGlobalKey);
    window.addEventListener('keydown', this.handleCaptureTab, true);
    this.unsubPaletteOpen = actions.on(NEOVIM_ACTION.PALETTE_OPEN, (a) => {
      const prefix = (a.payload as { prefix?: string })?.prefix;
      if (prefix) {
        const source = paletteRegistry.getByPrefix(prefix);
        if (source) this.openWithSource(source);
      }
    });
    this.unsubPaletteHelp = actions.on(NEOVIM_ACTION.PALETTE_HELP, () => {
      // Dispatched from within the command's execute(), which is immediately
      // followed by hide() (resetting helpOpen). Defer so we win the race.
      queueMicrotask(() => this.showHelp());
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    document.removeEventListener('keydown', this.handleGlobalKey);
    window.removeEventListener('keydown', this.handleCaptureTab, true);
    document.removeEventListener('click', this.handleOutsideClick, true);
    this.unsubPaletteOpen?.();
    this.unsubPaletteHelp?.();
  }

  private handleCaptureTab = (e: KeyboardEvent) => {
    if (this.open && e.key === 'Tab') {
      e.preventDefault();
      e.stopImmediatePropagation();
      if (!this.isCommandInputFocused()) {
        this.inputEl?.focus();
      }
      this.handleTabInPalette(e.shiftKey);
    }
  };

  private isCommandInputFocused(): boolean {
    let el: Element | null = document.activeElement;
    while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
    return el === this.inputEl;
  }

  private handleTabInPalette(shiftKey: boolean) {
    const count = this.items.length;
    if (count === 1) {
      this.selectedIndex = 0;
      const selected = this.items[0];
      const confirmed = this.confirmedTokens;
      // If we're in sub-command mode and the item has no further args, execute
      if (confirmed.length > 0 && (!selected.args || selected.args.length === 0)) {
        this.runCommandByLabel(confirmed[0], [...confirmed.slice(1), selected.label]);
        return;
      }
      this.confirmSelection();
    } else if (count > 1) {
      this.cycleSelection(shiftKey ? -1 : 1);
    }
  }

  private handleGlobalKey = (e: KeyboardEvent) => {
    if (this.helpOpen) {
      if (e.key === 'Escape') { e.preventDefault(); this.helpOpen = false; return; }
      if (e.key === 'ArrowDown' || e.key === 'j') { e.preventDefault(); this.helpEl?.scrollBy({ top: 40, behavior: 'smooth' }); return; }
      if (e.key === 'ArrowUp' || e.key === 'k') { e.preventDefault(); this.helpEl?.scrollBy({ top: -40, behavior: 'smooth' }); return; }
      if (e.key === 'PageDown' || e.key === ' ') { e.preventDefault(); this.helpEl?.scrollBy({ top: 200, behavior: 'smooth' }); return; }
      if (e.key === 'PageUp') { e.preventDefault(); this.helpEl?.scrollBy({ top: -200, behavior: 'smooth' }); return; }
      return;
    }

    if (this.open) {
      if (e.key === 'Escape') { e.preventDefault(); this.hide(); return; }
      // Refocus input if prefix key pressed again while open
      if (this.activeSource && e.key === this.activeSource.prefix) {
        e.preventDefault();
        this.inputEl?.focus();
        return;
      }
      if (e.key === 'Tab') return; // handled by capture
    }

    if (isInputFocused()) return;
    if (mobileQuery.matches) return;

    // Open palette for matching prefix key
    if (!this.open) {
      // Refresh sources in case new ones were registered since connectedCallback
      this.sources = paletteRegistry.getAll();

      for (const source of this.sources) {
        if (e.key === source.prefix) {
          e.preventDefault();
          this.openWithSource(source);
          return;
        }
      }

      // Help overlay — special case if no source registered with '?'
      const helpSource = paletteRegistry.getByPrefix('?');
      if (!helpSource && e.key === '?') {
        e.preventDefault();
        this.showHelp();
        return;
      }
    }
  };

  private openWithSource(source: PaletteSource) {
    // Toggle if same source already open
    if (this.open && this.activeSource?.id === source.id) {
      this.hide();
      return;
    }
    this.open = true;
    this.activeSource = source;
    this.helpOpen = false;
    this.input = '';
    this.selectedIndex = -1;
    this.items = [];
    this.loadItems('');
    this.updateComplete.then(() => this.inputEl?.focus());
    document.addEventListener('click', this.handleOutsideClick, true);
  }

  private hide() {
    this.open = false;
    this.input = '';
    this.helpOpen = false;
    this.selectedIndex = -1;
    this.items = [];
    this.activeSource = null;
    document.removeEventListener('click', this.handleOutsideClick, true);
  }

  private handleOutsideClick = (e: MouseEvent) => {
    if (!this.open) return;
    const path = e.composedPath();
    // Stay open if click is inside the palette shadow DOM
    if (path.includes(this.shadowRoot as unknown as EventTarget)) return;
    this.hide();
  };

  private showHelp() {
    this.helpOpen = true;
    this.open = false;
  }

  private async loadItems(query: string) {
    if (!this.activeSource) { this.items = []; return; }

    // Check if we have a confirmed command with args to drill into
    const tokens = query.split(/\s+/).filter(Boolean);
    const hasTrailingSpace = query.endsWith(' ');

    if (tokens.length >= 1 && (tokens.length > 1 || hasTrailingSpace)) {
      // First token is potentially a confirmed command — check if it has args
      const allItems = this.activeSource.getItems('');
      const baseItems = allItems instanceof Promise ? await allItems : allItems;
      const matchedCommand = baseItems.find(
        item => item.label.toLowerCase() === tokens[0].toLowerCase()
      );

      if (matchedCommand?.args && matchedCommand.args.length > 0) {
        // Resolve nested arg values through confirmed tokens
        let currentArgs = matchedCommand.args;
        const confirmedArgTokens = hasTrailingSpace ? tokens.slice(1) : tokens.slice(1, -1);

        for (const tok of confirmedArgTokens) {
          const matched = currentArgs.find(a => a.name.toLowerCase() === tok.toLowerCase());
          if (matched?.values && matched.values.length > 0) {
            currentArgs = matched.values.map(v => ({ name: v }));
          } else {
            currentArgs = [];
            break;
          }
        }

        // Filter by the current fragment (incomplete last token)
        const fragment = hasTrailingSpace ? '' : (tokens[tokens.length - 1] || '');
        const argItems: PaletteItem[] = currentArgs
          .filter(a => !fragment || a.name.toLowerCase().includes(fragment.toLowerCase()))
          .map(a => ({
            id: `${matchedCommand.id}-${a.name}`,
            label: a.name,
            description: matchedCommand.description,
            // Preserve nested values so intermediate args (e.g. `shader`) are
            // drilled into rather than executed prematurely.
            args: a.values && a.values.length > 0 ? a.values.map(v => ({ name: v })) : undefined,
          }));

        this.items = argItems;
        this.selectedIndex = argItems.length > 0 ? 0 : -1;
        return;
      }
    }

    // Default: filter top-level items
    const topQuery = tokens.length > 0 && !hasTrailingSpace ? tokens[0] : query;
    const result = this.activeSource.getItems(topQuery);
    if (result instanceof Promise) {
      this.items = await result;
    } else {
      this.items = result;
    }
    this.selectedIndex = this.items.length > 0 ? 0 : -1;
  }

  // --- Input parsing ---

  /** Split input into confirmed tokens and the in-progress fragment. */
  private parseTokens(input: string) {
    const hasTrailingSpace = input.endsWith(' ');
    const tokens = input.split(/\s+/).filter(Boolean);
    return {
      tokens,
      hasTrailingSpace,
      fragment: hasTrailingSpace ? '' : (tokens[tokens.length - 1] ?? ''),
      confirmed: hasTrailingSpace ? tokens : tokens.slice(0, -1),
    };
  }

  private get currentFragment(): string {
    return this.parseTokens(this.input).fragment;
  }

  private get confirmedTokens(): string[] {
    return this.parseTokens(this.input).confirmed;
  }

  private get ghostHint(): string {
    if (this.selectedIndex < 0 || this.selectedIndex >= this.items.length) return '';
    const selected = this.items[this.selectedIndex];
    const fragment = this.currentFragment;
    if (fragment && selected.label.toLowerCase().startsWith(fragment.toLowerCase())) {
      return selected.label.slice(fragment.length);
    }
    return '';
  }

  // --- Interaction ---

  private handleInput(e: InputEvent) {
    this.input = (e.target as HTMLInputElement).value;
    this.loadItems(this.input);
  }

  private scrollToSelected() {
    this.updateComplete.then(() => {
      const el = this.suggestionsEl?.querySelector('.selected') as HTMLElement;
      el?.scrollIntoView({ block: 'nearest' });
    });
  }

  private cycleSelection(delta: number) {
    const len = this.items.length;
    if (len === 0) return;
    if (this.selectedIndex < 0) {
      this.selectedIndex = delta > 0 ? 0 : len - 1;
    } else {
      this.selectedIndex = ((this.selectedIndex + delta) % len + len) % len;
    }
    this.scrollToSelected();
  }

  // Returns true if the item was autocompleted (has args), false if should execute
  private confirmSelection(): boolean {
    if (this.selectedIndex < 0 || this.selectedIndex >= this.items.length) return false;

    const selected = this.items[this.selectedIndex];
    const confirmed = this.confirmedTokens;

    if (confirmed.length === 0) {
      // First token: autocomplete to item label
      if (selected.args && selected.args.length > 0) {
        // Has args — autocomplete with trailing space
        this.input = selected.label + ' ';
        this.selectedIndex = -1;
        this.loadItems(this.input);
        this.syncInputEl();
        return true;
      }
      // No args — execute immediately
      return false;
    }

    // Arg completion: append to existing input
    this.input = [...confirmed, selected.label].join(' ') + ' ';
    this.selectedIndex = -1;
    this.loadItems(this.input);
    this.syncInputEl();
    return true;
  }

  private syncInputEl() {
    this.updateComplete.then(() => {
      if (this.inputEl) {
        this.inputEl.value = this.input;
        this.inputEl.setSelectionRange(this.input.length, this.input.length);
      }
    });
  }

  /** Look up a base command of the active source by its label. */
  private async findCommand(label: string): Promise<PaletteItem | undefined> {
    if (!this.activeSource) return undefined;
    const all = this.activeSource.getItems('');
    const base = all instanceof Promise ? await all : all;
    return base.find(i => i.label.toLowerCase() === label.toLowerCase());
  }

  /** Execute a resolved item with args, then close the palette. */
  private runCommand(item: PaletteItem, args: string[]) {
    this.activeSource?.execute(item, args.length > 0 ? args : undefined);
    this.hide();
  }

  /** Resolve a command by label and execute it with args (sub-command mode). */
  private async runCommandByLabel(label: string, args: string[]) {
    const cmd = await this.findCommand(label);
    if (cmd) this.runCommand(cmd, args);
    else this.hide();
  }

  private handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') { this.hide(); return; }
    if (e.key === 'Backspace' && this.input === '') { this.hide(); return; }

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      this.cycleSelection(1);
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      this.cycleSelection(-1);
      return;
    }

    if (e.key === 'Enter') {
      e.preventDefault();

      if (this.selectedIndex >= 0 && this.items.length > 0) {
        const selected = this.items[this.selectedIndex];
        // If the selected item has further args/values, drill into them instead
        // of executing — works at any depth (`set` → `shader` → `off`).
        if (selected.args && selected.args.length > 0) {
          this.confirmSelection();
          return;
        }

        // If we're in sub-command mode (confirmed tokens exist), execute the parent command
        const confirmed = this.confirmedTokens;
        if (confirmed.length > 0) {
          this.runCommandByLabel(confirmed[0], [...confirmed.slice(1), selected.label]);
          return;
        }

        // Execute the selected item
        this.runCommand(selected, []);
        return;
      }

      const trimmed = this.input.trim();
      if (!trimmed) { this.hide(); return; }

      // Try to find an exact match by label
      const tokens = trimmed.split(/\s+/);
      const exact = this.items.find(item => item.label.toLowerCase() === tokens[0].toLowerCase());
      if (exact) {
        this.runCommand(exact, tokens.slice(1));
        return;
      }

      // Also check against all source items for sub-command execution
      this.runCommandByLabel(tokens[0], tokens.slice(1));
    }
  }

  private clickSuggestion(index: number) {
    this.selectedIndex = index;
    const selected = this.items[index];
    const confirmed = this.confirmedTokens;

    if (selected.args && selected.args.length > 0) {
      this.confirmSelection();
    } else if (confirmed.length > 0) {
      // Sub-command mode — execute parent command with args
      this.runCommandByLabel(confirmed[0], [...confirmed.slice(1), selected.label]);
    } else {
      this.runCommand(selected, []);
    }
    this.inputEl?.focus();
  }

  // --- Help rendering ---

  private renderHelp() {
    const allSources = paletteRegistry.getAll();

    return html`
      <div class="help-overlay">
        <div class="help-header">STEPHAN.ZYCH(1) — User Commands Manual</div>
        ${allSources.map(source => {
          const sourceItems = source.getItems('');
          const isPromise = sourceItems instanceof Promise;
          return html`
            <div class="help-section">
              <div class="help-section-title">${source.id} (${source.prefix})</div>
              ${!isPromise ? (sourceItems as PaletteItem[]).map(item => html`
                <div class="help-row">
                  <span class="help-cmd">
                    ${source.prefix}${item.label}${item.args && item.args.length > 0
                      ? html` <span class="help-cmd-args">[${item.args.map(a => a.name).join('|')}]</span>`
                      : ''}
                  </span>
                  <span class="help-desc">${item.description ?? ''}</span>
                </div>
              `) : html`<div class="help-row"><span class="help-desc">(dynamic source)</span></div>`}
            </div>
          `;
        })}
        <div class="help-section">
          <div class="help-section-title">keyboard shortcuts</div>
          ${this.shortcuts.map(s => html`
            <div class="help-row">
              <span class="help-keys"><kbd>${s.keys}</kbd></span>
              <span class="help-desc">${s.description}</span>
            </div>
          `)}
        </div>
        <div class="help-footer">
          Press <kbd>Esc</kbd> to close ·
          ${allSources.map(s => html`<kbd>${s.prefix}</kbd> ${s.id} · `)}
          <kbd>?</kbd> help
        </div>
      </div>
    `;
  }

  render() {
    if (this.helpOpen) return this.renderHelp();
    if (!this.open || !this.activeSource) return nothing;

    const ghost = this.ghostHint;

    return html`
      <div class="overlay">
        ${this.items.length > 0 ? html`
          <div class="suggestions" role="listbox" id="sz-palette-listbox" aria-label="Suggestions">
            ${this.items.map((item, i) => html`
              <div
                class="suggestion ${i === this.selectedIndex ? 'selected' : ''}"
                role="option"
                id="sz-palette-opt-${i}"
                aria-selected=${i === this.selectedIndex}
                @click=${() => this.clickSuggestion(i)}
              >
                <span>
                  <span class="suggestion-name">${item.label}</span>
                  ${item.args && item.args.length > 0
                    ? html`<span class="suggestion-args">[${item.args.map(a => a.name).join(', ')}]</span>`
                    : ''}
                </span>
                ${item.description ? html`<span class="suggestion-desc">${item.description}</span>` : ''}
              </div>
            `)}
          </div>
        ` : ''}
        <div class="command-line">
          <span class="prefix">${this.activeSource.prefix}</span>
          <input
            type="text"
            role="combobox"
            aria-label="Command palette"
            aria-expanded=${this.items.length > 0}
            aria-controls="sz-palette-listbox"
            aria-autocomplete="list"
            aria-activedescendant=${this.items.length > 0 ? `sz-palette-opt-${this.selectedIndex}` : nothing}
            .value=${this.input}
            @input=${this.handleInput}
            @keydown=${this.handleKeydown}
            spellcheck="false"
            autocomplete="off"
            placeholder="${this.items.length > 0 ? 'Tab to cycle · Enter to confirm' : this.activeSource.placeholder}"
          />
          ${ghost ? html`<span class="ghost">${ghost}</span>` : ''}
        </div>
      </div>
    `;
  }
}
