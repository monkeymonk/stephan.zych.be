import { LitElement, html, css, nothing } from 'lit';
import { customElement, state, query, property } from 'lit/decorators.js';
import { paletteRegistry, type PaletteSource, type PaletteItem } from '../../core/palette.js';
import { actions } from '../../core/actions.js';
import { NEOVIM_ACTION } from './actions.js';
import { deepActiveElement } from '../../core/keyboard.js';
import { KeymapController } from '../../core/keymap-controller.js';
import type { KeyBinding } from '../../core/keymap.js';
import { OverlayController } from '../../core/overlay-controller.js';
import type { CloseReason } from '../../core/overlays.js';
import { scrollbarStyles, focusRing, mobileQuery, reducedMotion } from '../../core/styles.js';
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

  private unsubPaletteOpen?: () => void;
  private unsubPaletteHelp?: () => void;

  private overlayCtrl = new OverlayController(this, {
    id: 'palette',
    kind: 'modal',
    onClose: (reason) => this.closePalette(reason),
  });

  /**
   * The man page is a modal in its own right, not a mode of the palette: `?`
   * over an open palette displaces it, and Escape then closes exactly the one
   * surface on screen. `reflect: false` because both controllers share this
   * host element, and a second one writing `[open]` would fight the first over
   * an attribute that means "the palette is open".
   */
  private helpOverlayCtrl = new OverlayController(this, {
    id: 'palette-help',
    kind: 'modal',
    reflect: false,
    onClose: (reason) => this.closeHelp(reason),
  });

  private keysCtrl = new KeymapController(this, [
    this.prefixBinding('palette.command', ':', 'Open command palette'),
    this.prefixBinding('palette.search', '/', 'Search pages and content'),
    {
      id: 'palette.help',
      keys: ['?'],
      scope: 'global',
      chars: false,
      description: 'Show help',
      when: () => !mobileQuery.matches,
      run: () => {
        // A source is free to claim `?` as its own prefix; the man page is
        // only the fallback for when none has.
        const source = paletteRegistry.getByPrefix('?');
        if (source) this.openWithSource(source);
        else this.showHelp();
        return true;
      },
    },
    {
      id: 'help.close',
      keys: ['q'],
      scope: 'overlay:palette-help',
      chars: false,
      run: () => { this.hideHelp(); return true; },
    },
    { id: 'help.scroll.down', keys: ['j'], scope: 'overlay:palette-help', chars: false, run: () => this.scrollHelp(40) },
    { id: 'help.scroll.down', keys: ['ArrowDown'], scope: 'overlay:palette-help', chars: false, run: () => this.scrollHelp(40) },
    { id: 'help.scroll.up', keys: ['k'], scope: 'overlay:palette-help', chars: false, run: () => this.scrollHelp(-40) },
    { id: 'help.scroll.up', keys: ['ArrowUp'], scope: 'overlay:palette-help', chars: false, run: () => this.scrollHelp(-40) },
    { id: 'help.page.down', keys: ['PageDown'], scope: 'overlay:palette-help', chars: false, run: () => this.scrollHelp(200) },
    { id: 'help.page.down', keys: [' '], scope: 'overlay:palette-help', chars: false, run: () => this.scrollHelp(200) },
    { id: 'help.page.up', keys: ['PageUp'], scope: 'overlay:palette-help', chars: false, run: () => this.scrollHelp(-200) },
  ]);

  // `palette.refocus` answers whichever prefix opened the palette, so the set
  // is rebuilt on every open instead of declared once.
  private paletteKeysCtrl = new KeymapController(this, []);

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
      color: var(--sz-muted, #989caf);
      pointer-events: none;
    }
    .match-count {
      color: var(--sz-muted, #989caf);
      white-space: nowrap;
      margin-left: 8px;
    }
    .suggestions {
      max-height: 200px;
      overflow-y: auto;
      background: var(--sz-command-bg, #313244);
      border-top: 1px solid var(--sz-surface1, #45475a);
    }
    /* Opt-in rather than a reduced-motion override: base.css's global
       scroll-behavior: auto !important cannot cross this shadow boundary. */
    @media (prefers-reduced-motion: no-preference) {
      .suggestions { scroll-behavior: smooth; }
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
      color: var(--sz-muted, #989caf);
      margin-left: 6px;
    }
    .suggestion-desc {
      color: var(--sz-muted, #989caf);
    }
    .suggestion-path {
      color: var(--sz-muted, #989caf);
      margin-left: 6px;
    }
    .suggestion-context {
      color: var(--sz-muted, #989caf);
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      max-width: 300px;
    }
    /* --sz-surface1 is the lightest surface in every theme, and nothing below
       --sz-subtext1 clears 4.5:1 on it — the accent name lands at 4.32:1 and
       --sz-muted at 3.35:1. So the selected row promotes its whole text ramp
       one step instead of inheriting the resting colours; reading stronger is
       what a selected row should do anyway. */
    .suggestion:hover .suggestion-name,
    .suggestion.selected .suggestion-name {
      color: var(--sz-text, #cdd6f4);
      font-weight: 700;
    }
    .suggestion:hover :is(.suggestion-args, .suggestion-desc, .suggestion-path, .suggestion-context),
    .suggestion.selected :is(.suggestion-args, .suggestion-desc, .suggestion-path, .suggestion-context) {
      color: var(--sz-subtext1, #bac2de);
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
    /* The pane takes focus on open, and it is pinned to the viewport edges —
       the shared ring's +2px offset would draw outside the clip on three
       sides, leaving a focused dialog with no visible indicator. Inside. */
    .help-overlay:focus-visible { outline-offset: -2px; }
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
      color: var(--sz-muted, #989caf);
      margin-top: 8px;
      border-top: 1px solid var(--sz-surface1, #45475a);
      padding-top: 8px;
    }

    @media (max-width: 768px) {
      /* sz-neovim is no longer a viewport-sized positioned box on mobile — it
         is as tall as the whole article — so position absolute would park
         these at the bottom of the *document*, permanently off-screen. Pin
         them just above the fixed statusbar/tmux bar instead. */
      .overlay,
      .help-overlay {
        position: fixed;
        bottom: var(--sz-mobile-chrome-bottom);
      }
      .help-overlay {
        /* Clear the fixed titlebar at the other end. */
        top: var(--sz-mobile-chrome-top);
      }

      /* One row per suggestion, name over description. The desktop row is two
         columns pushed apart with space-between, which at phone width squeezes
         both into unreadable slivers and ragged-right wraps the description
         against the label. */
      .suggestion {
        flex-direction: column;
        align-items: stretch;
        gap: 1px;
        /* Also the touch target: a bare text row is ~21px, under the 24px
           WCAG 2.5.8 minimum. These only became reachable on a phone when the
           palette stopped being desktop-only. */
        padding: 8px 12px;
      }
      .suggestion-desc {
        font-size: calc(var(--sz-font-size, 13px) * 0.85);
        line-height: 1.4;
      }
      /* Stacked rows are twice as tall, so the desktop 200px cap would show
         barely three of them. */
      .suggestions {
        max-height: 45dvh;
      }
    }
  `];

  connectedCallback() {
    super.connectedCallback();
    window.addEventListener('keydown', this.handleCaptureTab, true);
    this.unsubPaletteOpen = actions.on(NEOVIM_ACTION.PALETTE_OPEN, (a) => {
      // The bus hands every payload over as `unknown`; PALETTE_OPEN's shape is
      // this feature's own contract with the mobile search button.
      const payload = a.payload as { prefix?: string } | undefined;
      const prefix = payload?.prefix;
      if (prefix) {
        const source = paletteRegistry.getByPrefix(prefix);
        if (source) this.openWithSource(source);
      }
    });
    this.unsubPaletteHelp = actions.on(NEOVIM_ACTION.PALETTE_HELP, () => {
      // Dispatched from within the command's execute(), which is immediately
      // followed by hide() (releasing the palette). Defer so we win the race.
      queueMicrotask(() => this.showHelp());
    });
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    window.removeEventListener('keydown', this.handleCaptureTab, true);
    document.removeEventListener('click', this.handleOutsideClick, true);
    this.unsubPaletteOpen?.();
    this.unsubPaletteHelp?.();
  }

  // `[open]` is written by the overlay controller from the registry, which is
  // now the only thing that knows whether this surface owns the keyboard.
  // `[help-open]` is still written here: the man page's own controller cannot
  // reflect it without clobbering `[open]` on the shared host.
  protected updated(changed: Map<PropertyKey, unknown>) {
    this.toggleAttribute('help-open', this.helpOpen);
    // The man page declares aria-modal, which tells assistive tech to hide the
    // rest of the document — so focus has to actually land in here, or the AT
    // user gets an unreachable dialog behind a hidden page. It never moved
    // focus before it had dialog semantics, and it could not be given them
    // before it did. The pane itself is the target: it is the scroller the
    // `overlay:palette-help` bindings drive, and a focused div is not a text
    // field, so the keymap does not suppress them.
    if (changed.has('helpOpen') && this.helpOpen) this.helpEl?.focus();
  }

  // The aria-modal Tab contract for both surfaces on this host: capture phase
  // on purpose, so Tab never reaches the document hidden behind the dialog.
  // Extended rather than doubled: this is already the last of the four global
  // listener sites `check-structure.mjs` sanctions, and a fifth fails the build.
  private handleCaptureTab = (e: KeyboardEvent) => {
    if (e.key !== 'Tab') return;
    if (this.helpOpen) {
      // The pane is the man page's only focusable, so there is nothing to
      // cycle to and the whole trap is refusing to leave. Refocus rather than
      // merely preventDefault: a click on the page behind can still have moved
      // focus out from under us, and Tab is where that becomes visible.
      e.preventDefault();
      e.stopImmediatePropagation();
      this.helpEl?.focus();
      return;
    }
    if (!this.open) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (!this.isCommandInputFocused()) {
      this.inputEl?.focus();
    }
    this.handleTabInPalette(e.shiftKey);
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

  /**
   * The prefixes are `global` so they fire over another overlay — claiming the
   * slot is how `:` displaces the link picker. Nothing here has to stand down
   * while the palette itself owns the keyboard: the keymap walks scope tiers
   * narrowest-first, so `palette.refocus` at `overlay:palette` outranks these.
   *
   * The only guard left is the one the hand-rolled listener already had: on a
   * phone the palette is opened by the search button, never by a keystroke.
   */
  private prefixBinding(id: string, prefix: string, description: string): KeyBinding {
    return {
      id,
      keys: [prefix],
      scope: 'global',
      chars: false,
      description,
      when: () => !mobileQuery.matches,
      run: () => {
        // Sources are registered by wiring, which can finish after this element
        // connects, so the lookup happens per keystroke rather than once.
        const source = paletteRegistry.getByPrefix(prefix);
        if (!source) return false;
        this.openWithSource(source);
        return true;
      },
    };
  }

  private scrollHelp(top: number): boolean {
    // base.css's reduced-motion scroll override cannot reach this shadow
    // root, so the behaviour has to be decided here.
    const behavior: ScrollBehavior = reducedMotion.matches ? 'auto' : 'smooth';
    this.helpEl?.scrollBy({ top, behavior });
    return true;
  }

  private openWithSource(source: PaletteSource) {
    // Toggle if same source already open
    if (this.overlayCtrl.isOpen && this.activeSource?.id === source.id) {
      this.hide();
      return;
    }
    this.rememberInvoker();
    this.open = true;
    this.activeSource = source;
    this.input = '';
    this.selectedIndex = -1;
    this.items = [];
    this.loadItems('');
    this.updateComplete.then(() => this.inputEl?.focus());
    document.addEventListener('click', this.handleOutsideClick, true);
    this.paletteKeysCtrl.setBindings([{
      id: 'palette.refocus',
      keys: [source.prefix],
      scope: 'overlay:palette',
      chars: false,
      run: () => {
        this.inputEl?.focus();
        return true;
      },
    }]);
    // Claim last: claiming closes the incumbent modal, and this surface has to
    // be the one that is ready when that teardown runs.
    this.overlayCtrl.claim();
  }

  /**
   * The palette steals focus into its own input, so closing it has to put
   * focus back where it came from — otherwise focus falls to <body> and the
   * user restarts the Tab order from the top of the page.
   */
  private invoker: HTMLElement | null = null;

  private rememberInvoker() {
    if (this.open || this.helpOpen) return; // already ours; keep the original
    const active = deepActiveElement();
    this.invoker = active instanceof HTMLElement && !this.shadowRoot?.contains(active)
      ? active
      : null;
  }

  private restoreInvokerFocus() {
    const target = this.invoker;
    this.invoker = null;
    if (target?.isConnected) target.focus();
  }

  private hide() {
    // The registry does the closing, so there is one path out of this surface
    // whatever triggered it: releasing reports `'user'`, which lands in
    // closePalette below. A release from an already-superseded palette is
    // inert, so an execute() that opened another modal cannot close this one
    // twice and steal focus back out of the surface it just opened.
    this.overlayCtrl.release();
  }

  private closePalette(reason: CloseReason) {
    this.open = false;
    this.input = '';
    this.selectedIndex = -1;
    this.items = [];
    this.activeSource = null;
    this.paletteKeysCtrl.setBindings([]);
    document.removeEventListener('click', this.handleOutsideClick, true);
    // A superseded palette must not restore focus: the surface that displaced
    // it already holds focus, and pulling it back would yank the user out of
    // what they just opened.
    if (reason === 'user') this.restoreInvokerFocus();
  }

  // A control that toggles the palette marks itself `data-palette-toggle`. It
  // has to be excluded here or it can never close anything: this listener is on
  // document in the CAPTURE phase, so on a click it runs BEFORE the button's own
  // handler — hide() fires first, then the button re-opens a palette it believes
  // was shut. The result is a toggle that only ever opens.
  private handleOutsideClick = (e: MouseEvent) => {
    if (!this.open) return;
    const path = e.composedPath();
    // Stay open if click is inside the palette shadow DOM
    if (path.includes(this.shadowRoot as unknown as EventTarget)) return;
    if (path.some(t => t instanceof HTMLElement && t.hasAttribute('data-palette-toggle'))) return;
    this.hide();
  };

  private showHelp() {
    this.rememberInvoker();
    this.helpOpen = true;
    // Claiming supersedes the palette, which is what clears `open` and the
    // command line behind the man page.
    this.helpOverlayCtrl.claim();
  }

  private hideHelp() {
    this.helpOverlayCtrl.release();
  }

  private closeHelp(reason: CloseReason) {
    this.helpOpen = false;
    if (reason === 'user') this.restoreInvokerFocus();
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
    // No Escape here: `overlay.escape` closes the current modal centrally.
    // This handler used to call hide() without preventDefault, so the key went
    // on to focus-nav and backed out of the article as well.
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

    // tabindex="-1" so the scroller can be focused programmatically without
    // joining the Tab order; see updated() for why it has to be. The name
    // comes from the visible man-page title rather than a second copy of it.
    return html`
      <div
        class="help-overlay"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sz-palette-help-title"
        tabindex="-1"
      >
        <div class="help-header" id="sz-palette-help-title">STEPHAN.ZYCH(1) — User Commands Manual</div>
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

    // One surface, two identities: the command palette at `:` and search at
    // `/`. A hardcoded name would announce the wrong one half the time, so it
    // comes off the active source — whose id is already the vocabulary the man
    // page prints. The dialog wraps a combobox, which is the shape the ARIA
    // practices describe; the inner roles are untouched.
    return html`
      <div
        class="overlay"
        role="dialog"
        aria-modal="true"
        aria-label=${this.activeSource.title}
      >
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
            aria-label="Palette input"
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
