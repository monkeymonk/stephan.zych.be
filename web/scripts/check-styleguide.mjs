// Guards /styleguide/ against claiming completeness it does not have. The
// component roster on that page is generated from the source tree, so it can
// never miss an element — but a generated roster row is a name, not
// documentation. This checks the other half: that every element in the roster
// is either demonstrated live on the page or accounted for in one of the two
// reference tables, and that the ones which must never be instantiated twice
// are not.
//
// Failure mode it exists for: a component is added, the roster grows a row by
// itself, and nobody notices the page now lists a tag it does not document.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(__dirname, '..');
const require = createRequire(import.meta.url);

const paths = {
  body: path.join(webRoot, 'src/_includes/styleguide-body.njk'),
  icon: path.join(webRoot, 'src/components/ui/sz-icon.ts'),
};

const { elements } = require(path.join(webRoot, 'lib/components.js'))();
const body = readFileSync(paths.body, 'utf8');

const failures = [];

// Chrome that owns a document-level key or a fixed-position surface. A second
// instance re-binds the key or escapes the prose column, so these are
// documented and never demonstrated. Kept here rather than derived: it is a
// judgement about each component, and the page's prose states the same list.
const CHROME = new Set([
  'sz-background',
  'sz-copyright-footer',
  'sz-effect-confetti',
  'sz-effect-matrix',
  'sz-links',
  'sz-neovim',
  'sz-notifications',
  'sz-palette',
  'sz-screen-shader',
  'sz-slideshow',
  'sz-start-screen',
  'sz-statusbar',
  'sz-tmux-bar',
  'sz-tmux-panes',
  'sz-window',
  'sz-window-manager',
]);

// A live demo is an instance in the page source. The roster and the reference
// tables print tags inside markdown code spans (`sz-window`) and build them
// from `components.elements`, so neither can be mistaken for one.
const demoed = new Set([...body.matchAll(/<(sz-[a-z0-9-]+)\b/g)].map(m => m[1]));

// One element is never written by hand: the markdown pipeline rewrites a
// ```mermaid fence into `<sz-diagram><pre class="mermaid">`, so the page's
// diagram demo is a fence. Anchored on the same fence language the fence rule
// in .eleventy.js switches on.
if (/^```mermaid\s*$/m.test(body)) demoed.add('sz-diagram');

// A reference row is a key in the `chrome` or `hosts` maps the page declares
// and loops over. Matching the map keys, not the rendered rows, is what lets
// this read the template instead of building the site.
const referenced = new Set([...body.matchAll(/^\s*"(sz-[a-z0-9-]+)":/gm)].map(m => m[1]));

for (const { tag } of elements) {
  if (demoed.has(tag) || referenced.has(tag)) continue;
  const treatment = CHROME.has(tag)
    ? 'a row in the chrome reference table (it binds a document key or is position: fixed)'
    : 'a live demo: add `<' + tag + '>` to the Components section, or a reference row if it cannot be embedded';
  failures.push(`✗ ${tag} is in the roster but documented nowhere on /styleguide/ — it needs ${treatment}`);
}

// The inverse: chrome demonstrated live is the bug the reference tables exist
// to prevent, and it is silent — the page still renders, it just fights the
// instance already wrapping it.
for (const tag of CHROME) {
  if (!demoed.has(tag)) continue;
  failures.push(`✗ ${tag} appears as a live instance on /styleguide/ — it is chrome, so it belongs in the reference table only`);
}

// `sz-icon` carries a fixed in-module icon set and the page claims to show all
// of it. That claim is a hand-written list, so it is the one thing here that
// can drift without the roster noticing.
const iconSource = readFileSync(paths.icon, 'utf8');
const icons = [...iconSource.matchAll(/^ {2}'?([a-z][a-z-]*)'?:\s*svg`/gm)].map(m => m[1]);
if (icons.length === 0) {
  failures.push('✗ no icons parsed from sz-icon.ts — the icon-set check cannot run');
} else {
  const shown = new Set([...body.matchAll(/<sz-icon name="([a-z-]+)"/g)].map(m => m[1]));
  const missing = icons.filter(name => !shown.has(name));
  if (missing.length > 0) {
    failures.push(`✗ sz-icon ships ${icons.length} icons, /styleguide/ shows ${shown.size} — missing: ${missing.join(', ')}`);
  }
}

if (failures.length > 0) {
  for (const failure of failures) console.error(failure);
  process.exit(1);
}

console.log(`✓ /styleguide/ documents all ${elements.length} components (${demoed.size} demonstrated live, ${referenced.size} by reference) and all ${icons.length} icons`);
process.exit(0);
