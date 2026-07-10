# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The version of record is the latest `vX.Y.Z` git tag, kept in sync with
`web/package.json`.

## [Unreleased]

### Security
- Bumped the TUI's Go toolchain 1.26.2 → 1.26.5 (CI `setup-go` + `golang` Docker base image) to clear five reachable standard-library vulnerabilities via `tui.FetchWakapi` — GO-2026-5856 (crypto/tls ECH), GO-2026-5039 (net/textproto), GO-2026-5037 (crypto/x509), GO-2026-4971 (net), GO-2026-4918 (net/http HTTP/2) — which were failing the deploy's `govulncheck` gate.

### Changed
- Redesigned the in-article series nav to fit the terminal aesthetic and align with the reading column. Reading view shows a constrained card with numbered part rows (`01`, `02`, …), the current part highlighted and tagged `Reading`; code view now renders a markdown-source twin (`.sz-md-series`) inside the numbered body so line numbers run through it — mirroring the TUI's "part N of …" block. Replaces the full-width, plain bulleted list that read as broken with a single published part.
- Reworked the blog-archive series badge (`.post-row__series`) — a `≡` glyph, the series name in lavender, and the part number as an accent chip, in place of the flat single pill.

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

[Unreleased]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.2.2...HEAD
[1.2.2]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.2.1...v1.2.2
[1.2.1]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.2.0...v1.2.1
[1.2.0]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.1.0...v1.2.0
[1.1.0]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.0.0...v1.1.0
[1.0.0]: https://github.com/monkeymonk/stephan.zych.be/releases/tag/v1.0.0
