# cv-role-switcher

Progressive enhancement for the CV's role-variant switcher: the page always
ships a working plain-links `<nav class="sz-cv__variant-switcher">` inside
`cv-body.njk` (no-JS baseline); on a JS-capable visitor `initCvRoleSwitcher()`
rebuilds it as a native `<select>` in the same panel, since a row of buttons
stops reading well once each option carries a full role name instead of a
short slug. Called on initial load and again after each SPA route change
(`ROUTER_ACTION.ROUTE_CHANGED`), matching `initMermaid`'s pattern in
`app/index.ts` — the router replaces `#main-content` wholesale on navigation,
so every call sees a fresh, unenhanced DOM.
