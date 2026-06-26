import { build, context } from 'esbuild';
import { readdirSync } from 'node:fs';

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
  console.log('esbuild done (js bundle + css minified).');
}
