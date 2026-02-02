import { actions } from './actions.js';
import { NOTIFY_ACTION } from '../features/notifications/actions.js';

/**
 * Copy text to the clipboard and surface a toast. Centralises the
 * clipboard + notification dance shared by the command palette, the contact
 * card, <sz-copy>, and markdown code blocks.
 */
export async function copyText(text: string, okMessage = '✓ Copied to clipboard'): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    actions.dispatch(NOTIFY_ACTION.SHOW, { text: okMessage });
    return true;
  } catch {
    actions.dispatch(NOTIFY_ACTION.SHOW, { text: 'Could not copy — select it manually', type: 'error' });
    return false;
  }
}
