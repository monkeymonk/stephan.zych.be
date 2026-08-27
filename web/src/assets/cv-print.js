// Behaviour for /cv/print/ — the chrome-free page that exists only to be
// printed. Open the print dialog on load, and turn the shared
// "Print / Save as PDF" link into a direct window.print() (on the on-site /cv/
// page that same link just navigates here instead).
//
// This lives in a file rather than inline in cv-print.njk because the site's
// CSP is `script-src 'self' https://analytics.zych.be` — no 'unsafe-inline',
// so an inline script is blocked and the page silently never prints.
window.addEventListener('load', () => window.print());

document.querySelector('.sz-cv__download')?.addEventListener('click', (e) => {
  e.preventDefault();
  window.print();
});
