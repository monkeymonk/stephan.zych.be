import { LitElement, html, css } from "lit";
import { customElement, state, property } from "lit/decorators.js";
import { StateController } from "../../core/state-controller.js";
import type { SocialLink } from "../../core/registry.js";
import { jsonArrayAttribute } from "../../core/data.js";
import { focusRing } from "../../core/styles.js";
import { actions, ROUTER_ACTION } from "../../core/actions.js";
import type { RouteChangedDetail } from "../../core/router.js";

@customElement("sz-statusbar")
export class SzStatusbar extends LitElement {
  /** Injected by the template. */
  @property({ attribute: "repo-url" }) repoUrl = "";
  @property({ attribute: "socials", converter: jsonArrayAttribute })
  socials: SocialLink[] = [];

  private stateCtrl = new StateController(this, ["theme", "windowMode"]);
  private routeUnsub?: () => void;

  @state() private route = window.location.pathname;

  connectedCallback() {
    super.connectedCallback();
    this.routeUnsub = actions.on(ROUTER_ACTION.ROUTE_CHANGED, (a) => {
      this.route = (a.payload as RouteChangedDetail).path;
    });
  }

  disconnectedCallback() {
    this.routeUnsub?.();
    super.disconnectedCallback();
  }

  static styles = css`
    ${focusRing}
    :host {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 24px;
      background: var(--sz-mantle, #181825);
      color: var(--sz-statusbar-text, #a6adc8);
      font-size: var(--sz-font-size, 13px);
      padding: 0 12px;
      gap: 12px;
      user-select: none;
      border-top: 1px solid var(--sz-surface0, #313244);
    }
    .segment {
      display: flex;
      align-items: center;
      gap: 8px;
    }
    .mode {
      background: var(--sz-statusbar-accent, #89b4fa);
      color: var(--sz-crust, #11111b);
      padding: 1px 8px;
      border-radius: 2px;
      font-weight: 700;
      font-size: var(--sz-font-size, 13px);
      text-transform: uppercase;
    }
    .route {
      color: var(--sz-text, #cdd6f4);
    }
    .branch {
      color: var(--sz-mauve, #cba6f7);
      text-decoration: none;
      display: inline-flex;
      align-items: center;
      gap: 4px;
    }
    .branch:hover {
      opacity: 0.8;
    }
    .separator {
      color: var(--sz-overlay0, #6c7086);
    }
    .info {
      color: var(--sz-overlay1, #7f849c);
    }
    .social-link {
      color: var(--sz-subtext, #a6adc8);
      text-decoration: none;
      transition: color 0.2s;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      min-width: 24px;
      min-height: 24px;
    }
    .social-link:hover {
      color: var(--sz-accent, #89b4fa);
    }
    .socials {
      display: flex;
      align-items: center;
      /* gap 0: 24px icon hit targets (WCAG 2.5.8) keep ~12px between glyphs. */
      gap: 0;
      margin-right: 5px;
    }

    @media (max-width: 768px) {
      .center {
        display: none;
      }
      .info,
      .separator {
        display: none;
      }
    }
  `;

  private routeToPath(route: string): string {
    if (route === "/") return "~/index";
    return "~" + route.replace(/\/$/, "").replace(/\//g, "/");
  }

  render() {
    const theme = this.stateCtrl.get("theme");

    return html`
      <div class="segment" role="status">
        <span class="mode">NORMAL</span>
        <span class="route">${this.routeToPath(this.route)}</span>
      </div>
      <div class="segment center">
        <a class="branch" href="${this.repoUrl}" target="_blank" rel="noopener"
          ><sz-icon name="git-branch" size="12"></sz-icon> main</a
        >
      </div>
      <div class="segment">
        <span class="info">${theme}</span>
        <span class="separator">|</span>
        <span class="info">utf-8</span>
        <span class="separator">|</span>
        <span class="socials">
          ${this.socials.map(
            (link) => html`
              <a
                class="social-link"
                href="${link.url}"
                target="${link.url.startsWith("mailto:") ? "" : "_blank"}"
                rel="noopener"
                aria-label="${link.label}"
              >
                <sz-icon name="${link.icon}" size="12"></sz-icon>
              </a>
            `,
          )}
        </span>
      </div>
    `;
  }
}
