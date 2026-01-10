import { LitElement } from 'lit';
import { StateController } from './state-controller.js';

/**
 * Base class for content widgets that render two ways: a plain markdown-like
 * version in the code/"nvim" view, and the stylish version in the reading/
 * "glow" view. Subclasses implement renderCode() and renderGlow(); the active
 * one is chosen from the persisted appState.viewMode (kept reactive via the
 * StateController).
 */
export abstract class ViewAwareElement extends LitElement {
  protected viewCtrl = new StateController(this, ['viewMode']);

  protected get isReading(): boolean {
    return this.viewCtrl.get('viewMode') === 'reading';
  }

  render(): unknown {
    return this.isReading ? this.renderGlow() : this.renderCode();
  }

  protected abstract renderGlow(): unknown;
  protected abstract renderCode(): unknown;
}
