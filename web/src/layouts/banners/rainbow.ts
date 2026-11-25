// 4. rainbow — colour-cycling gradient clipped to the static art text.
import { artFor, centerInStage, injectStyle } from './core.js';
import type { BannerCtx } from './registry.js';

const CSS = `
  .ascii .rb-out {
    grid-area: 1 / 1;
    background: linear-gradient(
      100deg,
      var(--sz-red, #f38ba8), var(--sz-peach, #fab387), var(--sz-yellow, #f9e2af),
      var(--sz-green, #a6e3a1), var(--sz-teal, #94e2d5), var(--sz-blue, #89b4fa),
      var(--sz-mauve, #cba6f7), var(--sz-pink, #f5c2e7), var(--sz-red, #f38ba8)
    );
    background-size: 200% 100%;
    -webkit-background-clip: text;
    background-clip: text;
    color: transparent;
    animation: lc-rainbow 6s linear infinite;
  }
  @keyframes lc-rainbow {
    0% { background-position: 0% 0; }
    100% { background-position: 200% 0; }
  }
  @media (prefers-reduced-motion: reduce) {
    .ascii .rb-out { animation: none; }
  }
`;

export function mount(host: HTMLElement, ctx: BannerCtx): () => void {
  injectStyle(host, CSS);
  const art = artFor(ctx.banner);
  if (art.length === 0) return () => {};
  const outLayer = document.createElement('pre');
  outLayer.className = 'rb-out';
  outLayer.textContent = centerInStage(art, ctx.cols, ctx.rows).join('\n');
  host.append(outLayer);
  return () => {};
}
