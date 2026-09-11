// The architecture gate. Fails (exit 1) on any of:
//
//   1. a document/window keydown listener outside the four files allowed to
//      have one
//   2. a DOM probe for an overlay's reflected state
//   3. an overlay component that does not declare itself to the registry
//   4. a feature or component directory with no README (or a feature with no
//      actions.ts)
//   5. a custom element defined inside the wiring layer
//
// Why this exists: the keyboard and overlay layers were centralized precisely
// because thirteen independent keydown listeners and four DOM probes had grown
// up in parallel, each re-deriving "may I handle this key right now?" and
// getting it subtly differently. A pattern that is not enforced decays back
// into that, so the rule is mechanical rather than remembered.
//
// Deliberately NOT checked: the "wiring composes, it never accumulates domain
// data" rule. It is real and it is in the contract, but every mechanical
// approximation of it (line counts, string-literal heuristics) flagged
// legitimate code, and a check that cries wolf gets commented out. That one
// stays a review rule.

import { readdirSync, readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const src = path.join(here, '..', 'src');

// Rule 1. The only places a global keydown listener may live, each because it
// implements something the keymap must not own:
const KEYDOWN_ALLOWED = new Map([
  ['core/keymap.ts', 'the one dispatcher every binding routes through'],
  ['features/window-manager/focus-trap.ts', 'capture-phase Tab containment for a modal surface'],
  ['layouts/sz-portfolio.ts', 'roving tabindex inside its own grid'],
  ['features/neovim/sz-palette.ts', 'capture-phase Tab, the aria-modal contract'],
]);

const failures = [];

function walk(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const files = walk(src).filter(f => f.endsWith('.ts'));
const rel = f => path.relative(src, f).split(path.sep).join('/');

for (const file of files) {
  const id = rel(file);
  const source = readFileSync(file, 'utf8');
  // Patterns are matched against code only. These files explain the removed
  // probes and the sanctioned listeners in prose, and a gate that flags its own
  // documentation teaches people to delete the documentation.
  const code = source
    .split('\n')
    .filter(line => !/^\s*(?:\/\/|\/\*|\*)/.test(line))
    .join('\n');

  // 1. global keydown listeners
  if (/(?:document|window)\.addEventListener\(\s*['"]keydown['"]/.test(code) && !KEYDOWN_ALLOWED.has(id)) {
    failures.push(
      `${id}: registers a global keydown listener.\n` +
      `       Site-wide keys are declared as bindings (core/keymap.ts + KeymapController).\n` +
      `       Only these files may listen directly:\n` +
      [...KEYDOWN_ALLOWED].map(([f, why]) => `         ${f} — ${why}`).join('\n'),
    );
  }

  // 2. overlay state read from the DOM
  const probe = code.match(/querySelector(?:All)?\(\s*['"]sz-[a-z-]+\[[^\]]+\]/);
  if (probe) {
    failures.push(
      `${id}: probes an overlay's reflected attribute (${probe[0]}…).\n` +
      `       Ask overlayRegistry (core/overlays.ts) instead. The attribute is for CSS;\n` +
      `       reading it as state is what forced synchronous attribute writes.`,
    );
  }

  // 3. an overlay that never registers
  const isElement = /@customElement\(/.test(code);
  const hasOpenState = /@state\(\)\s+(?:private\s+)?open\b/.test(code);
  if (isElement && hasOpenState && !code.includes('OverlayController')) {
    failures.push(
      `${id}: has \`open\` state but no OverlayController.\n` +
      `       An overlay that does not declare itself cannot be closed when another\n` +
      `       one opens, which is how two aria-modal surfaces end up on screen at once.`,
    );
  }

  // 5. elements defined in the wiring layer
  if (id.startsWith('app/wiring/') && isElement) {
    failures.push(`${id}: defines a custom element. The wiring layer composes; it does not implement.`);
  }
}

// 4. documentation of every feature and component group
for (const group of ['features', 'components']) {
  const root = path.join(src, group);
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const dir = path.join(root, entry.name);
    if (!existsSync(path.join(dir, 'README.md'))) {
      failures.push(`${group}/${entry.name}/: no README.md. Document what it owns, and which actions it listens for and dispatches.`);
    }
    if (group === 'features' && !existsSync(path.join(dir, 'actions.ts'))) {
      const hasElement = walk(dir).some(f => f.endsWith('.ts') && /@customElement\(/.test(readFileSync(f, 'utf8')));
      if (hasElement) {
        failures.push(`features/${entry.name}/: no actions.ts. A feature with an element states its action names in one place.`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(`\n✗ architecture gate failed — ${failures.length} violation(s)\n`);
  for (const f of failures) console.error(`  ${f}\n`);
  process.exit(1);
}

console.log(`✓ architecture gate passed — ${files.length} source files, ${KEYDOWN_ALLOWED.size} sanctioned keydown listeners, every feature and component group documented`);
