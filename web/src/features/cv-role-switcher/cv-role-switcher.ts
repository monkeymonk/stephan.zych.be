// Progressive enhancement for the CV role-variant switcher. The page ships a
// plain-links <nav class="sz-cv__variant-switcher"> (inside cv-body.njk,
// under the "Framing this CV for:" prompt) that works with JavaScript
// disabled — that markup is the source of truth and is never removed, only
// hidden once this enhancement has mounted.
//
// On a JS-capable visitor, the links are rebuilt as a native <select> in the
// same panel (each option's text is the variant's own label — "Application
// Architect" / "Fullstack PHP Developer" / etc. — already the plain-links
// nav's own link text, no extra data plumbing needed): a row of buttons
// reads fine for two or three short labels, but grows unwieldy once each
// variant carries a real role name instead of a one-word slug, so a select
// collapses the same choice into one compact, obviously-interactive control
// instead. Re-runs after each SPA navigation, same pattern as initMermaid in
// app/index.ts, since this is an SPA and the CV page can be reached by
// client-side routing, not just a fresh load.

import { router } from '../../core/router.js';

export function initCvRoleSwitcher(): void {
  const nav = document.querySelector<HTMLElement>('.sz-cv__variant-switcher');
  if (!nav || nav.hidden) return;

  const list = nav.querySelector<HTMLElement>('.sz-cv__variant-list');
  const items = Array.from(nav.querySelectorAll<HTMLLIElement>('.sz-cv__variant-item'));
  if (!list || items.length === 0) return;

  const select = document.createElement('select');
  select.id = 'sz-cv-role-select';
  select.name = 'cv-role';
  select.className = 'sz-cv__role-select';
  select.setAttribute('aria-label', nav.getAttribute('aria-label') || 'CV role variant');

  for (const item of items) {
    const link = item.querySelector<HTMLAnchorElement>('a.sz-cv__variant-link');
    const current = item.querySelector<HTMLSpanElement>('span.sz-cv__variant-link[aria-current]');
    const linkEl = link ?? current;
    const option = document.createElement('option');
    // The current variant's link renders as an aria-current <span> with no
    // href of its own — its destination is simply wherever we already are.
    option.value = link ? (link.getAttribute('href') ?? '') : window.location.pathname;
    option.textContent = linkEl?.textContent?.trim() ?? '';
    if (current) option.selected = true;
    select.appendChild(option);
  }

  select.addEventListener('change', () => {
    if (select.value) void router.navigate(select.value);
  });

  // `.sz-cv__variant-list { display: flex }` in cv.css has the same
  // specificity as the UA stylesheet's `[hidden] { display: none }` and
  // comes later in the cascade, so it would otherwise win — set display
  // directly rather than relying on the hidden attribute alone.
  list.hidden = true;
  list.style.display = 'none';
  list.insertAdjacentElement('afterend', select);
}
