// Build-time roster of every custom element in the source tree, with the
// attributes each one accepts, so /styleguide/ can claim to show everything
// and be checkable rather than merely well-intentioned. scripts/check-
// styleguide.mjs compares this list against the page and fails the build on a
// component with no entry.
//
// Regex, not a TS parser: the declarations are decorator one-liners in a
// codebase that writes them one way, and a real parser would be a dependency
// plus a build step to read fifteen lines of metadata. If the shape ever
// drifts, the drift check is what notices — a component whose attributes stop
// parsing still shows up in the roster, just with none listed.

const { readdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src');

// Directories that contribute user-facing elements. app/ and core/ hold wiring
// and services, which have no elements to document.
const ROOTS = ['components', 'features', 'layouts'];

const TAG = /@customElement\(\s*['"]([a-z][a-z0-9-]*)['"]\s*\)/;
// Both shapes in the tree: `@property({ attribute: 'rows', … }) rows` and
// `@property({ type: Number }) size`, where the attribute name is the field.
const PROP_ATTR = /@property\(\s*\{[^}]*attribute:\s*['"]([a-z0-9-]+)['"][^}]*\}\s*\)/;
const PROP_FIELD = /@property\([^)]*\)\s*(?:readonly\s+)?([A-Za-z_$][\w$]*)/;

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (entry.name.endsWith('.ts')) out.push(full);
  }
  return out;
}

module.exports = function components() {
  const files = ROOTS.flatMap(root => walk(path.join(SRC, root)));
  const elements = [];

  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    const tag = source.match(TAG)?.[1];
    if (!tag) continue;

    const attributes = [];
    for (const line of source.split('\n')) {
      if (!line.includes('@property(')) continue;
      // `attribute: false` is a property with no attribute — a value pushed in
      // by the wiring layer, not something an author writes in markup.
      if (/attribute:\s*false/.test(line)) continue;
      const name = line.match(PROP_ATTR)?.[1] ?? line.match(PROP_FIELD)?.[1];
      if (name) attributes.push(name);
    }

    elements.push({
      tag,
      attributes,
      // Relative so the styleguide can link to source without baking in an
      // absolute path from whatever machine built the site.
      path: path.relative(SRC, file).split(path.sep).join('/'),
      directory: path.relative(SRC, path.dirname(file)).split(path.sep).join('/'),
    });
  }

  elements.sort((a, b) => a.tag.localeCompare(b.tag));
  return { elements };
};
