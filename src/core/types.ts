export interface PaletteSource {
  id: string;
  prefix: string;
  placeholder: string;
  getItems(query: string): PaletteItem[] | Promise<PaletteItem[]>;
  execute(item: PaletteItem, args?: string[]): void;
}

export interface PaletteItem {
  id: string;
  label: string;
  description?: string;
  icon?: string;
  args?: PaletteItemArg[];
}

export interface PaletteItemArg {
  name: string;
  values?: string[];
}

// Global palette source registry — solves initialization timing.
// Wiring registers sources here; the palette reads them on connectedCallback.
class PaletteRegistry {
  private sources = new Map<string, PaletteSource>();

  register(source: PaletteSource): void {
    this.sources.set(source.id, source);
  }

  getByPrefix(prefix: string): PaletteSource | undefined {
    for (const s of this.sources.values()) {
      if (s.prefix === prefix) return s;
    }
    return undefined;
  }

  getAll(): PaletteSource[] {
    return [...this.sources.values()];
  }
}

export const paletteRegistry = new PaletteRegistry();

export interface WindowLayout {
  x: number;
  y: number;
  w: number;
  h: number;
}
