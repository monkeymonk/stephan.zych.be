// Lazy Mermaid renderer. The `mermaid` package is heavy, so it is only
// dynamically imported when a page actually contains a `<pre class="mermaid">`
// block (emitted from ```mermaid fences by the markdown pipeline). esbuild
// code-splitting puts it in its own chunk, kept out of the main bundle.

const PALETTE_FALLBACK: Record<string, string> = {
  base: '#1e1e2e',
  surface0: '#313244',
  surface1: '#45475a',
  overlay1: '#7f849c',
  text: '#cdd6f4',
  subtext: '#a6adc8',
  accent: '#89b4fa',
  green: '#a6e3a1',
  lavender: '#b4befe',
};

function palette(name: string): string {
  const v = getComputedStyle(document.documentElement)
    .getPropertyValue(`--sz-${name}`)
    .trim();
  return v || PALETTE_FALLBACK[name];
}

let initialized = false;

// Renders any unprocessed `pre.mermaid` blocks on the current page. Safe to
// call repeatedly (initial load + each SPA navigation): mermaid skips nodes it
// has already marked, so only freshly-swapped diagrams are rendered.
export async function initMermaid(): Promise<void> {
  const nodes = Array.from(
    document.querySelectorAll<HTMLElement>("pre.mermaid:not([data-processed])"),
  );
  if (nodes.length === 0) return;

  const { default: mermaid } = await import("mermaid");

  if (!initialized) {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: "strict",
      theme: "base",
      fontFamily:
        "var(--sz-font-family, 'JetBrains Mono', ui-monospace, monospace)",
      themeVariables: {
        background: palette("base"),
        primaryColor: palette("surface0"),
        primaryTextColor: palette("text"),
        primaryBorderColor: palette("accent"),
        secondaryColor: palette("surface1"),
        tertiaryColor: palette("base"),
        lineColor: palette("accent"),
        textColor: palette("text"),
        mainBkg: palette("surface0"),
        nodeBorder: palette("accent"),
        clusterBkg: palette("base"),
        clusterBorder: palette("surface1"),
        titleColor: palette("text"),
        edgeLabelBackground: palette("base"),
        noteBkgColor: palette("surface1"),
        noteTextColor: palette("text"),
        noteBorderColor: palette("overlay1"),
      },
    });
    initialized = true;
  }

  try {
    await mermaid.run({ nodes });
  } catch (err) {
    // A bad diagram should never break the page — leave the source visible.
    console.error("mermaid render failed", err);
  }
}
