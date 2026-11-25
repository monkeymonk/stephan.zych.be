// 3. glitch - pure CSS RGB-split glitch on the static art.
import { artFor, centerInStage, injectStyle } from './core.js';
import type { BannerCtx } from './registry.js';

const CSS = `
  .gl-r, .gl-c, .gl-main {
    color: var(--sz-accent, #89b4fa);
  }
  .gl-r { color: var(--sz-red, #f38ba8); }
  .gl-c { color: var(--sz-sky, #89dceb); }
  @media not (prefers-reduced-motion: reduce) {
    .gl-r, .gl-c, .gl-main {
      animation: gl-cycle 5s steps(1) infinite;
    }
    .gl-r { animation-name: gl-cycle-r; }
    .gl-c { animation-name: gl-cycle-c; }
    .gl-main { animation-name: gl-cycle-main; }
    @keyframes gl-cycle-r {
      0%, 88% { transform: none; clip-path: none; opacity: 1; }
      90% { transform: translateX(-3px); clip-path: inset(10% 0 55% 0); opacity: .85; }
      92% { transform: translateX(2px); clip-path: inset(40% 0 20% 0); opacity: 1; }
      94% { transform: translateX(-4px); clip-path: inset(5% 0 70% 0); opacity: .85; }
      96% { transform: translateX(3px); clip-path: inset(60% 0 5% 0); opacity: 1; }
      98% { transform: translateX(-2px); clip-path: inset(25% 0 45% 0); opacity: .85; }
      100% { transform: none; clip-path: none; opacity: 1; }
    }
    @keyframes gl-cycle-c {
      0%, 88% { transform: none; clip-path: none; opacity: 1; }
      90% { transform: translateX(3px); clip-path: inset(55% 0 10% 0); opacity: .85; }
      92% { transform: translateX(-2px); clip-path: inset(20% 0 40% 0); opacity: 1; }
      94% { transform: translateX(4px); clip-path: inset(70% 0 5% 0); opacity: .85; }
      96% { transform: translateX(-3px); clip-path: inset(5% 0 60% 0); opacity: 1; }
      98% { transform: translateX(2px); clip-path: inset(45% 0 25% 0); opacity: .85; }
      100% { transform: none; clip-path: none; opacity: 1; }
    }
    @keyframes gl-cycle-main {
      0%, 88% { transform: none; clip-path: none; opacity: 1; }
      91% { transform: translateX(1px); clip-path: inset(30% 0 35% 0); opacity: .9; }
      95% { transform: translateX(-1px); clip-path: inset(50% 0 15% 0); opacity: .9; }
      100% { transform: none; clip-path: none; opacity: 1; }
    }
  }
  @media (prefers-reduced-motion: reduce) {
    .gl-r, .gl-c, .gl-main { animation: none; }
    .gl-r, .gl-c { display: none; }
  }
`;

export function mount(host: HTMLElement, ctx: BannerCtx): () => void {
  injectStyle(host, CSS);
  const art = artFor(ctx.banner);
  if (art.length === 0) return () => {};
  const artStr = centerInStage(art, ctx.cols, ctx.rows).join('\n');
  const rLayer = document.createElement('pre');
  rLayer.className = 'gl-r';
  rLayer.textContent = artStr;
  const cLayer = document.createElement('pre');
  cLayer.className = 'gl-c';
  cLayer.textContent = artStr;
  const mainLayer = document.createElement('pre');
  mainLayer.className = 'gl-main';
  mainLayer.textContent = artStr;
  host.append(rLayer, cLayer, mainLayer);
  return () => {};
}
