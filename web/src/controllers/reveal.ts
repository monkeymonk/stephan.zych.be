import { ReactiveController, ReactiveControllerHost } from 'lit';

type RevealHost = ReactiveControllerHost & Element;

/**
 * Fires `onReveal` once, the first time the host scrolls into view — for panels
 * that animate in (count-ups, bar fills) on first sight. Stops observing after.
 */
export class RevealController implements ReactiveController {
  private readonly host: RevealHost;
  private readonly onReveal: () => void;
  private readonly threshold: number;
  private observer?: IntersectionObserver;

  constructor(host: RevealHost, onReveal: () => void, threshold = 0.35) {
    this.host = host;
    this.onReveal = onReveal;
    this.threshold = threshold;
    host.addController(this);
  }

  hostConnected() {
    this.observer = new IntersectionObserver((entries) => {
      if (entries.some(e => e.isIntersecting)) {
        this.observer?.disconnect();
        this.onReveal();
      }
    }, { threshold: this.threshold });
    this.observer.observe(this.host);
  }

  hostDisconnected() {
    this.observer?.disconnect();
  }
}
