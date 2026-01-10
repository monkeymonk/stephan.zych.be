import { ReactiveController, ReactiveControllerHost } from 'lit';
import { appState, AppStateSchema } from './state.js';

interface StateManager<T> {
  get<K extends keyof T>(key: K): T[K];
  set<K extends keyof T>(key: K, value: T[K]): void;
  subscribe(fn: () => void): () => void;
}

export class StateController<T = AppStateSchema> implements ReactiveController {
  private host: ReactiveControllerHost;
  private keys: (keyof T)[];
  private state: StateManager<T>;
  private unsubscribe?: () => void;
  private prev: Record<string, unknown> = {};

  constructor(host: ReactiveControllerHost, keys: (keyof T)[], state?: StateManager<T>) {
    this.host = host;
    this.keys = keys;
    this.state = state ?? (appState as unknown as StateManager<T>);
    host.addController(this);
  }

  hostConnected(): void {
    this.snapshot();
    this.unsubscribe = this.state.subscribe(() => {
      if (this.changed()) {
        this.snapshot();
        this.host.requestUpdate();
      }
    });
  }

  hostDisconnected(): void {
    this.unsubscribe?.();
  }

  get<K extends keyof T>(key: K): T[K] {
    return this.state.get(key);
  }

  set<K extends keyof T>(key: K, value: T[K]): void {
    this.state.set(key, value);
  }

  private snapshot(): void {
    for (const key of this.keys) {
      this.prev[key as string] = this.state.get(key);
    }
  }

  private changed(): boolean {
    return this.keys.some(key => this.state.get(key) !== this.prev[key as string]);
  }
}
