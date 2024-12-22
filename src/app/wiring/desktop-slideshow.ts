import { actions } from '../../core/actions.js';
import { DESKTOP_ACTION } from '../../features/desktop/actions.js';
import { registry } from '../../core/registry.js';

export function wireDesktopToSlideshow() {
  const slideshow = () => document.querySelector('sz-slideshow') as any;

  requestAnimationFrame(() => {
    const el = slideshow();
    if (el) {
      (el as any).setImages([...registry.wallpapers]);
    }
  });

  actions.on(DESKTOP_ACTION.WALLPAPER_NEXT, () => slideshow()?.next());
  actions.on(DESKTOP_ACTION.WALLPAPER_PREV, () => slideshow()?.prev());
}
