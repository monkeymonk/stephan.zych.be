import { LitElement, css, html, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { actions } from '../../core/actions.js';
import { NOTIFY_ACTION } from './actions.js';

type NotificationType = 'info' | 'warning' | 'error';

interface NotificationPayload {
  text: string;
  duration?: number;
  type?: NotificationType;
}

@customElement('sz-notifications')
export class SzNotifications extends LitElement {
  @state() private notification?: Required<NotificationPayload>;

  private hideTimer?: number;
  private unsubShow?: () => void;

  static styles = css`
    :host {
      position: fixed;
      left: 50%;
      bottom: 40px;
      z-index: 9999;
      transform: translateX(-50%);
      pointer-events: none;
    }

    .toast {
      min-width: min(320px, calc(100vw - 32px));
      max-width: min(560px, calc(100vw - 32px));
      padding: 8px 16px;
      border: 1px solid var(--sz-surface1, #45475a);
      border-radius: 6px;
      background: var(--sz-surface0, #313244);
      color: var(--sz-yellow, #f9e2af);
      box-shadow: 0 12px 32px rgb(0 0 0 / 0.28);
      font-family: 'JetBrains Mono', monospace;
      font-size: var(--sz-font-size, 13px);
      line-height: 1.5;
      text-align: center;
      animation: toast-in 0.3s ease;
    }

    .toast[data-type='info'] {
      color: var(--sz-yellow, #f9e2af);
    }

    .toast[data-type='warning'] {
      color: var(--sz-peach, #fab387);
      border-color: var(--sz-peach, #fab387);
    }

    .toast[data-type='error'] {
      color: var(--sz-red, #f38ba8);
      border-color: var(--sz-red, #f38ba8);
    }

    @keyframes toast-in {
      from {
        opacity: 0;
        transform: translateY(10px);
      }

      to {
        opacity: 1;
        transform: translateY(0);
      }
    }
  `;

  connectedCallback(): void {
    super.connectedCallback();
    this.unsubShow = actions.on(NOTIFY_ACTION.SHOW, (action) => {
      const payload = action.payload as NotificationPayload | undefined;
      if (!payload?.text) return;
      this.showNotification(payload);
    });
  }

  disconnectedCallback(): void {
    super.disconnectedCallback();
    this.unsubShow?.();
    this.clearHideTimer();
  }

  render() {
    if (!this.notification) return nothing;

    return html`
      <div class="toast" data-type=${this.notification.type} role="status" aria-live="polite">
        ${this.notification.text}
      </div>
    `;
  }

  private showNotification(payload: NotificationPayload): void {
    this.clearHideTimer();
    this.notification = {
      text: payload.text,
      duration: payload.duration ?? 2500,
      type: payload.type ?? 'info',
    };
    this.hideTimer = window.setTimeout(() => {
      this.notification = undefined;
      this.hideTimer = undefined;
    }, this.notification.duration);
  }

  private clearHideTimer(): void {
    if (this.hideTimer === undefined) return;
    window.clearTimeout(this.hideTimer);
    this.hideTimer = undefined;
  }
}
