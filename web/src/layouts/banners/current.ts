// 1. current - the plain wordmark, no animation.
import { centerInStage } from './core.js';
import type { BannerCtx } from './registry.js';

export function mount(host: HTMLElement, ctx: BannerCtx): () => void {
  host.textContent = centerInStage(ctx.wordmark, ctx.cols, ctx.rows).join('\n');
  return () => {};
}
