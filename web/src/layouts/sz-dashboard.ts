import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { NavTab } from '../core/registry.js';
import { jsonArrayAttribute, jsonObjectAttribute } from '../core/data.js';
import { TypewriterController } from '../controllers/typewriter.js';
import { focusRing, reducedMotion } from '../core/styles.js';
import { BANNER_VARIANTS, STAGE_ROWS, STAGE_MIN_COLS, STAGE_MAX_COLS } from './banners/registry.js';
import type { Banner } from './banners/registry.js';

const BANNER_ROTATE_MS = 10_000;

function readBannerIndexFromLocation(): number | null {
  if (typeof window === 'undefined') return null;
  const param = new URLSearchParams(window.location.search).get('banner');
  if (param === null) return null;
  const byId = BANNER_VARIANTS.findIndex(v => v.id === param);
  if (byId >= 0) return byId;
  // Numbers are 1-based, matching the label on the switch button.
  const byIndex = Number.parseInt(param, 10) - 1;
  if (Number.isInteger(byIndex) && byIndex >= 0 && byIndex < BANNER_VARIANTS.length) return byIndex;
  return null;
}

function randomBannerIndex(): number {
  return Math.floor(Math.random() * BANNER_VARIANTS.length);
}

/** Build a shuffled bag of all variant indices except `exclude` (Fisher-Yates),
 * so every variant shows once before any repeats and the same one never
 * repeats back-to-back. */
function shuffleBag(exclude: number): number[] {
  const bag = BANNER_VARIANTS.map((_, i) => i).filter(i => i !== exclude);
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bag[i], bag[j]] = [bag[j], bag[i]];
  }
  return bag;
}

@customElement('sz-dashboard')
export class SzDashboard extends LitElement {
  private typewriter = new TypewriterController(this, { speed: 60 });
  private bannerCleanup: (() => void) | null = null;
  private mountedBannerIndex = -1;
  private stageCols = STAGE_MIN_COLS;
  private resizeObserver: ResizeObserver | null = null;
  private resizeDebounce: number | null = null;
  private bannerMountToken = 0;
  private hasMountedOnce = false;
  private pinned: boolean;
  private rotateBag: number[] = [];
  private rotateTimer: number | null = null;
  private intersectionObserver: IntersectionObserver | null = null;
  private isIntersecting = true;
  private isHovering = false;
  private handlePointerEnter = () => { this.isHovering = true; };
  private handlePointerLeave = () => { this.isHovering = false; };
  private handleReducedMotionChange = () => {
    if (reducedMotion.matches) {
      this.stopRotation();
    } else {
      this.startRotation();
    }
  };

  static styles = [css`
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
    .banner {
      position: relative;
      width: 100%;
      margin-bottom: 24px;
    }
    .ascii {
      display: grid;
      white-space: pre;
      font-size: clamp(4px, 1.2vw, 10px);
      line-height: 1.2;
      color: var(--sz-accent, #89b4fa);
      text-align: center;
      margin: 0 auto;
      overflow: hidden;
    }
    .ascii pre {
      margin: 0;
      font: inherit;
      white-space: pre;
      line-height: inherit;
      grid-area: 1 / 1;
    }
    .char-probe {
      position: absolute;
      visibility: hidden;
      pointer-events: none;
      white-space: pre;
      font: inherit;
      font-size: clamp(4px, 1.2vw, 10px);
      line-height: 1.2;
      top: -9999px;
      left: -9999px;
    }
    @media (prefers-reduced-motion: no-preference) {
      .ascii.fade-in {
        animation: banner-fade-in 300ms ease-in;
      }
    }
    @keyframes banner-fade-in {
      from { opacity: 0; }
      to { opacity: 1; }
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
      .ascii { font-size: clamp(4px, 2.4vw, 8px); }
      .char-probe { font-size: clamp(4px, 2.4vw, 8px); }
      .hint { display: none; }
    }
  `];

  /** Navigation tabs, injected by the template (nav='[...]'). */
  @property({ attribute: 'nav', converter: jsonArrayAttribute }) nav: NavTab[] = [];
  /** ASCII wordmark lines, injected by the template (wordmark='[...]'). */
  @property({ attribute: 'wordmark', converter: jsonArrayAttribute }) wordmark: string[] = [];
  /** "stéphan" glyph bitmaps for the banner variants, injected by the template (banner='{...}'). */
  @property({ attribute: 'banner', converter: jsonObjectAttribute }) banner: Banner | null = null;
  /** Rotating taglines, injected by the template (taglines='[...]'). */
  @property({ attribute: 'taglines', converter: jsonArrayAttribute }) taglines: string[] = [];

  @state() private bannerIndex: number;

  constructor() {
    super();
    const locationIndex = readBannerIndexFromLocation();
    this.pinned = locationIndex !== null;
    this.bannerIndex = locationIndex ?? randomBannerIndex();
  }

  private get taglineList(): string[] {
    return this.taglines;
  }

  connectedCallback() {
    super.connectedCallback();
    this.typewriter.cycle(this.taglineList, { pauseBetween: 3000, eraseSpeed: 30 });
    reducedMotion.addEventListener('change', this.handleReducedMotionChange);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this.bannerCleanup?.();
    this.bannerCleanup = null;
    this.resizeObserver?.disconnect();
    this.resizeObserver = null;
    this.intersectionObserver?.disconnect();
    this.intersectionObserver = null;
    if (this.resizeDebounce !== null) window.clearTimeout(this.resizeDebounce);
    this.stopRotation();
    reducedMotion.removeEventListener('change', this.handleReducedMotionChange);
  }

  private get dashboardLinks() {
    return this.nav
      .filter(tab => tab.key && tab.name !== 'home')
      .map(tab => ({ label: tab.name, key: tab.key!, href: tab.path, icon: tab.icon || 'file' }));
  }

  /** Pull the next index from the shuffle bag, refilling (excluding the
   * current index) when it runs dry. */
  private advanceToNextInBag() {
    if (this.rotateBag.length === 0) this.rotateBag = shuffleBag(this.bannerIndex);
    this.bannerIndex = this.rotateBag.shift()!;
  }

  private rotateTick = () => {
    if (document.hidden || !this.isIntersecting || this.isHovering) return;
    this.advanceToNextInBag();
  };

  private startRotation() {
    this.stopRotation();
    if (this.pinned || reducedMotion.matches) return;
    this.rotateTimer = window.setInterval(this.rotateTick, BANNER_ROTATE_MS);
  }

  private stopRotation() {
    if (this.rotateTimer !== null) {
      window.clearInterval(this.rotateTimer);
      this.rotateTimer = null;
    }
  }

  /** Re-trigger the 300ms cross-fade on the `.ascii` host after a rotation
   * mount (not the first mount, which has nothing to fade from). */
  private playFadeIn(host: HTMLElement) {
    host.classList.remove('fade-in');
    // Force reflow so the animation re-triggers even if the class was
    // already removed on a previous mount.
    void host.offsetWidth;
    host.classList.add('fade-in');
    host.addEventListener('animationend', () => host.classList.remove('fade-in'), { once: true });
  }

  /** Measure the `.ascii` font's character width with a hidden probe span of
   * repeated 'M' chars, so the stage column count is based on the real
   * rendered font rather than an assumed em fraction. */
  private measureCharWidth(): number {
    const probe = this.renderRoot.querySelector('.char-probe');
    if (!(probe instanceof HTMLElement)) return 0;
    const sample = 100;
    probe.textContent = 'M'.repeat(sample);
    const width = probe.getBoundingClientRect().width;
    return width > 0 ? width / sample : 0;
  }

  /** Compute the stage column count from the `.banner` available width and
   * the measured character width, clamped to [STAGE_MIN_COLS, STAGE_MAX_COLS]. */
  private computeStageCols(): number {
    const banner = this.renderRoot.querySelector('.banner');
    if (!(banner instanceof HTMLElement)) return STAGE_MIN_COLS;
    const availableWidth = banner.getBoundingClientRect().width;
    const charWidth = this.measureCharWidth();
    if (availableWidth <= 0 || charWidth <= 0) return STAGE_MIN_COLS;
    return Math.min(STAGE_MAX_COLS, Math.max(STAGE_MIN_COLS, Math.floor(availableWidth / charWidth)));
  }

  private mountBanner() {
    const host = this.renderRoot.querySelector('.ascii');
    if (!(host instanceof HTMLElement)) return;
    this.stageCols = this.computeStageCols();
    const charWidth = this.measureCharWidth();
    if (charWidth > 0) {
      host.style.width = `${this.stageCols * charWidth}px`;
    }
    host.style.height = `calc(${STAGE_ROWS} * 1.2em)`;
    const variant = BANNER_VARIANTS[this.bannerIndex];
    const ctx = { wordmark: this.wordmark, banner: this.banner, cols: this.stageCols, rows: STAGE_ROWS };
    const token = ++this.bannerMountToken;
    const isFirstMount = !this.hasMountedOnce;
    this.hasMountedOnce = true;
    this.mountedBannerIndex = this.bannerIndex;
    variant.load().then(module => {
      if (token !== this.bannerMountToken || !host.isConnected) return;
      this.bannerCleanup?.();
      this.bannerCleanup = null;
      host.replaceChildren();
      host.style.cursor = '';
      this.bannerCleanup = module.mount(host, ctx);
      if (!isFirstMount) this.playFadeIn(host);
    }).catch(err => {
      console.warn('banner variant failed to load', variant.id, err);
    });
  }

  firstUpdated() {
    this.mountBanner();
    const banner = this.renderRoot.querySelector('.banner');
    if (banner instanceof HTMLElement) {
      if (typeof ResizeObserver !== 'undefined') {
        this.resizeObserver = new ResizeObserver(() => {
          if (this.resizeDebounce !== null) window.clearTimeout(this.resizeDebounce);
          this.resizeDebounce = window.setTimeout(() => {
            this.resizeDebounce = null;
            const newCols = this.computeStageCols();
            if (newCols !== this.stageCols) this.mountBanner();
          }, 150);
        });
        this.resizeObserver.observe(banner);
      }
      if (typeof IntersectionObserver !== 'undefined') {
        this.intersectionObserver = new IntersectionObserver(entries => {
          const entry = entries[entries.length - 1];
          if (entry) this.isIntersecting = entry.isIntersecting;
        });
        this.intersectionObserver.observe(banner);
      }
      banner.addEventListener('mouseenter', this.handlePointerEnter);
      banner.addEventListener('mouseleave', this.handlePointerLeave);
      banner.addEventListener('focusin', this.handlePointerEnter);
      banner.addEventListener('focusout', this.handlePointerLeave);
    }
    this.startRotation();
  }

  updated() {
    if (this.mountedBannerIndex !== this.bannerIndex) this.mountBanner();
  }

  // The ASCII wordmark below is decoration (aria-hidden); its text equivalent
  // is the page's h1, which lives in light DOM (src/pages/index.njk) rather
  // than in here so it is in the served HTML before — and without — the bundle.
  // The `.ascii` host has no Lit bindings inside it: the active banner variant
  // is mounted imperatively (mountBanner) so Lit's re-render never touches
  // the DOM the variant owns.
  render() {
    return html`
      <div class="banner">
        <span class="char-probe" aria-hidden="true"></span>
        <div class="ascii" aria-hidden="true"></div>
      </div>
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
