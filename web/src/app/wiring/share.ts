import { copyText } from '../../core/clipboard.js';
import { isInputFocused } from '../../core/keyboard.js';

declare global {
  interface Window {
    umami?: { track: (name: string, data?: Record<string, unknown>) => void };
  }
}

// The four outbound share links are tracked declaratively with
// data-umami-event, but the copy control cannot be: umami listens on the
// capture phase and, for a tagged anchor that isn't target="_blank", it
// preventDefaults and then assigns location.href after sending the event —
// which would hard-reload the page on every copy. So it tracks manually.
// umami is optional-chained throughout: the script is absent in dev when
// site.analyticsId is unset, and blocked by some ad blockers.
function copyShareUrl(anchor: HTMLAnchorElement) {
  void copyText(anchor.href, '✓ Link copied to clipboard');
  window.umami?.track('share', { network: 'copy' });
}

// Copy-link control in the article share rows. Both listeners sit on document
// and stay valid across SPA navigation — the router swaps only #main-content,
// so there is nothing to re-wire on route change.
export function wireShare(): () => void {
  const onClick = (e: MouseEvent) => {
    // The share row renders both inside <sz-markdown> and in the plain-DOM
    // footer, so walk the composed path rather than matching e.target.
    let anchor: HTMLAnchorElement | null = null;
    for (const el of e.composedPath()) {
      if (el instanceof HTMLAnchorElement && el.classList.contains('js-share-copy')) {
        anchor = el;
        break;
      }
    }
    if (!anchor) return;

    e.preventDefault();
    copyShareUrl(anchor);
  };

  const onKeydown = (e: KeyboardEvent) => {
    if (e.key !== 'y' || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    if (isInputFocused()) return;
    // Scoped by presence, not by page type: no copy control, no shortcut.
    const anchor = document.querySelector<HTMLAnchorElement>('.js-share-copy');
    if (!anchor) return;

    e.preventDefault();
    copyShareUrl(anchor);
  };

  document.addEventListener('click', onClick);
  document.addEventListener('keydown', onKeydown);
  return () => {
    document.removeEventListener('click', onClick);
    document.removeEventListener('keydown', onKeydown);
  };
}
