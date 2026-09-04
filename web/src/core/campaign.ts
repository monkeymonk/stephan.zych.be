/**
 * Strip campaign params (`utm_*`, `fbclid`, `gclid`) from the address bar once
 * the landing pageview has been recorded, so a visitor who hand-copies the URL
 * doesn't re-circulate someone else's campaign tag.
 *
 * Two orderings are load-bearing here — both come from umami's tracker:
 *
 * 1. Umami hooks `history.pushState` *and* `history.replaceState`, and re-tracks
 *    whenever the normalised URL string changes. Rewriting through the hooked
 *    `replaceState` would send a second pageview and double-count every campaign
 *    landing, so we capture the browser's own method at module-evaluation time:
 *    our module bundle runs before the classic `defer` umami tag in base.njk,
 *    i.e. before the hook exists. Keep that script order.
 * 2. Umami sends its first pageview when `document.readyState` flips to
 *    'complete', building the payload synchronously at that moment. That
 *    precedes the `load` event, so stripping from a `load` listener guarantees
 *    the utm-bearing URL was already captured.
 */

const nativeReplaceState = history.replaceState.bind(history);

const CAMPAIGN_PARAM = /^(utm_[a-z_]+|fbclid|gclid)$/i;

export function initCampaign(): void {
  window.addEventListener('load', () => {
    const url = new URL(location.href);
    // Materialise the keys first: deleting while iterating searchParams.keys()
    // skips entries.
    const removed = [...url.searchParams.keys()].filter((key) => CAMPAIGN_PARAM.test(key));
    if (!removed.length) return;
    for (const key of removed) url.searchParams.delete(key);
    nativeReplaceState(history.state, '', `${url.pathname}${url.search}${url.hash}`);
  });
}
