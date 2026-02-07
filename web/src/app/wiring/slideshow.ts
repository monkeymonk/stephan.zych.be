import { actions } from '../../core/actions.js';
import { SLIDESHOW_ACTION } from '../../components/background/slideshow-actions.js';
import { registry } from '../../core/registry.js';
import type { SlideshowApi } from '../../components/background/sz-slideshow.js';

export function wireSlideshow() {
  const slideshow = () =>
    document.querySelector('sz-slideshow') as (HTMLElement & SlideshowApi) | null;

  requestAnimationFrame(() => {
    slideshow()?.setImages([...registry.wallpapers]);
  });

  actions.on(SLIDESHOW_ACTION.NEXT, () => slideshow()?.next());
  actions.on(SLIDESHOW_ACTION.PREV, () => slideshow()?.prev());
}
