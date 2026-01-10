import { ReactiveController, ReactiveControllerHost } from 'lit';
import { actions, type Action } from './actions.js';

type ActionBinding = [type: string, handler: (action: Action) => void];

export class ActionController implements ReactiveController {
  private bindings: ActionBinding[];
  private unsubs: (() => void)[] = [];

  constructor(host: ReactiveControllerHost, bindings: ActionBinding[]) {
    this.bindings = bindings;
    host.addController(this);
  }

  hostConnected(): void {
    this.unsubs = this.bindings.map(([type, handler]) => actions.on(type, handler));
  }

  hostDisconnected(): void {
    this.unsubs.forEach(fn => fn());
    this.unsubs = [];
  }
}
