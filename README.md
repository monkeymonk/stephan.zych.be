# stephan.zych.be

Personal portfolio and blog styled as a terminal environment. Built with Eleventy, Lit web components, and TypeScript.

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
npm install
npm run dev
```

This starts Eleventy's dev server and esbuild in watch mode concurrently.

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server with hot reload |
| `npm run build` | Production build |
| `npm run clean` | Remove build output |

## Project Structure

```
src/
  app/           Entry point and feature wiring
  core/          Shared systems (state, actions, router, types)
  features/      Isolated feature modules (window, tmux, neovim, effects, ...)
  layouts/       Nunjucks templates and layout components
  components/    Shared building blocks
  widgets/       Interactive UI components
  content/       Markdown content (blog, projects, pages)
  data/          JSON data (site config, navigation, commands, themes)
  styles/        Global CSS
  assets/        Fonts, images, themes
```

## License

ISC
