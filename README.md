# stephan.zych.be

Personal portfolio and blog styled as a terminal environment — in two flavours
that share one content source:

- **`web/`** — a static site (Eleventy + Lit + TypeScript), deployed to GitHub Pages.
- **`tui/`** — a real terminal version served over SSH (Go + Charm: Wish · Bubble Tea · Glamour).
- **`content/`** — the markdown corpus (blog, projects, pages) both front-ends read.

## Features

- Terminal-inspired UI with window management, tmux-style tabs and panes
- Neovim-flavored markdown rendering with syntax highlighting
- Command palette with fuzzy search
- Catppuccin Mocha theme (+ additional themes)
- Screen shader with time-of-day lighting
- Animated background with grain/grid overlays
- Easter egg commands
- Responsive design with `prefers-reduced-motion` support
- ~19KB gzipped JS bundle

## Tech Stack

- [Eleventy 3.x](https://www.11ty.dev/) — static site generator
- [Lit 3.x](https://lit.dev/) — web components
- [esbuild](https://esbuild.github.io/) — bundler
- [TypeScript](https://www.typescriptlang.org/) — type safety
- [JetBrains Mono](https://www.jetbrains.com/lp/mono/) — monospace font
- [Catppuccin](https://github.com/catppuccin/catppuccin) — color palette

## Getting Started

```bash
# Web (static site)
cd web && npm install && npm run dev

# TUI (terminal version) — runs straight in your terminal
cd tui && go run . --local
```

The web `dev` task starts Eleventy's dev server and esbuild in watch mode concurrently.

## Scripts (run inside `web/`)

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Production build |
| `npm run clean` | Remove build output |

## Repository Structure

```
content/         Markdown corpus — single source of truth (blog, projects, pages)
web/             Static site (Eleventy + Lit + TypeScript → GitHub Pages)
  src/
    app/         Entry point and feature wiring
    core/        Shared systems (state, actions, router, types)
    features/    Isolated feature modules (window, tmux, neovim, effects, ...)
    layouts/     Nunjucks templates and layout components
    components/  Shared building blocks and content widgets
    data/        JSON data (site config, navigation, commands, themes)
    styles/      Global CSS
    assets/      Fonts, images, themes
    content/     → symlink to ../../content (the shared corpus)
tui/             SSH terminal version (Go + Charm: Wish · Bubble Tea · Glamour)
docs/            Design notes and audits
```

Content lives once, at the repo root. The web build reads it through a symlink
(`web/src/content`); the TUI reads it directly (`CONTENT_DIR`, default `../content`).

## SSH TUI

```bash
cd tui
go run . --local                              # dev: render in your terminal
docker compose -f compose.yaml up -d --build  # deploy: serve over SSH on :2222
```

## License

ISC
