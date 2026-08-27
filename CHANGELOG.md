# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The version of record is the latest `vX.Y.Z` git tag, kept in sync with
`web/package.json`.

## [Unreleased]

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

[Unreleased]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.4.2...HEAD
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
