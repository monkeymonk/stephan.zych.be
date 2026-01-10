import { LitElement, css, html } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { actions } from '../../core/actions.js';
import { StateController } from '../../core/state-controller.js';
import { SHADER_ACTION } from './actions.js';

@customElement('sz-screen-shader')
export class SzScreenShader extends LitElement {
  private stateCtrl = new StateController(this, ['shaderMode']);
  private intervalId?: number;
  private unsubSetMode?: () => void;

  @state() accessor lightX = 50;
  @state() accessor lightY = 20;
  @state() accessor warmth = 0;

  static styles = css`
    :host {
      display: block;
      position: fixed;
      inset: 0;
      z-index: 2;
      pointer-events: none;
    }

    .shader-overlay {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
      border-radius: inherit;
    }

    .vignette {
      position: absolute;
      inset: 0;
      pointer-events: none;
      z-index: 2;
      background: radial-gradient(ellipse at center, transparent 60%, rgba(0, 0, 0, 0.3) 100%);
      border-radius: inherit;
    }

    ::slotted(*) {
      z-index: 1;
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.unsubSetMode = actions.on(SHADER_ACTION.SET_MODE, (action) => {
      const mode = action.payload;
      if (mode === 'off' || mode === 'css' || mode === 'webgl') {
        this.stateCtrl.set('shaderMode', mode);
        this.updateTimerForMode(mode);
      }
    });
    this.updateLighting();
    this.updateTimerForMode(this.stateCtrl.get('shaderMode'));
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubSetMode?.();
    if (this.intervalId !== undefined) window.clearInterval(this.intervalId);
  }

  render() {
    const shaderMode = this.stateCtrl.get('shaderMode');
    if (shaderMode === 'off') return html`<slot></slot>`;

    const warmColor = this.warmth > 0
      ? `rgba(255, 200, 150, ${this.warmth / 1000})`
      : `rgba(150, 180, 255, ${Math.abs(this.warmth) / 1000})`;

    return html`
      <div
        class="shader-overlay"
        style="background: radial-gradient(ellipse at ${this.lightX}% ${this.lightY}%, ${warmColor}, transparent 70%)"
      ></div>
      <div class="vignette"></div>
      <slot></slot>
    `;
  }

  private updateTimerForMode(mode: string): void {
    if (this.intervalId !== undefined) window.clearInterval(this.intervalId);
    this.intervalId = undefined;
    if (mode !== 'off') {
      this.intervalId = window.setInterval(() => this.updateLighting(), 600000);
    }
  }

  private updateLighting(): void {
    const now = new Date();
    const hour = now.getHours();
    const minute = now.getMinutes();
    const time = hour + minute / 60;

    if (time >= 6 && time < 10) {
      const progress = (time - 6) / 4;
      this.lightX = 80 - progress * 20;
      this.lightY = 30 - progress * 10;
      this.warmth = 20;
      return;
    }

    if (time >= 10 && time < 14) {
      this.lightX = 50;
      this.lightY = 15;
      this.warmth = 0;
      return;
    }

    if (time >= 14 && time < 18) {
      const progress = (time - 14) / 4;
      this.lightX = 40 - progress * 20;
      this.lightY = 20 + progress * 10;
      this.warmth = 15 + progress * 10;
      return;
    }

    this.lightX = 50;
    this.lightY = 50;
    this.warmth = -10;
  }
}
