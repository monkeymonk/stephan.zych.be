// Print-time DOM fixes for the whole site. Nothing here runs on screen; it all
// hangs off the print signal, and styles/print.css does the rest.
//
// Four things print.css cannot do, because they are DOM state or DOM data
// rather than style:
//
//   1. sz-markdown.enhanceImages() forces loading="lazy" onto every prose
//      image. A print render never scrolls, so an image that was still below
//      the fold is simply absent from the output — the exact bug already
//      documented at _includes/cv-body.njk:6.
//   2. A closed <details> prints closed. Month groups the reader folded on
//      /blog/, and collapsed prose sections, would silently drop out.
//   3. An <iframe> is a replaced element: it has no ::after, so its src cannot
//      be printed as a caption from CSS. Copy it onto the wrapper, which can.
//   4. CSS cannot compare a link's visible text to its own href, so it cannot
//      tell which external links already show their URL and must not have it
//      appended a second time.
//
// This lives in a file rather than inline in base.njk because the site's CSP is
// `script-src 'self' https://analytics.zych.be` — no 'unsafe-inline', so an
// inline script is blocked and the page silently prints wrong.

// Both triggers are needed and they are not redundant: Chromium fires the
// media-query change when it builds the print preview (and when a tool
// emulates print media, which is how this is tested) but is unreliable about
// beforeprint ordering, while Firefox and Safari deliver beforeprint. Whoever
// fires first wins; the work is idempotent.
const printMedia = window.matchMedia('print');

// <details> this script opened, so afterprint can put them back exactly as the
// reader left them.
const opened = new Set();

function textWithoutIcon(a) {
  // enhanceLinks() prepends a 🌐/🔗 span to every prose link, so textContent
  // alone never equals the href.
  let out = '';
  for (const node of a.childNodes) {
    if (node.nodeType === Node.ELEMENT_NODE && node.classList.contains('sz-link-icon')) continue;
    out += node.textContent || '';
  }
  return out.trim();
}

function prepare() {
  for (const img of document.querySelectorAll('sz-markdown img, .sz-article__hero img')) {
    img.removeAttribute('loading');
    img.decoding = 'sync';
    if (!img.complete) img.decode?.().catch(() => {});
  }

  for (const details of document.querySelectorAll('details:not([open])')) {
    details.open = true;
    opened.add(details);
  }

  for (const frame of document.querySelectorAll('.embed-container iframe[src]')) {
    if (frame.parentElement) frame.parentElement.dataset.printSrc = frame.src;
  }

  for (const a of document.querySelectorAll('sz-markdown a[href^="http"]')) {
    const href = a.getAttribute('href') || '';
    const text = textWithoutIcon(a);
    const bare = href.replace(/^https?:\/\//, '').replace(/\/$/, '');
    if (text === href || text === bare) {
      a.dataset.printSelfurl = '';
    } else {
      delete a.dataset.printSelfurl;
    }
  }
}

function restore() {
  for (const details of opened) details.open = false;
  opened.clear();
}

printMedia.addEventListener('change', (e) => (e.matches ? prepare() : restore()));
window.addEventListener('beforeprint', prepare);
window.addEventListener('afterprint', restore);
