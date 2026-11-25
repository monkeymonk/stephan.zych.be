import { LitElement, html, css } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import { jsonArrayAttribute, jsonObjectAttribute } from '../../core/data.js';
import { reducedMotion } from '../../core/styles.js';
import { BANNER_VARIANTS, STAGE_ROWS, STAGE_MIN_COLS, STAGE_MAX_COLS } from './registry.js';
import type { Banner } from './registry.js';

const BANNER_ROTATE_MS = 20_000;

function readBannerIndexFromLocation(): number | null {
  const param = new URLSearchParams(window.location.search).get('banner');
  if (param === null) return null;
  const byId = BANNER_VARIANTS.findIndex(v => v.id === param);
  if (byId >= 0) return byId;
  // Numbers are 1-based, matching the variant order in registry.ts.
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

/** Rotating ASCII "stephan" wordmark shown above the home dashboard's menu.
 * Owns the variant registry, rotation timing and the stage sizing/mount
 * machinery; sz-dashboard only renders this element and passes it the raw
 * wordmark/banner data. */
@customElement('sz-banner')
export class SzBanner extends LitElement {
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
    :host {
      display: block;
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

    @media (max-width: 768px) {
      .ascii { font-size: clamp(4px, 2.4vw, 8px); }
      .char-probe { font-size: clamp(4px, 2.4vw, 8px); }
    }
  `];

  /** ASCII wordmark lines, injected by sz-dashboard as a property. */
  @property({ attribute: 'wordmark', converter: jsonArrayAttribute }) wordmark: string[] = [];
  /** "stéphan" glyph bitmaps for the banner variants, injected by sz-dashboard as a property. */
  @property({ attribute: 'banner', converter: jsonObjectAttribute }) banner: Banner | null = null;

  @state() private bannerIndex: number;

  constructor() {
    super();
    const locationIndex = readBannerIndexFromLocation();
    this.pinned = locationIndex !== null;
    this.bannerIndex = locationIndex ?? randomBannerIndex();
  }

  connectedCallback() {
    super.connectedCallback();
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

  /** Pull the next index from the shuffle bag, refilling (excluding the
   * current index) when it runs dry. */
  private advanceToNextInBag() {
    if (this.rotateBag.length === 0) this.rotateBag = shuffleBag(this.bannerIndex);
    const next = this.rotateBag.shift();
    if (next !== undefined) this.bannerIndex = next;
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

  /** Compute the stage column count from the host's available width and
   * the measured character width, clamped to [STAGE_MIN_COLS, STAGE_MAX_COLS]. */
  private computeStageCols(): number {
    const availableWidth = this.getBoundingClientRect().width;
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
      console.error('banner variant failed to load', variant.id, err);
    });
  }

  firstUpdated() {
    this.mountBanner();
    this.resizeObserver = new ResizeObserver(() => {
      if (this.resizeDebounce !== null) window.clearTimeout(this.resizeDebounce);
      this.resizeDebounce = window.setTimeout(() => {
        this.resizeDebounce = null;
        const newCols = this.computeStageCols();
        if (newCols !== this.stageCols) this.mountBanner();
      }, 150);
    });
    this.resizeObserver.observe(this);
    this.intersectionObserver = new IntersectionObserver(entries => {
      const entry = entries.at(-1);
      if (entry) this.isIntersecting = entry.isIntersecting;
    });
    this.intersectionObserver.observe(this);
    this.addEventListener('mouseenter', this.handlePointerEnter);
    this.addEventListener('mouseleave', this.handlePointerLeave);
    this.addEventListener('focusin', this.handlePointerEnter);
    this.addEventListener('focusout', this.handlePointerLeave);
    this.startRotation();
  }

  updated() {
    if (this.mountedBannerIndex !== this.bannerIndex) this.mountBanner();
  }

  // The `.ascii` host has no Lit bindings inside it: the active banner
  // variant is mounted imperatively (mountBanner) so Lit's re-render never
  // touches the DOM the variant owns.
  render() {
    return html`
      <span class="char-probe" aria-hidden="true"></span>
      <div class="ascii" aria-hidden="true"></div>
    `;
  }
}
