import { ReactiveController, ReactiveControllerHost } from 'lit';
import { reducedMotion } from '../core/styles.js';

export interface TypewriterControllerOptions {
  speed?: number;
  cursor?: string;
  delay?: number;
}

export interface TypewriterCycleOptions {
  pauseBetween?: number;
  eraseSpeed?: number;
}

export class TypewriterController implements ReactiveController {
  text = '';
  typing = false;
  cursor: string;

  private readonly host: ReactiveControllerHost;
  private readonly speed: number;
  private readonly delay: number;
  private typingTimer: number | null = null;
  private cycleTimer: number | null = null;
  private cycleToken = 0;

  constructor(host: ReactiveControllerHost, options: TypewriterControllerOptions = {}) {
    this.host = host;
    this.speed = options.speed ?? 80;
    this.cursor = options.cursor ?? '|';
    this.delay = options.delay ?? 0;
    host.addController(this);
  }

  hostDisconnected() {
    this.stop();
  }

  start(text: string) {
    this.stop();

    if (reducedMotion.matches) {
      this.text = text;
      this.typing = false;
      this.host.requestUpdate();
      return;
    }

    const token = ++this.cycleToken;
    this.text = '';
    this.typing = true;
    this.host.requestUpdate();

    const run = () => this.typeText(text, 0, token, () => {
      this.typing = false;
      this.host.requestUpdate();
    });

    if (this.delay > 0) {
      this.typingTimer = window.setTimeout(run, this.delay);
      return;
    }

    run();
  }

  cycle(texts: string[], options: TypewriterCycleOptions = {}) {
    this.stop();

    if (texts.length === 0) {
      this.text = '';
      this.typing = false;
      this.host.requestUpdate();
      return;
    }

    if (reducedMotion.matches) {
      this.text = texts[0] ?? '';
      this.typing = false;
      this.host.requestUpdate();
      return;
    }

    const pauseBetween = options.pauseBetween ?? 3000;
    const eraseSpeed = options.eraseSpeed ?? Math.max(16, Math.round(this.speed / 2));
    const token = ++this.cycleToken;
    let index = 0;

    const run = () => {
      if (token !== this.cycleToken) {
        return;
      }

      const current = texts[index] ?? '';
      this.text = '';
      this.typing = true;
      this.host.requestUpdate();

      this.typeText(current, 0, token, () => {
        if (token !== this.cycleToken) {
          return;
        }

        this.typing = false;
        this.host.requestUpdate();
        this.cycleTimer = window.setTimeout(() => {
          this.eraseText(current, current.length, eraseSpeed, token, () => {
            index = (index + 1) % texts.length;
            this.cycleTimer = window.setTimeout(run, this.delay);
          });
        }, pauseBetween);
      });
    };

    if (this.delay > 0) {
      this.cycleTimer = window.setTimeout(run, this.delay);
      return;
    }

    run();
  }

  stop() {
    this.clearTimers();
    this.cycleToken++;
    this.typing = false;
    this.host.requestUpdate();
  }

  private typeText(text: string, index: number, token: number, onComplete: () => void) {
    if (token !== this.cycleToken) {
      return;
    }

    if (index >= text.length) {
      onComplete();
      return;
    }

    this.text = text.slice(0, index + 1);
    this.host.requestUpdate();
    this.typingTimer = window.setTimeout(
      () => this.typeText(text, index + 1, token, onComplete),
      this.speed,
    );
  }

  private eraseText(
    text: string,
    index: number,
    eraseSpeed: number,
    token: number,
    onComplete: () => void,
  ) {
    if (token !== this.cycleToken) {
      return;
    }

    if (index <= 0) {
      this.text = '';
      this.host.requestUpdate();
      onComplete();
      return;
    }

    this.text = text.slice(0, index - 1);
    this.typing = true;
    this.host.requestUpdate();
    this.typingTimer = window.setTimeout(
      () => this.eraseText(text, index - 1, eraseSpeed, token, onComplete),
      eraseSpeed,
    );
  }

  private clearTimers() {
    if (this.typingTimer !== null) {
      clearTimeout(this.typingTimer);
      this.typingTimer = null;
    }

    if (this.cycleTimer !== null) {
      clearTimeout(this.cycleTimer);
      this.cycleTimer = null;
    }
  }
}
