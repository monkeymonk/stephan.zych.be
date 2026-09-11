import { ReactiveController, ReactiveControllerHost } from 'lit';
import { keymap, type KeyBinding, type KeymapApi } from './keymap.js';

/**
 * Lets a component declare its site-wide keybindings without owning a
 * listener, and without knowing what else is bound. Same shape as
 * {@link ActionController}: bindings are declared by the host, the collaborator
 * is resolved by the controller and injectable for tests.
 *
 *     private keysCtrl = new KeymapController(this, [
 *       { id: 'links.open', keys: ['l'], scope: 'page', chars: true,
 *         description: 'List links in the current article',
 *         when: () => !mobileQuery.matches,
 *         run: () => this.openPicker() },
 *     ]);
 *
 * Alternative keystrokes for one action are two bindings sharing one id
 * (`['j']` and `['ArrowDown']`): `keys` is a sequence, never an alternation.
 * Put `description` on the character binding only, so help generation dedupes
 * by id. Remove them with the function `register()` returns, never with
 * `unregister(id)`, which splices the first id match alone.
 *
 * Bindings register on `hostConnected` and unregister on `hostDisconnected`,
 * so a component that leaves the document cannot keep answering keys — the
 * failure mode of the hand-rolled listeners this replaces.
 *
 * Use `bindings` for a static set and `setBindings` when the set depends on
 * runtime state (a transient effect arming its own dismiss key).
 */
export class KeymapController implements ReactiveController {
  private bindings: readonly KeyBinding[];
  private registry: KeymapApi;
  private unregister?: () => void;

  constructor(
    host: ReactiveControllerHost,
    bindings: readonly KeyBinding[],
    registry: KeymapApi = keymap,
  ) {
    this.bindings = bindings;
    this.registry = registry;
    host.addController(this);
  }

  hostConnected(): void {
    this.unregister = this.registry.register(...this.bindings);
  }

  hostDisconnected(): void {
    this.unregister?.();
    this.unregister = undefined;
  }

  /** Replace this host's bindings, unregistering the previous set. */
  setBindings(bindings: readonly KeyBinding[]): void {
    // Drop the old set first: a replacement that reuses an id would otherwise
    // be taken down with the set it replaces. Registering is skipped while the
    // host is disconnected — it is not answering keys then, and
    // `hostConnected` picks up whatever set is current.
    const connected = this.unregister !== undefined;
    this.unregister?.();
    this.unregister = undefined;
    this.bindings = bindings;
    if (connected) this.unregister = this.registry.register(...bindings);
  }
}
