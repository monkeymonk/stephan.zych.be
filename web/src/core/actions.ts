// Lightweight action bus — decouples features via fire-and-forget events.

export interface Action {
  type: string;
  payload?: unknown;
}

type ActionHandler = (action: Action) => void;

class ActionBus {
  private handlers = new Map<string, Set<ActionHandler>>();

  on(type: string, handler: ActionHandler): () => void {
    if (!this.handlers.has(type)) this.handlers.set(type, new Set());
    this.handlers.get(type)!.add(handler);
    return () => this.handlers.get(type)?.delete(handler);
  }

  dispatch(type: string, payload?: unknown): void {
    const action: Action = { type, payload };
    for (const fn of this.handlers.get(type) ?? []) {
      try { fn(action); } catch (e) { console.error(`[ActionBus] Error in handler for "${type}":`, e); }
    }
    for (const fn of this.handlers.get('*') ?? []) {
      try { fn(action); } catch (e) { console.error(`[ActionBus] Error in wildcard handler:`, e); }
    }
  }
}

export const actions = new ActionBus();

// Core actions (cross-cutting concerns owned by core)
export const ROUTER_ACTION = {
  ROUTE_CHANGED: 'router:route-changed',
} as const;

export const THEME_ACTION = {
  SET: 'theme:set',
} as const;
