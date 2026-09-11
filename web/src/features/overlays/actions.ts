export const OVERLAY_ACTION = {
  // Open an overlay by id, for controls that cannot rely on a keystroke (the
  // mobile search button, the `:help` command, a diagram's enlarge control).
  OPEN: 'overlay:open',
  // Close one overlay by id, or the current modal when no id is given.
  CLOSE: 'overlay:close',
  // Broadcast whenever the current modal changes, so a control that toggles an
  // overlay can announce its own pressed/expanded state rather than guessing
  // from its own clicks. Replaces NEOVIM_ACTION.PALETTE_STATE, which told the
  // tmux bar about the palette specifically and about nothing else.
  STATE: 'overlay:state',
} as const;

/** Payload of {@link OVERLAY_ACTION.OPEN} and {@link OVERLAY_ACTION.CLOSE}. */
export type OverlayRequestDetail = { id?: string };

/** Payload of {@link OVERLAY_ACTION.STATE}. */
export type OverlayStateDetail = { current: string | null };
