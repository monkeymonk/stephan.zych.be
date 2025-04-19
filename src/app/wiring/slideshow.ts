import { actions } from '../../core/actions.js';
import { SLIDESHOW_ACTION } from '../../components/slideshow-actions.js';
import { registry } from '../../core/registry.js';

export function wireSlideshow() {
  const slideshow = () => document.querySelector('sz-slideshow') as any;

  requestAnimationFrame(() => {
    const el = slideshow();
    if (el) {
      (el as any).setImages([...registry.wallpapers]);
    }
  });

  actions.on(SLIDESHOW_ACTION.NEXT, () => slideshow()?.next());
  actions.on(SLIDESHOW_ACTION.PREV, () => slideshow()?.prev());
}
