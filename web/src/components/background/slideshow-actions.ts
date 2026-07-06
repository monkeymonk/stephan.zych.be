export const SLIDESHOW_ACTION = {
  NEXT: 'slideshow:next',
  PREV: 'slideshow:prev',
  /** Emitted with { url } when the visible wallpaper changes. */
  CHANGE: 'slideshow:change',
} as const;
