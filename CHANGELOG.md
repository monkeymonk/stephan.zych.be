# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The version of record is the latest `vX.Y.Z` git tag, kept in sync with
`web/package.json`.

## [Unreleased]

## [1.8.0] - 2026-09-05

### Added
- Printing the on-site CV — `Ctrl+P` on `/cv/`, the browser's own print
  command, anything — now produces the **résumé print version** rather than a
  de-terminalised screen CV: pixel-for-pixel the same document `/cv/print/`
  serves, verified page by page. `styles/cv.css` and `styles/cv-print.css` are
  the two twins over one markup source (`_includes/cv-body.njk`), so they are
  now linked at `media="screen"` and `media="print"` respectively instead of
  both reaching paper and fighting in the cascade.
- A **print stylesheet for the whole site**. Any article, project or page now
  prints as a typeset document instead of one clipped page of terminal chrome:
  sans-serif prose with a real heading size ramp, monospace kept for code, code
  blocks that wrap instead of running off the page edge, external link
  addresses written out beside their text, and page breaks that never strand a
  heading at the foot of a page. Six components carry their own `@media print`
  block because their internals live in a shadow root a document stylesheet
  cannot reach. Two traps worth recording: an article's header exists twice in
  the DOM (the reading view and its markdown-source twin), so the sheet pins
  one and a reader in either view gets the same paper; and `/blog/` would have
  printed only the first ten posts, because the lazy-load window hides the rest
  with an inline style. `/cv/print/` is untouched — it was already right.
- Jump-scroll keys — <kbd>gg</kbd>, <kbd>G</kbd>, <kbd>Home</kbd>,
  <kbd>End</kbd> — plus a tap-to-top control in the mobile titlebar, and
  <kbd>j</kbd>/<kbd>k</kbd> finally documented in the shared keymap after
  existing undocumented since the keyboard layer was written.
- A switch for the single-key shortcuts (`:set keys off`, or the control in the
  tmux bar). The vim bindings stay on by default — they are the point of the
  site — but unmodified single characters are a WCAG 2.1.4 failure without a way
  off: they kill the browser's own type-ahead-find, and a keystroke passed
  through by assistive tech navigates the page out from under its reader. The
  modified bindings (<kbd>Alt+1-5</kbd>, <kbd>Alt+W/F/N</kbd>) are unaffected.
- `npm run check:a11y` — an accessibility gate that fails the build on any WCAG
  violation across 8 routes × 3 themes × 2 viewports, any Lighthouse
  accessibility regression against `audit/baseline.json`, or any of 22
  behavioural checks that static scanning cannot express: a real Tab journey
  through the composed tree, dialog focus handling, the scroll model at both
  widths, and print output. It exists because the trap below sat behind a 92-97
  Lighthouse score for months — axe reads a static DOM, and never once pressed a
  key. Deliberately not part of `npm run build`, on the same reasoning as
  `check:assets`.

### Changed
- The CV contact row carries the **real LinkedIn and GitHub addresses** instead
  of the words "LinkedIn" and "GitHub", matching the two rows above it (email,
  website) and the SSH TUI, which already rendered them that way. The words
  were dead ink on a printed CV: an address the reader cannot click is worth
  nothing without the URL beside it.
- Links inside prose are **underlined**. They were distinguished from body text
  by colour alone at a 1.45:1 difference — a WCAG 1.4.1 failure, and invisible
  to a reader who does not separate those two hues. The underline is 1px,
  dimmed to 45% and offset 3px, so it reads as a link without reading as 1995.
- Muted text that a reader is actually meant to read moved onto a new per-theme
  `--sz-muted` token. `--sz-overlay0`/`1`/`2` keep their canonical Catppuccin,
  Gruvbox and TokyoNight values and are now **decoration only** — borders,
  gutters, glyphs, separators. Article dates, reading times, breadcrumbs, code
  comments, the command palette's hints and paths were all real content
  rendered in decoration tokens, some as low as 2.15:1.
- The project index watermark numbers are generated content rather than DOM
  text. They are a background flourish carrying no information, and as real
  text the only way to pass contrast was to make a watermark as legible as the
  prose. As a counter they also renumber contiguously when the list is
  filtered, where the old build-time index left gaps.
- The mobile tap-to-top control now appears only once you are more than half a
  viewport down, and sits flush against the right edge of the screen rather
  than inset by the titlebar's notch padding. Parked at the top of the page it
  was a no-op occupying a tab stop.

### Fixed
- Archive pages overflowed **horizontally by 12px** at phone width. The filter
  row is full-bleed so it can scroll edge to edge, and it got there with
  negative margins cancelling the host's padding — which works only while
  something clips, and nothing does since the host stopped being a scroller.
  The knock-on was the reported vertical symptom: a horizontal scrollbar eats
  vertical space, which pushes `100dvh` content past the fold and parks the
  fixed tab bar underneath it. Children carry their own inset now.
- The mobile search button never closed the palette, and on a cold phone load
  did nothing at all. Two separate faults: the palette's outside-click handler
  runs in the **capture** phase, so it hid the palette *before* the button's own
  handler re-opened it — a toggle that could only open; and the palette module
  was bundled as desktop-only, so on a phone the button was a visible, labelled
  control with nothing behind it unless the session happened to start at desktop
  width. It now lazy-loads on first press, toggles, and reports `aria-expanded`.
- Mermaid leaves a global tooltip `div` on `<body>` and styles it only inside
  the rendered SVG's scope, so at document level it was an unstyled in-flow
  block. It outlived its diagram: after visiting any page with one, every later
  page carried 6px of phantom scroll extent.
- **Tapping the status bar on iOS no longer does nothing.** The whole UI hung
  off a `position: fixed` window with `html, body { overflow: hidden }`, so the
  document had *zero* scroll extent and the real scroller was a `<main>` five
  boxes deep behind two shadow roots. iOS delivers that gesture to the main
  frame's scroll view only and never walks into an `overflow: auto` subtree, so
  it was a silent no-op. Under 768px the document scrolls again and the chrome
  is pinned. Three more symptoms of the same root cause went with it: the URL
  bar never collapsed, there was no pull-to-refresh, and Back always dumped you
  at the top of the page. Content below the fold is now also reachable with
  JavaScript disabled, which it was not.
- **A permanent keyboard trap** around the terminal window (WCAG 2.1.2, level
  A). The focus trap armed on the first <kbd>Tab</kbd> and was never released,
  so the skip link, the wallpaper controls and the Terms & Conditions and
  Privacy links were unreachable by keyboard for the rest of the session. It
  now arms only for a genuinely modal window, releases on <kbd>Esc</kbd>, and
  returns focus to whatever opened it.
- **`/404.html` rendered none of its own content.** The whole page body was
  written as light-DOM children of a component that has no `<slot>`, so it was
  silently dropped for every visitor the moment the component upgraded; all a
  reader ever saw was a stray line of keyboard hints. It is now plain markup
  with a real `<h1>`, and its ASCII slab is hidden from screen readers instead
  of being read out as 150 box-drawing characters.
- A closed terminal window stayed focusable and readable by screen readers —
  invisible, but still in the tab order behind the start screen. It is `inert`.
- The link picker declared itself a modal dialog but never moved focus into
  itself, which told assistive tech to hide the page *and* left the dialog
  unreachable. It manages and restores focus properly, as does the diagram
  lightbox, which had no dialog semantics at all.
- Landmarks and headings: the site had exactly one landmark, and its primary
  navigation contributed none at all because a `role="tablist"` was overriding
  it. `/`, `/blog/` and `/projects/` had no `<h1>`, and the projects list
  started at `<h3>`.
- Client-side navigation is announced to screen readers. It updated the title
  and moved focus, but said nothing; the only thing that spoke was the status
  bar accidentally re-reading `NORMAL ~/path` on every route change.
- Diagrams rendered at roughly one fifth their size for anyone with
  `prefers-reduced-motion` set — a transition on the SVG was still settling
  when Mermaid measured the graph, and the reduced-motion path skipped the
  animation that used to hide it.
- The copyright and legal links sat `position: fixed` over a rotating
  wallpaper photograph at unbounded contrast, and lost their focus ring
  entirely. They now have a backdrop and a real indicator.
- `prefers-contrast` and `forced-colors` are honoured. In Windows High Contrast
  Mode the `color-mix()` focus tints and `box-shadow` rings vanished completely,
  leaving no focus indicator anywhere.
- The CV contact links were under the 24×24px minimum touch target (WCAG 2.5.8).

## [1.7.0] - 2026-09-05

### Added
- The SSH TUI now reports audience measurement too, so terminal readers show up
  next to browser ones. It posts to the **same** Umami website as the web build
  over the internal compose network (`umami:3000` — no public egress, no new
  secret), using the website id already in `content/data/site.json` and the
  canonical web permalinks (`/blog/<slug>/`, `/projects/`, …) so one URL row
  counts reads from both surfaces. The two are told apart by tag — `tui` on
  every SSH event, `web` on the browser tag — and per-session counting uses a
  `crypto/rand` UUID rather than the visitor's IP, which is never forwarded.
  Terminal size is reported as the screen dimension; session start/end give
  visit duration. Tracking is silently off when `UMAMI_URL` is unset, and every
  failure — full queue, dead collector, timeout — is dropped without ever
  touching the input path.

### Fixed
- The privacy notice was inaccurate: it claimed the site runs **no analytics
  script in the browser** and documented only the masked-access-log/GoAccess
  measurement path, both of which stopped being true when self-hosted Umami was
  added four days after that notice was written. `/privacy/` now describes both
  systems, and spells out what the Umami script does and does not touch on the
  device (no cookie, no write to `localStorage`/`sessionStorage`, only a read of
  the optional `umami.disabled` opt-out flag) plus how to opt out. No change to
  what is actually collected — the notice now matches it.
- The Umami tag now honours **`Do Not Track`**. Umami's DNT check is gated
  behind the `data-do-not-track` attribute, which the tag never set — so a
  browser sending DNT had its signal read and ignored. With the attribute in
  place the script sends nothing at all for those visitors, and `/privacy/` says
  so.
- The TL;DR of *The Cookie Banner Was Always Optional* still claimed the browser
  runs **zero analytics JavaScript**, contradicting the post's own Umami section
  further down (added days later, when Umami landed). The summary now matches
  the body.

## [1.6.0] - 2026-09-04

### Added
- A build-time gate on content social-preview art: a post whose `poster` or
  `ogImage` is missing, malformed, or points at a file that isn't in the repo
  (or a project missing its `poster`) now fails the deploy gate instead of
  silently shipping with no social-preview image — LinkedIn's crawler renders
  WebP link previews unreliably, so the `.jpg` `ogImage` twin is mandatory
  alongside the `.webp` poster. Run it locally with `npm run check:assets`;
  it is deliberately not part of `npm run build`, so drafting a post before
  its art exists still builds.
- A copy-link control in the blog article share row, rendered as a real link so
  the browser's own "copy link address" works and it still functions with
  JavaScript disabled. It copies the clean canonical URL — never the campaign
  parameters the visitor may have arrived with.
- <kbd>y</kbd> copies the current article's URL in both renderers — the web
  reader and the SSH TUI, which puts it on the client's clipboard over OSC 52
  and echoes it in the status line for terminals that ignore the sequence.
- Share-intent tracking: clicking a share target (LinkedIn, X, Bluesky, email,
  or copy) records a `share` event with the network, so outgoing shares are
  measurable and not just inbound landings.

### Fixed
- The email share link tagged itself `utm_medium=social`; it now says `email`.
  The utm parameters were assembled as a pre-urlencoded literal, which is what
  hid the wrong value — they are now built readably from the canonical URL.
- Campaign parameters (`utm_*`, `fbclid`, `gclid`) are now cleared from the
  address bar once the landing page view has been recorded, so they no longer
  travel along when a visitor copies the URL and shares it themselves.
- The SSH TUI never actually copied anything to the client's clipboard. The
  OSC 52 escape was prefixed onto the rendered frame, but bubbletea's renderer
  resets its frame buffer on every message and only flushes on the framerate
  ticker, so the frame carrying the sequence was overwritten before it could
  reach the wire — the status line said `copied:` while the clipboard stayed
  untouched. The escape is now written straight to the session. This also
  repairs copying an external link out of an article's link list.

### Security
- Bumped `golang.org/x/crypto` 0.55.0 → 0.56.0 in the TUI, clearing GO-2026-6354
  and GO-2026-6355 — two SSH channel-deadlock DoS advisories reachable through
  `tui.runSSH` → `ssh.Server.ListenAndServe` → `ssh.NewServerConn`, published
  after the 0.55.0 bump and failing the `govulncheck` gate. `x/crypto` 0.56.0
  requires a `go 1.26.0` directive (Go orders `1.26` before `1.26.0`), so
  `tui/go.mod` states the patch version; CI and the Docker builder already pin
  Go 1.26.6.

## [1.5.1] - 2026-09-03

### Security
- Bumped `golang.org/x/crypto` 0.52.0 → 0.55.0 in the TUI, clearing GO-2026-6303
  — reachable through `tui.runSSH` → `ssh.Server.ListenAndServe` → the SSH
  server handshake — which was failing the `govulncheck` deploy gate.

### Fixed
- The article outline rail (`sz-toc`) appended a stray `§` to every entry on a
  hard page load: it stripped the heading's `##` level indicator but not the
  `§` permalink `sz-markdown` injects alongside it. Whether the leak showed
  depended on load order — on SPA navigation the outline was collected before
  the permalinks existed — so both chrome nodes are now stripped unconditionally.

## [1.5.0] - 2026-08-31

### Changed
- The CV now separates capabilities from technologies. In the shared source
  (`content/data/cv.json`), `expertise` moved from a flat list to labelled
  groups — the shape `skills` already used — and the technology stack is grouped
  into five curated categories instead of seven exhaustive ones. All three
  renderers follow: the web include, the `/cv.md` export, and the Go/TUI
  generator.
- Reworked the CV's section set and order: a new **Selected engineering work**
  section (backed by a new `evidence` key, with optional source links) sits
  after Work experience, "Digital skills" became **Technical stack** and moved
  above Education, and the Interests section is gone. Nine sections, still in
  lockstep across the three renderers per the `check:cv` drift guard.
- Editorial pass over the CV copy: a shorter summary, deduplicated capability
  lists, tightened role bullets and a curated stack. The printed CV is back to
  **3 A4 pages** from 5, with no change to font size, line-height or margins.
- Updated the `/cv/` meta description to match the page's wording.

### Fixed
- The printed CV wasted up to a full page of blank space: `.sz-cv__job` and
  `.sz-cv__job-group` were `break-inside: avoid`, so a role — or a single bullet
  group — that no longer fit in a page remainder jumped whole to the next page.
  Nothing inside a role is atomic now; what is pinned instead is every
  heading-to-body join (`break-after: avoid` on the job title, its meta line and
  each group label), and individual bullets, which never split mid-item.
- The CV photo carried `loading="lazy"` despite sitting above the fold, so a
  print/PDF render that never scrolls the print page dropped it silently.
- Copy and typography nits in the CV source: a hyphenated compound that broke
  across a line as "long-" / "term", ASCII quotes where the printed page wants
  typographic ones, and a non-parallel bullet construction.

## [1.4.2] - 2026-08-27

### Fixed
- `/cv/` rendered unstyled when reached by in-page navigation (the `/cv/` links on
  `about` and `whoami`) instead of a fresh load. The SPA router replaces only
  `#main-content` and never touched `<head>`, so `cv.css` — which `base.njk`
  emits per page — was never loaded, leaving the CV with base styles only.
  Page-scoped stylesheets now carry a `page-css-*` id, and the router adopts
  whichever one the destination page needs but the current document lacks,
  waiting for a linked sheet so the new content is never painted unstyled. This
  also restores syntax highlighting when an article is reached from a page that
  carries no Prism styles — the same latent bug, one page-scoped stylesheet over.
- `/cv/print/` never opened the print dialog, and its "Print / Save as PDF"
  button did nothing. The behaviour was an inline `<script>`, and the site's CSP
  (`script-src 'self' https://analytics.zych.be`, with no `'unsafe-inline'`)
  blocks inline execution. Moved to `/assets/cv-print.js`, served from `'self'`;
  the CSP is unchanged.

## [1.4.1] - 2026-08-27

### Fixed
- The `szych-web` image build failed on v1.4.0: `npm run build` ran the CV drift
  guard, which reads `tui/cv.go`, but the web image's build context deliberately
  contains only `content/` and `web/` — so the check hit
  `ENOENT: /repo/tui/cv.go` and took the build (and therefore the deploy) down.
  The guard is a repo-level, cross-renderer check, so it moved out of
  `npm run build` into its own `check-cv` CI job over the full checkout, and
  `deploy` now waits on it — the same "cannot be skipped" guarantee, in the one
  place that can actually see all three renderers.

### Security
- Bumped the TUI's Go toolchain 1.26.5 → 1.26.6 (CI `setup-go` + `golang` base
  image) and `golang.org/x/net` 0.54.0 → 0.55.0, clearing five reachable
  standard-library vulnerabilities reported by `govulncheck` — GO-2026-6218
  (`net/url` quadratic `resolvePath`), GO-2026-6090 (`crypto/tls`
  post-handshake messages), GO-2026-6088 (`encoding/xml`), GO-2026-5972
  (`encoding/asn1`), and GO-2026-5026 (`net/http` + `x/net`). Reachable via
  `tui.FetchWakapi` and Glamour's markdown rendering.

## [1.4.0] - 2026-08-27

### Added
- CV / résumé page at `/cv/` (web) and a matching `cv` screen in the TUI, both rendered from a single structured source, `content/data/cv.json`. Europass-informed structure (Work experience, Education & training, Digital/Language skills) with CEFR language levels, covering version control & CI/CD alongside the frontend/backend/infrastructure stack. Reached from the `about` and `whoami` pages — deliberately not a top-nav tab.
- The page is styled in the site's own vocabulary rather than as a foreign document: the identity block is framed as a `❯ whoami --full` panel (the same chrome the content widgets use), section headings carry prose's `##` indicator and tinted band, work experience runs down a timeline rail with one marker per role, lists use the site's `●`/`○` markers, skills render as the article tag chip, and all vertical spacing sits on the `--sz-line-px` line grid.
- Plain-text/Markdown résumé at `/cv.md` — `curl stephan.zych.be/cv.md` returns the CV, generated from the same source.
- Print-optimised `/cv/print/` page: a chrome-free A4 layout with a "Print / Save as PDF" button, so the reader exports a clean PDF straight from the browser — no committed binary, no typesetting toolchain, always in sync with the data.
- Rich `Person`/`ProfilePage` JSON-LD on `/cv/` (occupation, employer, education, skills).
- `npm run check:cv` drift guard (wired into `build`) — fails if the shared headline facts, or the CV section headings across the web/TUI/Markdown renderers, drift apart.

### Changed
- The rendered **html** view is now the site-wide default (it was the line-numbered **markdown**/code view). Pages ship `data-view="reading"` in the markup, so first paint — and a no-JS visit, where the code view's line-number gutter is never generated — already lands on the rendered view. A visitor who picks **markdown** still gets it back on the next page.
- Retitled the internal styleguide page to just "Styleguide" — it no longer opens in the code view.

### Security
- Bumped `golang.org/x/text` 0.37.0 → 0.39.0 in the TUI to clear GO-2026-5970, reachable via `tui.main` → `log.Warn` → `norm.Form.Properties`, which was failing the deploy's `govulncheck` gate.

## [1.3.1] - 2026-08-02

### Added
- New post: "Typing Got Cheap. Judgement Didn't." (`/blog/terminal-agent-workbench/`) — review as the scarce resource once agents do the typing, and the terminal workflow built around it: a worktree per agent (workmux + tmux), prompts written in Neovim (prompt.nvim), rules enforced by machines, and line-anchored review in tuicr that exports straight back as the next prompt. Illustrated with `tuicr` and `workmux` screenshots captured in a sample repo.

## [1.3.0] - 2026-07-28

### Changed
- Blog posts are now filed as `content/blog/YYYY-MM-DD-<slug>.md`, so the markdown corpus reads in publication order on disk instead of alphabetically. **URLs are unchanged** — Eleventy already drops a date prefix from `page.fileSlug`, and the TUI now strips it too (`tui/content.go`), so both renderers keep resolving `/blog/<slug>/`.
- Redesigned the in-article series nav to fit the terminal aesthetic and align with the reading column. Reading view shows a constrained card with numbered part rows (`01`, `02`, …), the current part highlighted and tagged `Reading`; code view now renders a markdown-source twin (`.sz-md-series`) inside the numbered body so line numbers run through it — mirroring the TUI's "part N of …" block. Replaces the full-width, plain bulleted list that read as broken with a single published part.
- Reworked the blog-archive series badge (`.post-row__series`) — a `≡` glyph, the series name in lavender, and the part number as an accent chip, in place of the flat single pill.

### Security
- Bumped the TUI's Go toolchain 1.26.2 → 1.26.5 (CI `setup-go` + `golang` Docker base image) to clear five reachable standard-library vulnerabilities via `tui.FetchWakapi` — GO-2026-5856 (crypto/tls ECH), GO-2026-5039 (net/textproto), GO-2026-5037 (crypto/x509), GO-2026-4971 (net), GO-2026-4918 (net/http HTTP/2) — which were failing the deploy's `govulncheck` gate.

## [1.2.2] - 2026-07-08

### Security
- Bumped `github.com/yuin/goldmark` 1.7.8 → 1.7.17 in the TUI (transitive via Glamour) to clear GO-2026-5320 (goldmark XSS), which was failing the deploy's `govulncheck` gate.

## [1.2.1] - 2026-07-08

### Removed
- Phone number on the Terms & Conditions page — email remains the contact channel.

## [1.2.0] - 2026-07-06

### Added
- `BlogPosting` JSON-LD now emits `publisher` (Organization + logo) and `dateModified`.
- Share links carry `utm_source`/`utm_medium=social` so referred visits are attributable in Umami.
- Reusable `<sz-glass>` UI primitive — an Apple-style "liquid glass" material (SVG-displacement refraction, tint, inset specular shine) that wraps any content and is themeable via CSS custom properties (`--glass-radius`, `--glass-tint`, `--glass-shine-*`, `--glass-backdrop`, `--glass-shadow`) and a `scale` attribute.

### Changed
- Retitled the terminal-style-site post to "I Reimplemented tmux in CSS" (URL/slug unchanged).
- The start-screen launcher now sits on the `<sz-glass>` material, and each launcher item adapts its ink to the wallpaper directly behind it — a button over a light patch flips to dark text/icons while its neighbours over dark areas stay light. Hover is a soft translucent lozenge that follows the same per-item tone.

### Fixed
- Blog-post social preview images are now JPG (`og:image`/`twitter:image` via a new `ogImage` front-matter twin of each WebP poster) so LinkedIn renders link previews reliably.

## [1.1.0] - 2026-07-02

### Added
- Project pages now show a metadata card (client · role · when, plus a live link
  when a project has a public URL) at the top of the case study, in both the web
  reading/code views and the TUI. Driven by optional `client`, `role`, `timeframe`,
  and `liveUrl` front matter on `content/projects/*.md`; each row renders only when
  its field is set.
- The eFarmz case study now carries inline illustrations — the product box photo and
  a responsive device mockup of the storefront.
- Site-wide keyboard navigation on desktop: Up/Down arrows and `j`/`k` scroll any
  page; on the projects and blog listings the first item is focused on load and
  arrows / `h j k l` roam the (filtered) items, Tab jumps to the tag filters, and a
  focused filter hands back to the arrows; `space` (as well as `enter`) activates
  the focused link/menu item; `q` mirrors `esc` — closing overlays, backing a blog
  post or project page out to its archive, or otherwise dropping focus back to the
  content.
- Company-name mentions (STEPHANZYCH / STEPHAN ZYCH SRL) now link to the company
  site (https://stephanzych.be) on the about, contact, privacy, and terms pages.
- Person JSON-LD now declares the employer (`worksFor` STEPHANZYCH / STEPHAN ZYCH
  SRL, VAT, stephanzych.be), linking the personal site to the company for SEO.
- Inline illustrations across several case studies — AMA La Girafe, Boxify,
  Climespace, MyTribuNews, minds&more, and Réseau Entreprendre Bruxelles now carry
  in-content imagery.
- Réseau Entreprendre Bruxelles now has a project poster (previously none).
- The Art Blanc case study embeds a short, self-hosted showcase video (MP4,
  autoplay/loop/muted); the TUI reader renders a "▶ video" note in its place.
- Six more case studies embed a self-hosted showcase video (Abattoir, minds&more,
  Melting Pom, Réseau Entreprendre Bruxelles, 20km de Bruxelles, The Pod BW).
- Two new project case studies — **20km de Bruxelles** (2014) and **The Pod BW**
  (2022).

### Changed
- Refreshed project posters with higher-quality visuals: Boxify (302×167 → 1140×855
  device mockup), Climespace (765×575 → 1536×890 mockup), Daoust (400×293 → a
  dajobs.be hero screenshot), AMA La Girafe (→ the classroom-app screenshot), and
  MyTribuNews (→ a Tribu magazine hero; the compositor UI moved in-content).
- The default Open Graph / Twitter image is now a real homepage screenshot
  (`/assets/social-card.jpg`, 1200×630, generated by `screenshot.mjs`) instead of
  a decorative wallpaper. Posts and projects still use their own `poster`.

### Removed
- The Orange Digital Center project page and its poster asset.
- Live-site links on project pages — both the in-prose "Live at …" links and the
  `liveUrl` metadata-card rows — since the agency client sites are now offline and
  the links 404ed.
- The mobile top-bar text-size ("aA") control — mobile browsers provide their own
  text zoom. Desktop keeps the control.

### Fixed
- Corrected role/attribution on three project pages: Réseau Entreprendre Bruxelles
  (frontend + WordPress integration and setup, not backend/deployment), MyTribuNews
  (frontend plus integration with a Laravel backend built by another engineer), and
  AMA La Girafe (dropped an overstated "designed to evolve over time" claim).
- Article breadcrumb no longer wraps to a second line on narrow (mobile)
  viewports: the `~`/section crumbs stay put and only the current slug truncates
  with an ellipsis, keeping the breadcrumb on one line.
- Statusbar path no longer wraps to a second line on narrow (mobile) viewports:
  a long route now stays on one line and truncates with an ellipsis.
- Homepage typewriter tagline now centers every line: when a tagline wraps to two
  lines on narrow (mobile) viewports, the shorter line no longer hugs the left edge.
- Homepage `<title>` (and og/twitter titles) is now "Stéphan Zych — engineering
  notes & experiments" instead of the redundant, mis-accented "Home — Stephan Zych".

## [1.0.0] - 2026-06-30

### Added
- Two front-ends over one shared `content/` source: an Eleventy static site
  (`web/`, Lit + TypeScript) and a real terminal UI served over SSH (`tui/`,
  Go + Charm — Wish · Bubble Tea · Glamour).
- Content system for blog posts, project case studies, and standalone pages,
  with in-article **series navigation** rendered on both the web and the TUI.
- Cookieless, no-banner analytics: a Caddy access-log + **GoAccess** `/_stats`
  dashboard, plus self-hosted **Umami** at `analytics.zych.be` for the static
  sibling sites.
- SEO and metadata generation (OpenGraph, Twitter cards, JSON-LD) with an
  auto-generated `sitemap.xml` and `robots.txt`.
- Performance and accessibility work: build-time critical-CSS inlining,
  code-split JS, font preloading, and a Lighthouse/axe audit harness.
- Dockerised deployment — distroless SSH server + Caddy — with a GitHub Actions
  build-and-deploy pipeline.

[Unreleased]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.8.0...HEAD
[1.8.0]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.7.0...v1.8.0
[1.7.0]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.6.0...v1.7.0
[1.6.0]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.5.1...v1.6.0
[1.5.1]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.5.0...v1.5.1
[1.5.0]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.4.2...v1.5.0
[1.4.2]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.4.1...v1.4.2
[1.4.1]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.4.0...v1.4.1
[1.4.0]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.3.1...v1.4.0
[1.3.1]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.3.0...v1.3.1
[1.3.0]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.2.2...v1.3.0
[1.2.2]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/monkeymonk/stephan.zych.be/releases/tag/v1.0.0
