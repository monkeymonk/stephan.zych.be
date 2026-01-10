import { build, context } from 'esbuild';

const isDev = process.argv.includes('--watch');

const config = {
  entryPoints: ['src/app/index.ts'],
  bundle: true,
  outfile: '_site/assets/components.js',
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
