export const NEOVIM_ACTION = {
  // Open the palette programmatically with a given prefix (used by the
  // mobile search button, which can't rely on keydown).
  PALETTE_OPEN: 'neovim:palette-open',
  // Open the keyboard-shortcut help overlay (used by the `:help` command).
  PALETTE_HELP: 'neovim:palette-help',
} as const;
