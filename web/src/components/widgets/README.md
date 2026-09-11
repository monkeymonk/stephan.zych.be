# Content Widgets

Terminal-flavoured content blocks embedded in pages and articles. Every one is
data-agnostic: values arrive as attributes from the Eleventy template, so the
widget itself knows nothing about the site's content and never fetches at
runtime. All are lazily defined from `app/lazy-components.ts` and loaded per
page as their own esbuild chunk.

## Components

### `<sz-contact-card>`
Terminal contact card — `cat ~/.contact`, with copy-to-clipboard and a live
local clock.

**Attributes:** `email`, `github`, `linkedin` (strings)

### `<sz-copy>`
Inline copy-to-clipboard chip for commands and snippets.

**Attributes:** `text`: string — copied value; falls back to the slotted text

**Slots:** default — the visible text

### `<sz-gitlog>`
Career history rendered as `git log --graph`.

**Attributes:** `commits`: JSON array of `{ hash, ref?, message, date }`

### `<sz-neofetch>`
neofetch-style identity card.

**Attributes:** `user`: string · `rows`: JSON array of `[label, value]` pairs

### `<sz-stats>`
Animated counters and htop-style skill bars. Counts up when scrolled into view,
and respects `prefers-reduced-motion`.

**Attributes:** `counters`: JSON array of `{ value, suffix?, label }` ·
`skills`: JSON array of `{ name, level }`

### `<sz-wakapi>`
Coding activity from a self-hosted Wakapi instance. The numbers are fetched at
**build** time (`web/lib/wakapi.js`) and injected as attributes, so no API key
ever reaches the browser.

**Attributes:** `range`, `total`, `daily` (strings) · `languages`: JSON array of
`{ name, percent, text }`
