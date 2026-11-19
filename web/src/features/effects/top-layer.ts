/**
 * Append a full-viewport effect layer to <body> and lift it into the top
 * layer. Browser fullscreen only paints the fullscreen element's subtree plus
 * the top layer, so a plain fixed <body> child is invisible while the
 * terminal window is fullscreen. A manual popover gets there without
 * dismissing anything; the reset cancels the UA [popover] box.
 */
export function mountEffectLayer(el: HTMLElement, css: string): void {
  el.style.cssText =
    'margin:0;padding:0;border:0;background:transparent;width:100%;height:100%;' +
    'max-width:none;max-height:none;' +
    css;
  el.setAttribute('popover', 'manual');
  document.body.appendChild(el);
  if (typeof el.showPopover === 'function') el.showPopover();
}
