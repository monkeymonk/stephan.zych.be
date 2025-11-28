import { html, css } from 'lit';
import { customElement, property } from 'lit/decorators.js';
import { panelStyles, mdStyles } from '../core/styles.js';
import { jsonArrayAttribute } from '../core/data.js';
import { ViewAwareElement } from '../core/view-aware.js';

interface Commit {
  hash: string;
  ref?: string;
  message: string;
  date: string;
}

/**
 * Career history rendered as `git log --graph`. Data via the template:
 *   <sz-gitlog commits='[{"hash":"...","message":"...","date":"..."}]'></sz-gitlog>
 */
@customElement('sz-gitlog')
export class SzGitlog extends ViewAwareElement {
  @property({ attribute: 'commits', converter: jsonArrayAttribute }) commits: Commit[] = [];

  static styles = [panelStyles, mdStyles, css`
    :host { display: block; }
    .log {
      position: relative;
      padding-left: 4px;
    }
    .log::before {
      content: "";
      position: absolute;
      left: 6px;
      top: 12px;
      bottom: 12px;
      width: 2px;
      background: var(--sz-surface1, #45475a);
    }
    .commit {
      position: relative;
      padding: 8px 0 8px 26px;
      line-height: 1.5;
    }
    .commit::before {
      content: "";
      position: absolute;
      left: 1px;
      top: 11px;
      width: 12px;
      height: 12px;
      border-radius: 50%;
      background: var(--sz-base, #1e1e2e);
      box-shadow: 0 0 0 2px var(--sz-overlay0, #6c7086);
    }
    .commit--head::before {
      background: var(--sz-green, #a6e3a1);
      box-shadow: 0 0 0 2px var(--sz-green, #a6e3a1),
        0 0 12px color-mix(in srgb, var(--sz-green, #a6e3a1) 60%, transparent);
    }
    .line1 { display: flex; flex-wrap: wrap; align-items: baseline; gap: 8px; }
    .hash { color: var(--sz-yellow, #f9e2af); }
    .ref {
      color: var(--sz-green, #a6e3a1);
      font-weight: 700;
    }
    .msg { color: var(--sz-text, #cdd6f4); }
    .date {
      color: var(--sz-overlay1, #7f849c);
      font-size: calc(var(--sz-font-size, 13px) * 0.85);
      margin-left: auto;
      white-space: nowrap;
    }
  `];

  renderCode() {
    return html`
      <div class="md">
        <div class="md__h">experience</div>
        <ul class="md__list">
          ${this.commits.map(c => html`<li><span class="md__key">${c.hash}</span> ${c.message} <span class="md__dim">(${c.date})</span></li>`)}
        </ul>
      </div>
    `;
  }

  renderGlow() {
    return html`
      <div class="panel">
        <div class="panel__cmd"><span class="sigil">❯</span>git log --graph --oneline</div>
        <div class="panel__body">
          <div class="log">
            ${this.commits.map((c, i) => html`
              <div class="commit ${i === 0 ? 'commit--head' : ''}">
                <div class="line1">
                  <span class="hash">${c.hash}</span>
                  ${c.ref ? html`<span class="ref">(${c.ref})</span>` : ''}
                  <span class="msg">${c.message}</span>
                  <span class="date">${c.date}</span>
                </div>
              </div>
            `)}
          </div>
        </div>
      </div>
    `;
  }
}
