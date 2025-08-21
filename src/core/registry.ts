// Central registry — single source of truth for configurable site data.

import { readJsonData } from './data.js';

export interface NavTab {
  index: number;
  name: string;
  path: string;
  icon?: string;
  key?: string;
}

export interface SocialLink {
  id: string;
  label: string;
  icon: string;
  url: string;
}

export interface StartScreenItem {
  id: string;
  label: string;
  icon: string;
  action: 'navigate' | 'external' | 'download';
  target: string;
}

export interface Shortcut {
  keys: string;
  description: string;
}

export interface SearchEntry {
  title: string;
  description: string;
  url: string;
  tags: string[];
  content: string;
}

const DEFAULT_NAV: NavTab[] = [
  { index: 0, name: 'home', path: '/', icon: 'terminal', key: 'h' },
  { index: 1, name: 'about', path: '/about/', icon: 'terminal', key: 'a' },
  { index: 2, name: 'projects', path: '/projects/', icon: 'folder', key: 'p' },
  { index: 3, name: 'blog', path: '/blog/', icon: 'file', key: 'b' },
  { index: 4, name: 'contact', path: '/contact/', icon: 'mail', key: 'c' },
];

const DEFAULT_WALLPAPERS: string[] = [
  '/assets/wallpapers/landscape-1.webp',
  '/assets/wallpapers/illustration-1.webp',
  '/assets/wallpapers/city-1.webp',
  '/assets/wallpapers/abstract-1.webp',
  '/assets/wallpapers/landscape-2.webp',
  '/assets/wallpapers/neon-cup.webp',
  '/assets/wallpapers/illustration-2.webp',
  '/assets/wallpapers/dark-room.webp',
  '/assets/wallpapers/landscape-3.webp',
  '/assets/wallpapers/keyboard.webp',
  '/assets/wallpapers/illustration-3.webp',
  '/assets/wallpapers/illustration-4.webp',
];

class Registry {
  private navItems: NavTab[] = [];
  private wallpaperItems: string[] = [];
  private searchEntries: SearchEntry[] = [];
  private searchLoaded = false;
  private searchLoading: Promise<void> | null = null;
  private initialized = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    const navData = readJsonData<{ tabs?: NavTab[] }>('sz-nav-data', {});
    this.navItems = navData.tabs ?? DEFAULT_NAV;
    this.wallpaperItems = readJsonData<string[]>('sz-wallpapers-data', DEFAULT_WALLPAPERS);
  }

  private ensureInit(): void {
    if (!this.initialized) {
      console.warn('[Registry] Accessed before init() — auto-initializing. Move registry.init() earlier in app/index.ts.');
      this.init();
    }
  }

  get nav(): readonly NavTab[] {
    this.ensureInit();
    return this.navItems;
  }

  get wallpapers(): readonly string[] {
    this.ensureInit();
    return this.wallpaperItems;
  }

  get searchIndex(): readonly SearchEntry[] {
    this.ensureInit();
    return this.searchEntries;
  }

  async getSearchIndex(): Promise<readonly SearchEntry[]> {
    this.ensureInit();
    if (this.searchLoaded) return this.searchEntries;
    if (!this.searchLoading) {
      this.searchLoading = fetch('/search-index.json')
        .then(res => res.json())
        .then((data: SearchEntry[]) => {
          this.searchEntries = data;
          this.searchLoaded = true;
        })
        .catch(() => {
          this.searchLoaded = true;
        });
    }
    await this.searchLoading;
    return this.searchEntries;
  }
}

export const registry = new Registry();
