import { actions, THEME_ACTION } from '../../core/actions.js';
import { EFFECT_ACTION } from '../../features/effects/actions.js';
import { NOTIFY_ACTION } from '../../features/notifications/actions.js';
import { WM_ACTION } from '../../features/window-manager/actions.js';
import { SHADER_ACTION } from '../../features/screen-shader/actions.js';
import { registry } from '../../core/registry.js';
import { router } from '../../core/router.js';
import { appState } from '../../core/state.js';
import { paletteRegistry } from '../../core/types.js';
import type { PaletteSource, PaletteItem } from '../../core/types.js';

export function wireNeovimPalette() {
  const commandSource: PaletteSource = {
    id: 'commands',
    prefix: ':',
    placeholder: 'Type a command...',
    getItems(query: string): PaletteItem[] {
      const commands: PaletteItem[] = [
        ...registry.nav.map(tab => ({
          id: `nav-${tab.name}`,
          label: tab.name,
          description: `Go to ${tab.name} page`,
        })),
        { id: 'colorscheme', label: 'colorscheme', description: 'Switch color theme',
          args: [{ name: 'catppuccin-mocha' }, { name: 'gruvbox-dark' }, { name: 'tokyonight' }] },
        { id: 'fullscreen', label: 'fullscreen', description: 'Enter fullscreen' },
        { id: 'windowed', label: 'windowed', description: 'Enter windowed mode' },
        { id: 'fullpage', label: 'fullpage', description: 'Enter full-page mode' },
        { id: 'set', label: 'set', description: 'Set configuration',
          args: [
            { name: 'transparency', values: ['100', '90', '80', '70', '60', '50'] },
            { name: 'shader', values: ['off', 'css', 'webgl'] },
          ] },
        { id: 'whoami', label: 'whoami', description: 'man page for one (1) developer' },
        { id: 'matrix', label: 'matrix', description: 'Enter the Matrix' },
        { id: 'party', label: 'party', description: 'Celebrate!' },
        { id: 'sudo', label: 'sudo', description: 'Try root access' },
        { id: 'coffee', label: 'coffee', description: 'Brew coffee' },
        { id: '42', label: '42', description: 'The answer' },
        { id: 'help', label: 'help', description: 'Show all commands' },
      ];
      if (!query) return commands;
      const q = query.toLowerCase();
      return commands.filter(c => c.label.includes(q) || (c.description?.toLowerCase().includes(q) ?? false));
    },
    execute(item: PaletteItem, args?: string[]) {
      const navTab = registry.nav.find(t => t.name === item.label);
      if (navTab) { router.navigate(navTab.path); return; }
      if (item.id === 'colorscheme' && args?.[0]) {
        actions.dispatch(THEME_ACTION.SET, args[0]); return;
      }
      if (item.id === 'fullscreen') { actions.dispatch(WM_ACTION.FULLSCREEN, { windowId: 'terminal' }); return; }
      if (item.id === 'windowed') { actions.dispatch(WM_ACTION.TOGGLE_MODE, { windowId: 'terminal' }); return; }
      if (item.id === 'fullpage') { actions.dispatch(WM_ACTION.MAXIMIZE, { windowId: 'terminal' }); return; }
      if (item.id === 'whoami') { router.navigate('/whoami/'); return; }
      if (item.id === 'set' && args?.[0] === 'transparency' && args?.[1]) {
        appState.set('transparency', parseInt(args[1])); return;
      }
      if (item.id === 'set' && args?.[0] === 'shader' && args?.[1]) {
        actions.dispatch(SHADER_ACTION.SET_MODE, args[1]); return;
      }
      if (item.id === 'matrix') { actions.dispatch(EFFECT_ACTION.MATRIX); return; }
      if (item.id === 'party') { actions.dispatch(EFFECT_ACTION.CONFETTI); return; }
      if (item.id === 'sudo') { actions.dispatch(NOTIFY_ACTION.SHOW, { text: 'E: Are you sure you are not root?' }); return; }
      if (item.id === 'coffee') { actions.dispatch(NOTIFY_ACTION.SHOW, { text: '☕ Brewing...' }); return; }
      if (item.id === '42') { actions.dispatch(NOTIFY_ACTION.SHOW, { text: 'The answer to life, the universe, and everything.' }); return; }
    },
  };
  paletteRegistry.register(commandSource);

  const searchSource: PaletteSource = {
    id: 'search',
    prefix: '/',
    placeholder: 'Search pages...',
    async getItems(query: string): Promise<PaletteItem[]> {
      if (!query || query.length < 2) return [];
      const index = await registry.getSearchIndex();
      const q = query.toLowerCase();
      return (index as any[])
        .filter((entry: any) => entry.title?.toLowerCase().includes(q) || entry.content?.toLowerCase().includes(q))
        .map((entry: any) => ({ id: entry.url, label: entry.title, description: entry.url }));
    },
    execute(item: PaletteItem) {
      router.navigate(item.id);
    },
  };
  paletteRegistry.register(searchSource);
}
