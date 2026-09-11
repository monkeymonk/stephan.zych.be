import { LitElement, css, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { reducedMotion } from '../../core/styles.js';
import { ActionController } from '../../core/action-controller.js';
import { KeymapController } from '../../core/keymap-controller.js';
import { OverlayController } from '../../core/overlay-controller.js';
import { EFFECT_ACTION } from './actions.js';

@customElement('sz-effect-matrix')
export class SzEffectMatrix extends LitElement {
  private cleanupEffect?: () => void;
  private actionCtrl = new ActionController(this, [[EFFECT_ACTION.MATRIX, () => this.startMatrix()]]);

  /**
   * A `layer`: the canvas paints over everything but displaces no modal and
   * traps no focus. It is registered so the dismiss keys can be scoped to the
   * run — the keymap gives a live layer its own tier — instead of the fresh
   * document listener this component used to add per run, which stayed armed
   * for any run whose cleanup had already replaced it.
   */
  private overlayCtrl = new OverlayController(this, {
    id: 'effect',
    kind: 'layer',
    // Nothing is styled off `[open]` here: the host is display:none and the
    // canvas lives on <body>.
    reflect: false,
    onClose: () => this.cleanupEffect?.(),
  });

  /** Empty between runs: `q` and Escape only mean "dismiss" while one is up. */
  private keysCtrl = new KeymapController(this, []);

  static styles = css`
    :host {
      display: none;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
  }

  disconnectedCallback(): void {
    this.cleanupEffect?.();
    super.disconnectedCallback();
  }

  render() {
    return nothing;
  }

  private startMatrix(): void {
    if (reducedMotion.matches) return;

    this.cleanupEffect?.();

    const canvas = document.createElement('canvas');
    canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;';
    document.body.appendChild(canvas);

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      canvas.remove();
      return;
    }

    const updateSize = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };

    updateSize();

    let drops = this.createDrops(canvas.width);
    const chars = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789';
    const interval = window.setInterval(() => {
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#0f0';
      ctx.font = '14px monospace';

      for (let index = 0; index < drops.length; index += 1) {
        const char = chars[Math.floor(Math.random() * chars.length)];
        ctx.fillText(char, index * 14, drops[index] * 14);
        if (drops[index] * 14 > canvas.height && Math.random() > 0.975) drops[index] = 0;
        drops[index] += 1;
      }
    }, 50);

    const onResize = () => {
      updateSize();
      drops = this.createDrops(canvas.width);
    };

    const cleanup = () => {
      window.clearInterval(interval);
      window.clearTimeout(timeout);
      window.removeEventListener('resize', onResize);
      this.keysCtrl.setBindings([]);
      this.overlayCtrl.release();
      canvas.remove();
      if (this.cleanupEffect === cleanup) this.cleanupEffect = undefined;
    };

    window.addEventListener('resize', onResize);
    const timeout = window.setTimeout(cleanup, 8000);
    this.cleanupEffect = cleanup;

    this.overlayCtrl.claim();
    this.keysCtrl.setBindings([
      {
        id: 'effect.dismiss',
        keys: ['q'],
        scope: 'overlay:effect',
        chars: false,
        run: () => {
          cleanup();
          return true;
        },
      },
      {
        // Escape's twin. The central `overlay.escape` only closes modals, and
        // this is a layer, so without this binding Escape would fall through
        // to `nav.back.escape` and leave the article the effect is painted
        // over.
        id: 'effect.dismiss',
        keys: ['Escape'],
        scope: 'overlay:effect',
        chars: false,
        run: () => {
          cleanup();
          return true;
        },
      },
    ]);
  }

  private createDrops(width: number): number[] {
    return new Array(Math.floor(width / 14)).fill(1);
  }
}
