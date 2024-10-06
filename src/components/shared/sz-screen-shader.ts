import { LitElement, html, css } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { StateController } from './state-controller.js';

@customElement('sz-screen-shader')
export class SzScreenShader extends LitElement {
  private stateCtrl = new StateController(this, ['shaderMode']);

  @state() private lightX = 50;
  @state() private lightY = 20;
  @state() private warmth = 0;

  static styles = css`
    :host {
      display: block;
      position: relative;
      width: 100%;
      height: 100%;
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
      background: radial-gradient(ellipse at center, transparent 60%, rgba(0,0,0,0.3) 100%);
      border-radius: inherit;
    }
    ::slotted(*) {
      position: relative;
      z-index: 1;
    }
  `;

  private intervalId?: number;

  connectedCallback() {
    super.connectedCallback();
    this.updateLighting();
    this.intervalId = window.setInterval(() => this.updateLighting(), 600000);
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    if (this.intervalId) clearInterval(this.intervalId);
  }

  private updateLighting() {
    const hour = new Date().getHours();
    const minute = new Date().getMinutes();
    const time = hour + minute / 60;

    if (time >= 6 && time < 10) {
      // Morning: warm, from right
      const progress = (time - 6) / 4;
      this.lightX = 80 - progress * 20;
      this.lightY = 30 - progress * 10;
      this.warmth = 20;
    } else if (time >= 10 && time < 14) {
      // Midday: neutral, top center
      this.lightX = 50;
      this.lightY = 15;
      this.warmth = 0;
    } else if (time >= 14 && time < 18) {
      // Afternoon: warm, from left
      const progress = (time - 14) / 4;
      this.lightX = 40 - progress * 20;
      this.lightY = 20 + progress * 10;
      this.warmth = 15 + progress * 10;
    } else {
      // Night: cool, dim
      this.lightX = 50;
      this.lightY = 50;
      this.warmth = -10;
    }
  }

  render() {
    const shaderMode = this.stateCtrl.get('shaderMode');
    if (shaderMode === 'off') return html`<slot></slot>`;

    const warmColor = this.warmth > 0
      ? `rgba(255, 200, 150, ${this.warmth / 1000})`
      : `rgba(150, 180, 255, ${Math.abs(this.warmth) / 1000})`;

    return html`
      <div class="shader-overlay" style="background: radial-gradient(ellipse at ${this.lightX}% ${this.lightY}%, ${warmColor}, transparent 70%)"></div>
      <div class="vignette"></div>
      <slot></slot>
    `;
  }
}
