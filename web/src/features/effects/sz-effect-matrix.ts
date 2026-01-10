import { LitElement, css, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { reducedMotion } from '../../core/styles.js';
import { ActionController } from '../../core/action-controller.js';
import { EFFECT_ACTION } from './actions.js';

@customElement('sz-effect-matrix')
export class SzEffectMatrix extends LitElement {
  private cleanupEffect?: () => void;
  private actionCtrl = new ActionController(this, [[EFFECT_ACTION.MATRIX, () => this.startMatrix()]]);

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
      document.removeEventListener('keydown', onKey);
      canvas.remove();
      if (this.cleanupEffect === cleanup) this.cleanupEffect = undefined;
    };

    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape' || event.key === 'q') cleanup();
    };

    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey);
    const timeout = window.setTimeout(cleanup, 8000);
    this.cleanupEffect = cleanup;
  }

  private createDrops(width: number): number[] {
    return new Array(Math.floor(width / 14)).fill(1);
  }
}
