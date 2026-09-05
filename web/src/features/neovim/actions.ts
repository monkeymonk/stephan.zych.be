export const NEOVIM_ACTION = {
  // Open the palette programmatically with a given prefix (used by the
  // mobile search button, which can't rely on keydown).
  PALETTE_OPEN: 'neovim:palette-open',
  // Open the keyboard-shortcut help overlay (used by the `:help` command).
  PALETTE_HELP: 'neovim:palette-help',
  // Broadcast whenever the palette opens or closes, so a control that toggles
  // it (the mobile search button) can announce its own pressed/expanded state
  // rather than guessing from its own clicks.
  PALETTE_STATE: 'neovim:palette-state',
} as const;


/** Payload of {@link NEOVIM_ACTION.PALETTE_STATE}. */
export type PaletteStateDetail = { open: boolean };