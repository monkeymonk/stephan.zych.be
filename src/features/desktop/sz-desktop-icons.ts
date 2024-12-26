import { LitElement, html, css, nothing } from 'lit';
import { customElement, state } from 'lit/decorators.js';
import { registry, type DesktopApp } from '../../core/registry.js';
import { actions } from '../../core/actions.js';
import { mobileQuery } from '../../core/styles.js';
import { ActionController } from '../../core/action-controller.js';
import { DESKTOP_ACTION } from './actions.js';

@customElement('sz-desktop-icons')
export class SzDesktopIcons extends LitElement {
  @state() private tiled = false;

  private actionCtrl = new ActionController(this, [[DESKTOP_ACTION.TILE_STATE_CHANGED, (a) => {
    this.tiled = (a.payload as { tiled: boolean }).tiled;
  }]]);

  static styles = css`
    :host {
      display: contents;
    }

    .icons-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, 80px);
      grid-auto-rows: min-content;
      gap: 8px;
      padding: 20px;
      pointer-events: auto;
      position: fixed;
      inset: 0;
      z-index: 1;
      align-content: start;
    }
    .app-icon {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 6px;
      padding: 10px 8px;
      border-radius: 6px;
      text-decoration: none;
      color: var(--sz-text, #cdd6f4);
      transition: background 0.2s;
      cursor: pointer;
      user-select: none;
      border: none;
      background: none;
      font-family: inherit;
    }
    .app-icon:hover, .app-icon:focus-visible {
      background: rgba(255, 255, 255, 0.08);
      outline: none;
    }
    .icon-graphic {
      width: 44px;
      height: 44px;
      display: flex;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.06);
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.08);
      transition: transform 0.15s;
    }
    .app-icon:hover .icon-graphic {
      transform: scale(1.08);
    }
    .icon-label {
      font-size: 11px;
      text-align: center;
      color: var(--sz-text, #cdd6f4);
      text-shadow: 0 1px 4px rgba(0, 0, 0, 0.9);
      line-height: 1.2;
    }

    .fab-container {
      position: fixed;
      bottom: 16px;
      right: 16px;
      z-index: 9999;
      display: flex;
      flex-direction: column;
      gap: 8px;
      pointer-events: auto;
    }
    .fab {
      width: 40px;
      height: 40px;
      border-radius: 10px;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background: var(--sz-surface0, #313244);
      color: var(--sz-subtext, #a6adc8);
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      transition: background 0.2s, color 0.2s;
      box-shadow: 0 2px 8px rgba(0, 0, 0, 0.3);
    }
    .fab:hover {
      background: var(--sz-accent, #89b4fa);
      color: var(--sz-crust, #11111b);
    }
    .fab.active {
      background: var(--sz-accent, #89b4fa);
      color: var(--sz-crust, #11111b);
    }
    .fab svg {
      width: 18px;
      height: 18px;
      stroke: currentColor;
      fill: none;
      stroke-width: 2;
    }

    @media (max-width: 768px) {
      .icons-grid { display: none; }
      .fab-container { display: none; }
    }
  `;

  connectedCallback() {
    super.connectedCallback();
  }

  disconnectedCallback() {
    super.disconnectedCallback();
  }

  private handleAppClick(app: DesktopApp) {
    actions.dispatch(DESKTOP_ACTION.ICON_LAUNCH, {
      id: app.id,
      action: app.action,
      url: app.url,
      label: app.label,
      icon: app.icon,
    });
  }

  render() {
    const apps = registry.desktopApps;
    const showFabContainer = !mobileQuery.matches;

    return html`
      <div class="icons-grid">
        ${apps.map(app => html`
          <div class="icon-cell">
            <button
              class="app-icon"
              @dblclick=${() => this.handleAppClick(app)}
              @keydown=${(e: KeyboardEvent) => { if (e.key === 'Enter') this.handleAppClick(app); }}
              tabindex="0"
              title="Double-click to open ${app.label}"
            >
              <div class="icon-graphic">
                <sz-icon name="${app.icon}" size="22"></sz-icon>
              </div>
              <span class="icon-label">${app.label}</span>
            </button>
          </div>
        `)}
      </div>

      ${showFabContainer ? html`
        <div class="fab-container">
          <button class="fab ${this.tiled ? 'active' : ''}" @click=${() => actions.dispatch(DESKTOP_ACTION.TILE_TOGGLE)} title="Toggle tiling" aria-label="Toggle tiling">
            <svg viewBox="0 0 24 24"><rect x="2" y="2" width="9" height="9" rx="1"/><rect x="13" y="2" width="9" height="9" rx="1"/><rect x="2" y="13" width="9" height="9" rx="1"/><rect x="13" y="13" width="9" height="9" rx="1"/></svg>
          </button>
          <button class="fab" @click=${() => actions.dispatch(DESKTOP_ACTION.WALLPAPER_PREV)} title="Previous wallpaper" aria-label="Previous wallpaper">
            <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <button class="fab" @click=${() => actions.dispatch(DESKTOP_ACTION.WALLPAPER_NEXT)} title="Next wallpaper" aria-label="Next wallpaper">
            <svg viewBox="0 0 24 24"><polyline points="9 18 15 12 9 6"/></svg>
          </button>
        </div>
      ` : nothing}
    `;
  }
}
