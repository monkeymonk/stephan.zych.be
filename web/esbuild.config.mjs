import { build, context } from 'esbuild';

const isDev = process.argv.includes('--watch');

const config = {
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

if (isDev) {
  const ctx = await context(config);
  await ctx.watch();
  console.log('esbuild watching...');
} else {
  await build(config);
  console.log('esbuild done.');
}
