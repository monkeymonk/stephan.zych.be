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
  const jsResult = await build({ ...jsConfig, metafile: true });
  await build(cssConfig);

  // Map each lazily-defined widget (see src/app/lazy-components.ts) to its built
  // chunk, so each page can load the widgets it actually contains as their own
  // module scripts. The runtime presence-scan alone defers a page's own widgets
  // until after components.js parses and runs — they upgrade *after* first paint
  // and shove content down (CLS 0.65 on widget-heavy pages like /about/). Loading
  // them as <script type=module> makes them define during initial module
  // execution (like the old eager bundle → no shift), while pages that don't use
  // a widget still never download it. The presence-scan still covers SPA nav.
  const LAZY_TAGS = ['sz-gitlog', 'sz-stats', 'sz-wakapi', 'sz-neofetch', 'sz-contact-card', 'sz-copy', 'sz-toc'];
  const outputNames = Object.keys(jsResult.metafile.outputs).map(o => o.split('/').pop());
  const chunkFor = {};
  for (const tag of LAZY_TAGS) {
    const hit = outputNames.find(n => new RegExp(`^${tag}-[A-Za-z0-9_-]+\\.js$`).test(n));
    if (hit) chunkFor[tag] = `/assets/${hit}`;
  }

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
    // Load the lazy widget chunks this page uses as module scripts (after
    // components.js, which owns this <head>, so registry/state are initialized
    // first). Tag-boundary match so `<sz-copy` doesn't also catch the
    // always-present `<sz-copyright-footer>`.
    const scripts = LAZY_TAGS
      .filter(tag => chunkFor[tag] && new RegExp(`<${tag}[\\s/>]`).test(html))
      .map(tag => `<script type="module" src="${chunkFor[tag]}"></script>`)
      .join('');
    if (scripts && html.includes('</head>')) {
      html = html.replace('</head>', `${scripts}</head>`);
      changed = true;
    }
    if (changed) { writeFileSync(file, html); inlined++; }
  }
  console.log(`esbuild done (js bundle + css minified; critical CSS inlined into ${inlined} html files).`);
}
