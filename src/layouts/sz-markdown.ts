import { LitElement, html } from 'lit';
import { customElement, property } from 'lit/decorators.js';

@customElement('sz-markdown')
export class SzMarkdown extends LitElement {
  @property({ type: Boolean, attribute: 'line-numbers' }) lineNumbers = false;

  private _gutter: HTMLDivElement | null = null;
  private _content: HTMLDivElement | null = null;
  private _resizeObserver: ResizeObserver | null = null;

  createRenderRoot() {
    return this;
  }

  connectedCallback() {
    super.connectedCallback();
    this.classList.add('sz-prose');
    if (this.lineNumbers) {
      this.classList.add('sz-prose--numbered');
    }
    this.trimLeadingWhitespace();
    requestAnimationFrame(() => this.enhanceContent());
  }

  disconnectedCallback() {
    super.disconnectedCallback();
    this._resizeObserver?.disconnect();
  }

  private trimLeadingWhitespace() {
    while (this.firstChild &&
           this.firstChild.nodeType === Node.TEXT_NODE &&
           !this.firstChild.textContent?.trim()) {
      this.firstChild.remove();
    }
  }

  private enhanceContent() {
    this.enhanceHeadings();
    this.enhanceLinks();
    this.enhanceCheckboxes();
    this.wrapIframes();
    this.numberCodeBlocks();

    if (this.lineNumbers) {
      this.addLineNumbers();
    }
  }

  // Per-code-block line numbers. The document gutter (code view) already
  // numbers these lines, so CSS shows this only in the reading/glow view
  // where that gutter is hidden.
  private numberCodeBlocks() {
    const blocks = this.querySelectorAll<HTMLElement>('pre[class*="language-"]');
    for (const pre of blocks) {
      if (pre.dataset.numbered) continue;
      const code = pre.querySelector('code');
      if (!code) continue;
      const lineCount = (code.textContent ?? '').replace(/\n+$/, '').split('\n').length;
      if (lineCount < 2) continue;
      const gutter = document.createElement('span');
      gutter.className = 'code-gutter';
      gutter.setAttribute('aria-hidden', 'true');
      let inner = '';
      for (let i = 1; i <= lineCount; i++) inner += `<span>${i}</span>`;
      gutter.innerHTML = inner;
      pre.insertBefore(gutter, pre.firstChild);
      pre.classList.add('has-code-numbers');
      pre.dataset.numbered = 'true';
    }
  }

  private enhanceHeadings() {
    const headings = this.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6');
    for (const h of headings) {
      if (h.dataset.enhanced) continue;
      h.dataset.enhanced = 'true';
      const level = parseInt(h.tagName[1]);
      h.classList.add('sz-heading', `sz-heading--${level}`);
      const indicator = document.createElement('span');
      indicator.className = 'sz-heading-indicator';
      indicator.textContent = '#'.repeat(level);
      indicator.setAttribute('aria-hidden', 'true');
      h.prepend(indicator);
    }
  }

  private enhanceLinks() {
    const links = this.querySelectorAll<HTMLAnchorElement>('a[href]');
    for (const a of links) {
      if (a.dataset.enhanced) continue;
      a.dataset.enhanced = 'true';
      if (a.closest('.sz-heading-indicator') || a.classList.contains('footnote-ref')) continue;

      const href = a.getAttribute('href') || '';
      const isExternal = /^https?:\/\//.test(href) && !href.includes(location.hostname);

      const icon = document.createElement('span');
      icon.className = 'sz-link-icon';
      icon.setAttribute('aria-hidden', 'true');
      icon.textContent = isExternal ? '🌐' : '🔗';
      a.prepend(icon);
    }
  }

  private enhanceCheckboxes() {
    const checkboxes = this.querySelectorAll<HTMLInputElement>('.task-list-item input[type="checkbox"]');
    for (const cb of checkboxes) {
      if (cb.dataset.enhanced) continue;
      cb.dataset.enhanced = 'true';
      const icon = document.createElement('span');
      icon.setAttribute('aria-hidden', 'true');
      if (cb.checked) {
        icon.className = 'sz-checkbox sz-checkbox--checked';
        icon.textContent = '';
      } else {
        icon.className = 'sz-checkbox sz-checkbox--unchecked';
        icon.textContent = '';
      }
      cb.parentElement?.insertBefore(icon, cb);
      cb.style.display = 'none';
    }
  }

  private wrapIframes() {
    const style = getComputedStyle(this);
    const fontSize = parseFloat(style.fontSize) || 13;
    const lineHeight = parseFloat(style.lineHeight) || fontSize * 1.6;

    const iframes = this.querySelectorAll<HTMLIFrameElement>('iframe:not(.embed-container iframe)');
    for (const iframe of iframes) {
      if (iframe.parentElement?.classList.contains('embed-container')) continue;
      const wrapper = document.createElement('div');
      wrapper.className = 'embed-container';
      // Snap to nearest line-height multiple (aim for ~16:9 at ~20 lines)
      const lines = Math.round((wrapper.clientWidth || 600) * 9 / 16 / lineHeight) || 20;
      const height = lines * lineHeight;
      wrapper.style.paddingBottom = `${height}px`;
      iframe.parentElement?.insertBefore(wrapper, iframe);
      wrapper.appendChild(iframe);
    }
  }

  private addLineNumbers() {
    const content = document.createElement('div');
    content.className = 'sz-content';
    while (this.firstChild) {
      content.appendChild(this.firstChild);
    }

    const gutter = document.createElement('div');
    gutter.className = 'sz-gutter';
    gutter.setAttribute('aria-hidden', 'true');

    this.appendChild(gutter);
    this.appendChild(content);

    this._gutter = gutter;
    this._content = content;

    this._resizeObserver = new ResizeObserver(() => this.updateLineNumbers());
    this._resizeObserver.observe(content);

    const images = content.querySelectorAll('img');
    for (const img of images) {
      if (!img.complete) {
        img.addEventListener('load', () => this.updateLineNumbers(), { once: true });
        img.addEventListener('error', () => this.updateLineNumbers(), { once: true });
      }
    }
  }

  private updateLineNumbers() {
    const gutter = this._gutter;
    const content = this._content;
    if (!gutter || !content) return;

    const style = getComputedStyle(content);
    const fontSize = parseFloat(style.fontSize) || 13;
    // getComputedStyle may return unitless "1.6" or resolved "20.8px"
    let lineHeight = parseFloat(style.lineHeight);
    if (!lineHeight || lineHeight < fontSize) {
      lineHeight = fontSize * (lineHeight || 1.6);
    }
    const contentHeight = content.scrollHeight;
    const lineCount = Math.round(contentHeight / lineHeight);

    const currentCount = gutter.children.length;
    if (currentCount === lineCount) return;

    const spans: string[] = [];
    for (let i = 1; i <= lineCount; i++) {
      spans.push(`<span>${i}</span>`);
    }
    gutter.innerHTML = spans.join('');
  }

  render() {
    return html``;
  }
}
