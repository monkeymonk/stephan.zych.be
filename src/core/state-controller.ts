import { ReactiveController, ReactiveControllerHost } from 'lit';
import { appState, AppStateSchema } from './state.js';

export class StateController implements ReactiveController {
  private host: ReactiveControllerHost;
  private keys: (keyof AppStateSchema)[];
  private unsubscribe?: () => void;
  private prev: Record<string, unknown> = {};

  constructor(host: ReactiveControllerHost, keys: (keyof AppStateSchema)[]) {
    this.host = host;
    this.keys = keys;
    host.addController(this);
  }

  hostConnected(): void {
    this.snapshot();
    this.unsubscribe = appState.subscribe(() => {
      if (this.changed()) {
        this.snapshot();
        this.host.requestUpdate();
      }
    });
  }

  hostDisconnected(): void {
    this.unsubscribe?.();
  }

  get<K extends keyof AppStateSchema>(key: K): AppStateSchema[K] {
    return appState.get(key);
  }

  set<K extends keyof AppStateSchema>(key: K, value: AppStateSchema[K]): void {
    appState.set(key, value);
  }

  private snapshot(): void {
    for (const key of this.keys) {
      this.prev[key] = appState.get(key);
    }
  }

  private changed(): boolean {
    return this.keys.some(key => appState.get(key) !== this.prev[key]);
  }
}
