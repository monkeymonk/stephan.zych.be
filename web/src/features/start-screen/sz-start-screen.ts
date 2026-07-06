import { LitElement, html, css, nothing, type PropertyValues } from 'lit';
import { customElement, property, state } from 'lit/decorators.js';
import type { StartScreenItem } from '../../core/registry.js';
import { jsonArrayAttribute } from '../../core/data.js';
import { actions } from '../../core/actions.js';
import { START_SCREEN_ACTION } from './actions.js';

type Tone = 'light' | 'dark';

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), hi);

@customElement('sz-start-screen')
export class SzStartScreen extends LitElement {
  /** Launcher items, injected by the template (items='[...]'). */
  @property({ attribute: 'items', converter: jsonArrayAttribute }) items: StartScreenItem[] = [];

  /** Hidden while the terminal window is open; revealed when it is closed. */
  @property({ type: Boolean }) inactive = false;

  /** Current wallpaper URL, pushed in by the slideshow wiring. */
  @property({ attribute: false }) wallpaper = '';

  /** Per-item backdrop tone, sampled from the wallpaper behind each button. */
  @state() private tones: Tone[] = [];

  private toneToken = 0;
  private toneCanvas?: HTMLCanvasElement;
  private resizeTimer?: number;

  static styles = css`
    :host {
      display: contents;
    }

    .start-screen {
      position: fixed;
      inset: 0;
      z-index: 1;
      display: flex;
      align-items: center;
      justify-content: center;
      pointer-events: none;
    }

    /* The launcher is just content wrapped in the reusable glass material. */
    .pill {
      --glass-radius: 28px;
      pointer-events: auto;
    }

    .pill-content {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: center;
      gap: 64px;
      padding: 24px 32px;
    }

    .item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 8px;
      background: transparent;
      border: none;
      cursor: pointer;
      padding: 10px 14px;
      border-radius: 14px;
      font-family: inherit;
      /* Ink adapts to the wallpaper directly behind each button; defaults
         assume a dark backdrop until sampled. */
      --item-fg: var(--sz-text, #cdd6f4);
      --item-fg-shadow: rgba(0, 0, 0, 0.55);
      --item-hover: rgba(255, 255, 255, 0.14);
      color: var(--item-fg);
      transition: transform 0.2s ease, background-color 0.2s ease;
      outline: none;
    }

    .item[data-tone='light'] {
      --item-fg: #11111b;
      --item-fg-shadow: rgba(255, 255, 255, 0.5);
      --item-hover: rgba(0, 0, 0, 0.08);
    }

    /* Apple-style hover: a gentle lift and a soft translucent lozenge. */
    .item:hover {
      transform: scale(1.06);
      background: var(--item-hover);
    }

    .item:focus-visible {
      outline: 2px solid var(--sz-accent, #89b4fa);
      outline-offset: 4px;
    }

    @media (prefers-reduced-motion: reduce) {
      .item { transition: none; }
      .item:hover { transform: none; }
    }

    .icon-wrap {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
    }

    .label {
      font-size: 11px;
      text-align: center;
      text-shadow: 0 1px 3px var(--item-fg-shadow);
      color: var(--item-fg);
    }

    @media (max-width: 768px) {
      .pill-content {
        gap: 48px;
        padding: 16px 20px;
      }

      .icon-wrap {
        width: 36px;
        height: 36px;
      }
    }
  `;

  private handleClick(item: StartScreenItem) {
    actions.dispatch(START_SCREEN_ACTION.LAUNCH, item);
  }

  private handleKeydown(e: KeyboardEvent, index: number) {
    const items = this.shadowRoot?.querySelectorAll<HTMLButtonElement>('.item');
    if (!items) return;

    let target: number | null = null;
    if (e.key === 'ArrowRight') target = (index + 1) % items.length;
    if (e.key === 'ArrowLeft') target = (index - 1 + items.length) % items.length;

    if (target !== null) {
      e.preventDefault();
      items[target].focus();
    }
  }

  connectedCallback(): void {
    super.connectedCallback();
    window.addEventListener('resize', this.onResize);
  }

  disconnectedCallback(): void {
    window.removeEventListener('resize', this.onResize);
    if (this.resizeTimer !== undefined) window.clearTimeout(this.resizeTimer);
    super.disconnectedCallback();
  }

  updated(changed: PropertyValues): void {
    if (this.inactive) return;
    if (changed.has('inactive') || changed.has('items') || changed.has('wallpaper')) {
      void this.sampleBackdropTones();
    }
  }

  private onResize = (): void => {
    if (this.inactive) return;
    if (this.resizeTimer !== undefined) window.clearTimeout(this.resizeTimer);
    this.resizeTimer = window.setTimeout(() => void this.sampleBackdropTones(), 150);
  };

  /**
   * Classify the wallpaper luminance directly behind *each* launcher button and
   * record a per-item tone, so a button over a light patch flips to dark ink
   * while its neighbours over dark stay light. The wallpaper is drawn cover-fit
   * into a viewport-shaped canvas so canvas pixels line up with screen pixels;
   * same-origin images, so the read is never tainted.
   */
  private async sampleBackdropTones(): Promise<void> {
    const url = this.wallpaper;
    const buttons = this.shadowRoot
      ? [...this.shadowRoot.querySelectorAll<HTMLElement>('.item')]
      : [];
    if (!url || buttons.length === 0) return;

    const token = ++this.toneToken;
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    try {
      await img.decode();
    } catch {
      return;
    }
    if (token !== this.toneToken || this.inactive) return;
    if (!img.naturalWidth || !img.naturalHeight) return;

    const k = 0.25; // downscale — luminance averages don't need full resolution
    const cw = Math.max(1, Math.round(window.innerWidth * k));
    const ch = Math.max(1, Math.round(window.innerHeight * k));
    const canvas = (this.toneCanvas ??= document.createElement('canvas'));
    canvas.width = cw;
    canvas.height = ch;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return;

    // cover-fit (matches the slideshow's background-size: cover)
    const scale = Math.max(cw / img.naturalWidth, ch / img.naturalHeight);
    const dw = img.naturalWidth * scale;
    const dh = img.naturalHeight * scale;
    ctx.drawImage(img, (cw - dw) / 2, (ch - dh) / 2, dw, dh);

    let tones: Tone[];
    try {
      tones = buttons.map((btn) => {
        const r = btn.getBoundingClientRect();
        const x = clamp(Math.round(r.left * k), 0, cw - 1);
        const y = clamp(Math.round(r.top * k), 0, ch - 1);
        const w = clamp(Math.round(r.width * k), 1, cw - x);
        const h = clamp(Math.round(r.height * k), 1, ch - y);
        const { data } = ctx.getImageData(x, y, w, h);
        let sum = 0;
        const n = data.length / 4;
        for (let i = 0; i < data.length; i += 4) {
          sum += 0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2];
        }
        const luminance = n ? sum / n / 255 : 0;
        return luminance > 0.55 ? 'light' : 'dark';
      });
    } catch {
      return; // tainted read — keep current tones
    }

    if (tones.length === this.tones.length && tones.every((t, i) => t === this.tones[i])) {
      return;
    }
    this.tones = tones;
  }

  render() {
    const items = this.items;
    if (this.inactive || items.length === 0) return nothing;

    return html`
      <div class="start-screen">
        <sz-glass class="pill">
          <div class="pill-content">
            ${items.map((item, i) => html`
              <button
                class="item"
                data-tone=${this.tones[i] ?? 'dark'}
                @click=${() => this.handleClick(item)}
                @keydown=${(e: KeyboardEvent) => this.handleKeydown(e, i)}
                tabindex="0"
                title="${item.label}"
                aria-label="${item.label}"
              >
                <div class="icon-wrap">
                  <sz-icon name="${item.icon}" size="22"></sz-icon>
                </div>
                <span class="label">${item.label}</span>
              </button>
            `)}
          </div>
        </sz-glass>
      </div>
    `;
  }
}
