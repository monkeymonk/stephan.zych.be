import { ReactiveController, ReactiveControllerHost, TemplateResult, html, nothing } from 'lit';

export type GutterIcon = {
  line: number;
  icon: string;
  color: string;
};

export type GutterRange = {
  start: number;
  end: number;
  color: string;
  label?: string;
};

export interface LineGutterControllerOptions {
  numbers?: number;
  startLine?: number;
  highlight?: number | number[];
  activeLines?: number[];
  icons?: GutterIcon[];
  ranges?: GutterRange[];
}

export class LineGutterController implements ReactiveController {
  private readonly host: ReactiveControllerHost;
  private numbers: number;
  private startLine: number;
  private highlight = new Set<number>();
  private activeLines = new Set<number>();
  private icons: GutterIcon[];
  private ranges: GutterRange[];

  constructor(host: ReactiveControllerHost, options: LineGutterControllerOptions = {}) {
    this.host = host;
    this.numbers = options.numbers ?? 0;
    this.startLine = options.startLine ?? 1;
    this.highlight = this.toSet(options.highlight);
    this.activeLines = new Set(options.activeLines ?? []);
    this.icons = options.icons ?? [];
    this.ranges = options.ranges ?? [];
    host.addController(this);
  }

  hostDisconnected() {
    // No teardown required; this keeps the controller structurally compatible with Lit.
  }

  render(): TemplateResult {
    const total = Math.max(0, this.numbers);

    return html`
      ${Array.from({ length: total }, (_, index) => {
        const line = this.startLine + index;
        const icon = this.icons.find((entry) => entry.line === line);
        const ranges = this.ranges.filter((entry) => line >= entry.start && line <= entry.end);
        const active = this.activeLines.has(line);
        const highlighted = this.highlight.has(line);

        return html`
          <div
            class="sz-line-gutter__row"
            data-line=${line}
            ?data-active=${active}
            ?data-highlight=${highlighted}
          >
            <span class="sz-line-gutter__number">${line}</span>
            ${icon ? html`
              <span class="sz-line-gutter__icon" style=${`color: ${icon.color};`} title=${icon.icon}>
                ${icon.icon}
              </span>
            ` : nothing}
            ${ranges.map((range) => html`
              <span
                class="sz-line-gutter__range"
                style=${`--sz-line-gutter-range: ${range.color}; color: ${range.color};`}
                title=${range.label ?? `${range.start}-${range.end}`}
              >
                ${range.label ?? nothing}
              </span>
            `)}
          </div>
        `;
      })}
    `;
  }

  setActiveLines(lines: number[] = []) {
    this.activeLines = new Set(lines);
    this.host.requestUpdate();
  }

  setRanges(ranges: GutterRange[] = []) {
    this.ranges = [...ranges];
    this.host.requestUpdate();
  }

  private toSet(value: number | number[] | undefined) {
    if (typeof value === 'number') {
      return new Set([value]);
    }

    return new Set(value ?? []);
  }
}
