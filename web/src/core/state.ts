export interface AppStateSchema {
  theme: string;
  windowMode: 'windowed' | 'full-page' | 'fullscreen';
  activeTab: number;
  activePane: string | null;
  transparency: number;
  shaderMode: 'off' | 'css' | 'webgl';
  viewMode: 'code' | 'reading';
  fontScale: number;
  /** WCAG 2.1.4 escape hatch for the bare-letter shortcuts. See core/keyboard.ts. */
  keyShortcuts: boolean;
}

const STORAGE_KEY = 'sz-state-v1';

/**
 * Theme names come from content/data/themes.json via base.njk: the <html>
 * element carries the default in data-theme and every theme in data-themes.
 */
export function availableThemes(): string[] {
  const list = document.documentElement.dataset.themes?.trim();
  return list ? list.split(/\s+/) : [];
}

const defaultTheme =
  document.documentElement.dataset.theme || availableThemes()[0] || '';

const defaults: AppStateSchema = {
  theme: defaultTheme,
  windowMode: 'windowed',
  activeTab: 0,
  activePane: null,
  transparency: 95,
  shaderMode: 'css',
  viewMode: 'reading',
  fontScale: 1,
  keyShortcuts: true,
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
        // A saved theme that no longer exists in themes.json falls back.
        if (!availableThemes().includes(this.data.theme)) this.data.theme = defaults.theme;
      }
    } catch { /* corrupted — use defaults */ }
  }
}

export const appState = new AppState();
