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

const DEFAULT_SOCIAL: SocialLink[] = [];

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

const DEFAULT_SHORTCUTS: Shortcut[] = [
  { keys: ':', description: 'Open command palette' },
  { keys: '/', description: 'Search pages and content' },
  { keys: '?', description: 'Show help' },
  { keys: 'Esc', description: 'Close palette / search' },
  { keys: 'Tab', description: 'Autocomplete command / cycle args' },
  { keys: 'Alt+1-5', description: 'Switch tabs' },
  { keys: 'Alt+W', description: 'Toggle windowed / full-page' },
  { keys: 'Alt+F', description: 'Toggle fullscreen' },
  { keys: 'Alt+N', description: 'Next wallpaper' },
];

class Registry {
  private navItems: NavTab[] = [];
  private socialLinks: SocialLink[] = [];
  private wallpaperItems: string[] = [];
  private shortcutItems: Shortcut[] = [];
  private searchEntries: SearchEntry[] = [];
  private startScreenData: StartScreenItem[] = [];
  private searchLoaded = false;
  private searchLoading: Promise<void> | null = null;
  private initialized = false;
  private session = 'stephan.zych';
  private coffee = '';
  private repoAddress = '';
  private emailAddress = '';

  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    const navData = readJsonData<{ tabs?: NavTab[]; sessionName?: string; coffeeUrl?: string }>('sz-nav-data', {});
    this.navItems = navData.tabs ?? DEFAULT_NAV;

    const siteData = readJsonData<{
      email?: string;
      repoUrl?: string;
      coffeeUrl?: string;
      author?: string;
      socials?: { github?: string; linkedin?: string; email?: string };
    }>('sz-site-data', {});

    this.session = navData.sessionName ?? siteData.author ?? 'unknown';
    this.coffee = navData.coffeeUrl ?? siteData.coffeeUrl ?? '';
    this.repoAddress = siteData.repoUrl ?? '';
    this.emailAddress = siteData.email ?? '';

    if (siteData.socials) {
      const socials: SocialLink[] = [];
      if (siteData.socials.github) socials.push({ id: 'github', label: 'GitHub', icon: 'github', url: siteData.socials.github });
      if (siteData.socials.linkedin) socials.push({ id: 'linkedin', label: 'LinkedIn', icon: 'linkedin', url: siteData.socials.linkedin });
      if (siteData.email) socials.push({ id: 'email', label: 'Email', icon: 'mail', url: `mailto:${siteData.email}` });
      if (socials.length > 0) this.socialLinks = socials;
    }
    if (!this.socialLinks.length) {
      this.socialLinks = readJsonData<SocialLink[]>('sz-social-data', DEFAULT_SOCIAL);
    }

    this.wallpaperItems = readJsonData<string[]>('sz-wallpapers-data', DEFAULT_WALLPAPERS);
    this.startScreenData = readJsonData<{ items?: StartScreenItem[] }>('sz-start-screen-data', {}).items ?? [];
    this.shortcutItems = [...DEFAULT_SHORTCUTS];
  }

  private ensureInit(): void {
    if (!this.initialized) {
      console.warn('[Registry] Accessed before init() — auto-initializing. Move registry.init() earlier in app/index.ts.');
      this.init();
    }
  }

  get sessionName(): string {
    this.ensureInit();
    return this.session;
  }

  get coffeeUrl(): string {
    this.ensureInit();
    return this.coffee;
  }

  get repoUrl(): string {
    this.ensureInit();
    return this.repoAddress;
  }

  get email(): string {
    this.ensureInit();
    return this.emailAddress;
  }

  get nav(): readonly NavTab[] {
    this.ensureInit();
    return this.navItems;
  }

  get social(): readonly SocialLink[] {
    this.ensureInit();
    return this.socialLinks;
  }

  get wallpapers(): readonly string[] {
    this.ensureInit();
    return this.wallpaperItems;
  }

  get startScreenItems(): readonly StartScreenItem[] {
    this.ensureInit();
    return this.startScreenData;
  }

  get shortcuts(): readonly Shortcut[] {
    this.ensureInit();
    return this.shortcutItems;
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

  registerShortcut(shortcut: Shortcut): void {
    this.ensureInit();
    if (!this.shortcutItems.find(item => item.keys === shortcut.keys)) {
      this.shortcutItems.push(shortcut);
    }
  }
}

export const registry = new Registry();
