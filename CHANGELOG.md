# Changelog

All notable changes to this project are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).
The version of record is the latest `vX.Y.Z` git tag, kept in sync with
`web/package.json`.

## [Unreleased]

### Added
- Company-name mentions (STEPHANZYCH / STEPHAN ZYCH SRL) now link to the company
  site (https://stephanzych.be) on the about, contact, privacy, and terms pages.

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

[Unreleased]: https://github.com/monkeymonk/stephan.zych.be/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/monkeymonk/stephan.zych.be/releases/tag/v1.0.0
