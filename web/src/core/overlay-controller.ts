import { ReactiveController, ReactiveControllerHost } from 'lit';
import { overlayRegistry, type CloseReason, type OverlayKind, type OverlayRegistryApi } from './overlays.js';

/**
 * Lets an overlay component declare that it is an overlay and coordinate with
 * nothing. Same shape as {@link ActionController} and {@link StateController}:
 * the host declares a need, the controller resolves the collaborator.
 *
 *     private overlayCtrl = new OverlayController(this, {
 *       id: 'links',
 *       kind: 'modal',
 *       onClose: (reason) => this.hide(reason),
 *     });
 *
 * The registry is injected with the singleton as its default, so a test — or a
 * second independent mount — supplies its own without the component naming an
 * implementation.
 */
export interface OverlayControllerOptions {
  readonly id: string;
  readonly kind: OverlayKind;
  /**
   * Called when the registry closes this overlay. The host must bring its own
   * state in line (clear `open`, drop listeners) and MUST NOT restore focus
   * when `reason === 'superseded'`.
   */
  onClose(reason: CloseReason): void;
  /**
   * Reflect `[open]` on the host element for CSS only. Defaults to true. The
   * attribute is no longer a state channel — nothing queries it — so it is
   * written from `claim`/`release` rather than from an update callback.
   */
  readonly reflect?: boolean;
}

export class OverlayController implements ReactiveController {
  private host: ReactiveControllerHost & HTMLElement;
  private options: OverlayControllerOptions;
  private registry: OverlayRegistryApi;
  private unregister?: () => void;

  constructor(
    host: ReactiveControllerHost & HTMLElement,
    options: OverlayControllerOptions,
    registry: OverlayRegistryApi = overlayRegistry,
  ) {
    this.host = host;
    this.options = options;
    this.registry = registry;
    host.addController(this);
  }

  /** Registers with the registry. */
  hostConnected(): void {
    this.unregister = this.registry.register({
      id: this.options.id,
      kind: this.options.kind,
      close: (reason) => {
        this.options.onClose(reason);
        // A superseded overlay never calls release() — the slot belongs to its
        // successor by then — so nothing else would clear `[open]` and the
        // closed surface would keep its CSS open state.
        this.syncOpenAttribute();
      },
    });
  }

  /** Unregisters and releases the slot if this overlay still holds it. */
  hostDisconnected(): void {
    // The unregister function releases a held slot on the way out, so calling
    // release() first would only close the surface twice.
    this.unregister?.();
    this.unregister = undefined;
  }

  /** Take the keyboard. Closes the incumbent modal as `'superseded'`. */
  claim(): void {
    this.registry.claim(this.options.id);
    this.syncOpenAttribute();
  }

  /** User-initiated close: releases the slot and reports `'user'`. */
  release(): void {
    this.registry.release(this.options.id);
    this.syncOpenAttribute();
  }

  get isOpen(): boolean {
    return this.registry.isOpen(this.options.id);
  }

  // Mirror the registry onto `[open]` rather than tracking it here: a claim can
  // be refused (an id that is not registered yet) and a release can arrive
  // after the overlay was already superseded, so the local intent and the
  // registry's answer are not the same thing.
  private syncOpenAttribute(): void {
    if (this.options.reflect === false) return;
    this.host.toggleAttribute('open', this.registry.isOpen(this.options.id));
  }
}
