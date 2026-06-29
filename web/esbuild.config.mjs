import { build, context } from 'esbuild';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const isDev = process.argv.includes('--watch');

const jsConfig = {
  // Named entry so the output stays /assets/components.js; splitting emits
  // shared/lazy chunks (e.g. the dynamically-imported mermaid) alongside it,
  // so heavy diagram code is only fetched on pages that actually use it.
  entryPoints: { components: 'src/app/index.ts' },
  bundle: true,
  outdir: '_site/assets',
  splitting: true,
  format: 'esm',
  target: 'es2022',
  sourcemap: isDev,
  minify: !isDev,
};

// Minify the stylesheets 11ty passthrough-copies. esbuild runs AFTER 11ty (see
// package.json build), so these minified files overwrite the raw copies at the
// same paths; the raw passthrough stays as a fallback if this step is skipped.
// Discovered from disk so new themes/stylesheets are picked up automatically.
const cssEntryPoints = [
  ...readdirSync('src/styles').filter(f => f.endsWith('.css')).map(f => `src/styles/${f}`),
  ...readdirSync('src/assets/themes').filter(f => f.endsWith('.css')).map(f => `src/assets/themes/${f}`),
];

const cssConfig = {
  entryPoints: cssEntryPoints,
  outdir: '_site',
  outbase: 'src', // preserve src/styles/… and src/assets/themes/… layout under _site
  loader: { '.css': 'css' },
  minify: true,
};

if (isDev) {
  // CSS is served raw by 11ty's passthrough in dev (no minify needed); only the
  // JS bundle is watched here.
  const ctx = await context(jsConfig);
  await ctx.watch();
  console.log('esbuild watching...');
} else {
  await build(jsConfig);
  await build(cssConfig);

  // Inline the always-critical CSS into each page's <head> so first paint needs
  // no render-blocking stylesheet requests. Uses the just-minified files; the
  // external copies stay on disk (non-default themes are still lazy-loaded by
  // JS, and the inlined default keeps its id so the switch logic still sees it).
  const cssText = rel => readFileSync(join('_site', rel), 'utf8');
  const inlineRules = [
    ['<link rel="stylesheet" href="/styles/reset.css">', () => `<style>${cssText('styles/reset.css')}</style>`],
    ['<link rel="stylesheet" href="/styles/base.css">', () => `<style>${cssText('styles/base.css')}</style>`],
    ['<link rel="stylesheet" href="/styles/prism-catppuccin.css">', () => `<style>${cssText('styles/prism-catppuccin.css')}</style>`],
    ['<link rel="stylesheet" id="theme-css-catppuccin-mocha" href="/assets/themes/catppuccin-mocha.css">',
      () => `<style id="theme-css-catppuccin-mocha">${cssText('assets/themes/catppuccin-mocha.css')}</style>`],
  ];
  const htmlFiles = readdirSync('_site', { recursive: true })
    .filter(f => typeof f === 'string' && f.endsWith('.html'));
  let inlined = 0;
  for (const rel of htmlFiles) {
    const file = join('_site', rel);
    let html = readFileSync(file, 'utf8');
    let changed = false;
    for (const [tag, repl] of inlineRules) {
      if (html.includes(tag)) { html = html.replace(tag, repl()); changed = true; }
    }
    if (changed) { writeFileSync(file, html); inlined++; }
  }
  console.log(`esbuild done (js bundle + css minified; critical CSS inlined into ${inlined} html files).`);
}
