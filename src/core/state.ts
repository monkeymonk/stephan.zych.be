export interface AppStateSchema {
  theme: string;
  windowMode: 'windowed' | 'full-page' | 'fullscreen';
  activeTab: number;
  activePane: string | null;
  transparency: number;
  shaderMode: 'off' | 'css' | 'webgl';
}

const STORAGE_KEY = 'sz-state-v1';

const defaults: AppStateSchema = {
  theme: 'catppuccin-mocha',
  windowMode: 'windowed',
  activeTab: 0,
  activePane: null,
  transparency: 95,
  shaderMode: 'css',
};

type Listener = () => void;

class AppState {
  private data: AppStateSchema;
  private listeners = new Set<Listener>();

  constructor() {
    this.data = { ...defaults };
    this.load();
  }

  get<K extends keyof AppStateSchema>(key: K): AppStateSchema[K] {
    return this.data[key];
  }

  set<K extends keyof AppStateSchema>(key: K, value: AppStateSchema[K]): void {
    if (this.data[key] === value) return;
    this.data[key] = value;
    this.save();
    this.notify();
  }

  getAll(): Readonly<AppStateSchema> {
    return { ...this.data };
  }

  subscribe(fn: Listener): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private notify(): void {
    this.listeners.forEach(fn => fn());
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch { /* quota exceeded — ignore */ }
  }

  private load(): void {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        this.data = { ...defaults, ...parsed };
      }
    } catch { /* corrupted — use defaults */ }
  }
}

export const appState = new AppState();
