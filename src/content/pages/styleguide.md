---
layout: page.njk
title: Styleguide
heading: Styleguide
description: Internal reference — every supported markdown element and style.
permalink: /styleguide/
eleventyExcludeFromCollections: true
noindex: true
---

Internal documentation. This page is a complete, living showcase of every markdown element and style the site renders, styled with the **render-markdown.nvim** inspired theme. It is intentionally hidden — not in the navigation, sitemap, or search index, and marked `noindex` — so it can serve as a reference while authoring content. Keep it in sync when styles change.

## Headings

All six levels, styled with the Catppuccin palette. The page title above is rendered as the `h1`; in-body headings start at `h2`.

## Heading Level 2

### Heading Level 3

#### Heading Level 4

##### Heading Level 5

###### Heading Level 6

## Typography & Inline Elements

Regular text with **bold emphasis**, *italic emphasis*, and ***bold italic*** combined. You can also use ~~strikethrough~~ for deleted content and `inline code` for technical terms.

Here's a [hyperlink to GitHub](https://github.com) and another [internal link to the styleguide](/styleguide/).

Use <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>P</kbd> to open the command palette. The formula H<sub>2</sub>O is water, and E = mc<sup>2</sup> is famous.

<abbr title="Hyper Text Markup Language">HTML</abbr> is the backbone of the web.

### Blockquotes

> "Any sufficiently advanced technology is indistinguishable from magic."
> — Arthur C. Clarke

> Blockquotes can contain **formatted text**, `code`, and [links](/).
>
> They can also span multiple paragraphs.

#### Nested Blockquotes

> First level of quoting.
>
> > Nested blockquote with a different perspective.
>
> Back to the first level.

## Lists

### Unordered Lists

- First item with some explanation
- Second item with `inline code`
  - Nested item level 2
  - Another nested item
    - Level 3 nesting goes deeper
    - And another one
      - Level 4 for the truly organized
- Back to top level

### Ordered Lists

1. Clone the repository
2. Install dependencies
3. Configure environment variables
4. Run the development server
5. Open your browser to `localhost:8080`

### Mixed Lists

1. First ordered item
   - Unordered sub-item
   - Another sub-item
2. Second ordered item
   1. Ordered sub-item
   2. Another ordered sub-item
3. Third ordered item

### Task Lists

- [x] Design the component architecture
- [x] Implement the base theme
- [x] Add render-markdown.nvim heading styles
- [ ] Replace placeholder content
- [ ] Add real project screenshots
- [ ] Deploy to production

## Code

### Inline Code

Use `npm install` to install packages. The `Array.prototype.map()` method creates a new array.

### Fenced Code Blocks

```typescript
interface Project {
  title: string;
  description: string;
  tags: string[];
  url: string;
}

class Portfolio {
  private projects: Project[] = [];

  addProject(project: Project): void {
    this.projects.push(project);
    console.log(`Added: ${project.title}`);
  }

  filterByTag(tag: string): Project[] {
    return this.projects.filter(p => p.tags.includes(tag));
  }
}
```

```css
/* Catppuccin Mocha palette */
:root {
  --ctp-base: #1e1e2e;
  --ctp-mantle: #181825;
  --ctp-crust: #11111b;
  --ctp-text: #cdd6f4;
  --ctp-blue: #89b4fa;
  --ctp-lavender: #b4befe;
}

.terminal {
  background: var(--ctp-base);
  color: var(--ctp-text);
  font-family: 'JetBrains Mono', monospace;
  padding: 1rem;
}
```

```bash
#!/bin/bash
echo "Building site..."
npx @11ty/eleventy --serve &
npx esbuild src/components/index.ts \
  --bundle --format=esm \
  --outfile=_site/js/components.js \
  --watch
echo "Dev server running on :8080"
```

```json
{
  "name": "stephan.zych.be",
  "version": "1.0.0",
  "scripts": {
    "dev": "eleventy --serve",
    "build": "eleventy && esbuild src/components/index.ts --bundle --minify"
  }
}
```

## Tables

| Feature | Status | Notes |
|---------|--------|-------|
| Terminal shell | Done | 3 display modes |
| Tmux tabs | Done | Alt+1-5 navigation |
| Command palette | Done | Fuzzy autocomplete |
| Theme switching | Done | 3 themes available |
| Line numbers | Done | render-markdown.nvim style |
| Blog | WIP | Needs real content |

### Alignment

| Left | Center | Right |
|:-----|:------:|------:|
| Cell 1 | Cell 2 | Cell 3 |
| Longer content here | Centered | 42 |
| Short | Yes | 1,337 |

## Images

<figure>
  <img src="/assets/wallpapers/landscape-1.webp" alt="Landscape wallpaper">
  <figcaption>One of the wallpapers used as the desktop background</figcaption>
</figure>

## Embeds

<iframe width="560" height="315" src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ" title="Video embed example" allowfullscreen></iframe>

## Horizontal Rules

Content above the rule.

---

Content below the rule.

## Details / Collapsible Sections

<details>
<summary>Click to expand: Technical Architecture</summary>

The portfolio is built with:

- **Eleventy 3.x** for static site generation
- **Lit 3.x** for web components
- **esbuild** for TypeScript bundling

Each page is rendered at build time and enhanced with interactive web components at runtime.

</details>

<details>
<summary>Click to expand: Color Palette Reference</summary>

| Name | Hex | Usage |
|------|-----|-------|
| Base | `#1e1e2e` | Background |
| Text | `#cdd6f4` | Body text |
| Blue | `#89b4fa` | Accent / links |
| Lavender | `#b4befe` | Secondary accent |
| Mauve | `#cba6f7` | Tertiary accent |
| Green | `#a6e3a1` | Success / code |
| Peach | `#fab387` | Bold text |
| Yellow | `#f9e2af` | Italic text |

</details>

## Definition Lists

<dl>
<dt>Web Component</dt>
<dd>A set of web platform APIs that allow you to create custom, reusable HTML elements.</dd>
<dt>Shadow DOM</dt>
<dd>Encapsulated DOM tree attached to an element, hidden from the main document.</dd>
<dt>Light DOM</dt>
<dd>Regular DOM children of a custom element, visible to the main document and styleable with global CSS.</dd>
</dl>

---

That covers every supported element. Each is styled to match the **Catppuccin Mocha** theme with **render-markdown.nvim** inspired heading highlights, custom list bullets, and consistent terminal typography.
