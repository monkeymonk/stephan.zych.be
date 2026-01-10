import { LitElement, css, nothing } from 'lit';
import { customElement } from 'lit/decorators.js';
import { reducedMotion } from '../../core/styles.js';
import { ActionController } from '../../core/action-controller.js';
import { EFFECT_ACTION } from './actions.js';

@customElement('sz-effect-confetti')
export class SzEffectConfetti extends LitElement {
  private cleanupEffect?: () => void;
  private actionCtrl = new ActionController(this, [[EFFECT_ACTION.CONFETTI, () => {
    if (reducedMotion.matches) {
      this.startFlash();
      return;
    }
    this.startParty();
  }]]);

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

  private startParty(): void {
    this.cleanupEffect?.();

    const container = document.createElement('div');
    container.style.cssText = 'position:fixed;inset:0;z-index:9999;pointer-events:none;overflow:hidden;';
    document.body.appendChild(container);

    this.ensureConfettiStyle();

    const colors = ['#f38ba8', '#a6e3a1', '#89b4fa', '#f9e2af', '#cba6f7', '#f5c2e7', '#fab387', '#94e2d5'];
    for (let index = 0; index < 100; index += 1) {
      const confetti = document.createElement('div');
      const color = colors[Math.floor(Math.random() * colors.length)];
      const left = Math.random() * 100;
      const size = Math.random() * 8 + 4;
      const duration = Math.random() * 2 + 1.5;
      const delay = Math.random() * 0.5;
      confetti.style.cssText = `position:absolute;left:${left}%;top:-10px;width:${size}px;height:${size * 1.5}px;background:${color};border-radius:2px;animation:confetti-fall ${duration}s ease-in ${delay}s forwards;transform:rotate(${Math.random() * 360}deg);`;
      container.appendChild(confetti);
    }

    const cleanup = () => {
      window.clearTimeout(timeout);
      container.remove();
      if (this.cleanupEffect === cleanup) this.cleanupEffect = undefined;
    };

    const timeout = window.setTimeout(cleanup, 4000);
    this.cleanupEffect = cleanup;
  }

  private startFlash(): void {
    this.cleanupEffect?.();

    const flash = document.createElement('div');
    flash.style.cssText = `
      position:fixed;
      inset:0;
      z-index:9999;
      pointer-events:none;
      background:radial-gradient(circle at center, rgb(249 226 175 / 0.6), rgb(137 180 250 / 0.18) 45%, transparent 75%);
      animation:confetti-flash 180ms ease-out 2 alternate;
    `;
    document.body.appendChild(flash);

    this.ensureConfettiStyle();

    const cleanup = () => {
      window.clearTimeout(timeout);
      flash.remove();
      if (this.cleanupEffect === cleanup) this.cleanupEffect = undefined;
    };

    const timeout = window.setTimeout(cleanup, 500);
    this.cleanupEffect = cleanup;
  }

  private ensureConfettiStyle(): void {
    if (document.getElementById('sz-effect-confetti-style')) return;

    const style = document.createElement('style');
    style.id = 'sz-effect-confetti-style';
    style.textContent = `
      @keyframes confetti-fall {
        0% { transform: translateY(0) rotate(0deg); opacity: 1; }
        100% { transform: translateY(100vh) rotate(720deg); opacity: 0; }
      }

      @keyframes confetti-flash {
        from { opacity: 0; }
        to { opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
}
