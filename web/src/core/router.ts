import { actions, ROUTER_ACTION } from './actions.js';

export interface RouteChangedAttributes {
  [key: string]: Record<string, string>;
}

export interface RouteChangedDetail {
  path: string;
  title: string;
  attributes: RouteChangedAttributes;
}

class SpaRouter {
  private currentPath = window.location.pathname;

  init() {
    document.addEventListener('click', (e) => {
      const path = e.composedPath();
      let anchor: HTMLAnchorElement | null = null;
      for (const el of path) {
        if (el instanceof HTMLAnchorElement && el.hasAttribute('href')) {
          anchor = el;
          break;
        }
      }
      if (!anchor) return;

      const href = anchor.getAttribute('href');
      if (!href) return;

      if (href.startsWith('http') || href.startsWith('mailto:') || href.startsWith('#')) return;
      if (anchor.target === '_blank') return;
      if (e.ctrlKey || e.metaKey || e.shiftKey) return;

      e.preventDefault();
      void this.navigate(href);
    });

    window.addEventListener('popstate', () => {
      void this.loadPage(window.location.pathname, false);
    });
  }

  async navigate(path: string) {
    if (path === this.currentPath) return;
    await this.loadPage(path, true);
  }

  private async loadPage(path: string, pushState: boolean) {
    try {
      const res = await fetch(path);
      if (!res.ok) return this.fallbackNavigate(path);

      const html = res.text ? await res.text() : '';
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, 'text/html');

      const newContent = doc.getElementById('main-content');
      const currentContent = document.getElementById('main-content');
      if (!newContent || !currentContent) return this.fallbackNavigate(path);

      const newTitle = doc.querySelector('title')?.textContent || document.title;
      const attributes = this.collectAttributes(newContent);

      // Remove old children (triggers disconnectedCallback on web components)
      while (currentContent.firstChild) {
        currentContent.removeChild(currentContent.firstChild);
      }
      // Move new children from parsed doc (preserves element references)
      while (newContent.firstChild) {
        currentContent.appendChild(newContent.firstChild);
      }
      document.title = newTitle;

      if (pushState) {
        history.pushState(null, '', path);
      }

      this.currentPath = path;
      actions.dispatch(ROUTER_ACTION.ROUTE_CHANGED, {
        path: this.currentPath,
        title: newTitle,
        attributes,
      } satisfies RouteChangedDetail);

      // Move keyboard focus into the content region so arrow/space scrolling
      // works immediately and a subsequent Tab starts from the page content
      // (links, media, buttons). New (pushed) navigations also reset scroll to
      // the top; popstate keeps the position the browser restores.
      requestAnimationFrame(() => {
        if (pushState) currentContent.scrollTop = 0;
        currentContent.focus({ preventScroll: true });
      });
    } catch {
      this.fallbackNavigate(path);
    }
  }

  private collectAttributes(content: HTMLElement): RouteChangedAttributes {
    const attributes: RouteChangedAttributes = {};
    const host = content.parentElement;
    if (!host) return attributes;

    for (const el of [host, ...Array.from(host.children)]) {
      if (!(el instanceof HTMLElement)) continue;

      const values = Array.from(el.attributes).reduce<Record<string, string>>((acc, attr) => {
        acc[attr.name] = attr.value;
        return acc;
      }, {});

      if (Object.keys(values).length > 0) {
        attributes[el.tagName.toLowerCase()] = values;
      }
    }

    return attributes;
  }

  private fallbackNavigate(path: string) {
    window.location.href = path;
  }
}

export const router = new SpaRouter();
