import { ReactiveController, ReactiveControllerHost } from 'lit';

export type SearchFilterKey<T> = keyof T | ((item: T) => unknown);

export interface SearchFilterControllerOptions<T> {
  items: T[];
  keys: SearchFilterKey<T>[];
  debounce?: number;
}

export class SearchFilterController<T> implements ReactiveController {
  results: T[];
  count: number;
  empty: boolean;

  private readonly host: ReactiveControllerHost;
  private readonly keys: SearchFilterKey<T>[];
  private readonly debounce: number;
  private items: T[];
  private queryValue = '';
  private filterTimer: number | null = null;

  constructor(host: ReactiveControllerHost, options: SearchFilterControllerOptions<T>) {
    this.host = host;
    this.items = [...options.items];
    this.keys = [...options.keys];
    this.debounce = options.debounce ?? 0;
    this.results = [...this.items];
    this.count = this.results.length;
    this.empty = this.count === 0;
    host.addController(this);
  }

  hostDisconnected() {
    this.clearTimer();
  }

  set query(value: string) {
    this.queryValue = value;

    if (this.debounce <= 0) {
      this.applyFilter();
      return;
    }

    this.clearTimer();
    this.filterTimer = window.setTimeout(() => this.applyFilter(), this.debounce);
  }

  get query() {
    return this.queryValue;
  }

  setItems(items: T[]) {
    this.items = [...items];
    this.applyFilter();
  }

  private applyFilter() {
    const query = this.queryValue.trim().toLowerCase();

    if (!query) {
      this.results = [...this.items];
    } else {
      this.results = this.items.filter((item) => this.matches(item, query));
    }

    this.count = this.results.length;
    this.empty = this.count === 0;
    this.clearTimer();
    this.host.requestUpdate();
  }

  private matches(item: T, query: string) {
    return this.keys.some((key) => {
      const value = typeof key === 'function' ? key(item) : item[key];
      return String(value ?? '').toLowerCase().includes(query);
    });
  }

  private clearTimer() {
    if (this.filterTimer !== null) {
      clearTimeout(this.filterTimer);
      this.filterTimer = null;
    }
  }
}
