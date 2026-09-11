// The three-way keybinding drift check. A key's meaning is declared in three
// places — the web keymap (`web/src/**/*.ts`), the TUI table (`tui/keymap.go`)
// and the human copy both runtimes render (`content/data/shortcuts.json`) —
// and nothing but this script makes them agree. Fails (exit 1) with a named
// report; prose differences are printed as warnings and do not gate.
//
//   node scripts/check-keybindings.mjs
//
// Why it exists: the TUI's old help table in commands.go had already drifted
// from the code it documented ("esc / h / q → back", while `q` on the home
// screen quit outright), and the WCAG 2.1.4 `chars` decision used to be
// re-derived at eight web callsites, one of which had it wrong. Both defects
// are invisible to a compiler and to every other gate in this repo.
//
// WHAT THE PARSE COVERS, honestly:
//
//   Web — a regex scan, the same technique web/lib/components.js uses for
//   `@customElement`. It finds object literals that carry both a `keys:` array
//   and a `chars:` boolean, and reads `id`, `keys`, `alt`/`ctrl`/`meta`,
//   `scope`, `chars` and `description` out of them. It does NOT run the
//   TypeScript: a literal is matched where it is written, not where it is
//   registered, so a binding built behind a condition is counted as if it were
//   always live, and `when()` guards are invisible to it. Five bindings have a
//   `keys:` that is an expression rather than a string (the palette prefixes,
//   the palette refocus key, the Alt+digit tab switches, the nav-tab letters
//   and the tmux pane keys); each is resolved explicitly in GENERATED below,
//   from its callsites or from the content file that supplies the letters. A
//   new generated binding that this file has not been taught about is a
//   failure, not a silent omission — `:` and `/` are generated, and a drift
//   check that quietly skipped the two most important keys on the site would
//   be theatre.
//
//   TUI — the rows of `keyTable` in tui/keymap.go: id, the `key.WithKeys`
//   strings and the `key.WithHelp` text. The content-driven nav-tab row
//   carries no keys of its own (see matchNavTab); it is expanded from
//   content/data/nav.json, which is where the TUI reads them at runtime.
//
//   Shared copy — content/data/shortcuts.json is prose for humans, not a
//   binding table. Rows that describe a range or a command rather than one
//   keystroke are listed in PROSE_ROWS and handled as prose.
//
// Because the parse is regex, a refactor could make it match nothing and every
// assertion below would vacuously pass. The floors in section 5 exist for that
// case alone: they catch a broken parse, not an inventory change.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');

const paths = {
  webSrc: path.join(repoRoot, 'web/src'),
  keymapGo: path.join(repoRoot, 'tui/keymap.go'),
  shortcuts: path.join(repoRoot, 'content/data/shortcuts.json'),
  nav: path.join(repoRoot, 'content/data/nav.json'),
};

const failures = [];
const warnings = [];

const navTabs = JSON.parse(readFileSync(paths.nav, 'utf8')).tabs;

// ─── key normalisation ──────────────────────────────────────────────────────
//
// The three sources spell the same keystroke three ways: the web uses
// `KeyboardEvent.key` ('Escape', 'ArrowDown', ' '), the TUI uses bubbletea's
// names ('esc', 'down'), and the shared copy uses display text ('Esc',
// 'Alt+W'). Everything is canonicalised to one lowercase token per named key,
// with modifiers prefixed. Character keys keep their case: `G` and `g` are
// different bindings in both runtimes.
const NAMED_KEYS = new Map([
  ['escape', 'esc'],
  ['esc', 'esc'],
  ['arrowup', 'up'],
  ['arrowdown', 'down'],
  ['arrowleft', 'left'],
  ['arrowright', 'right'],
  ['up', 'up'],
  ['down', 'down'],
  ['left', 'left'],
  ['right', 'right'],
  ['enter', 'enter'],
  ['tab', 'tab'],
  ['home', 'home'],
  ['end', 'end'],
  ['pageup', 'pgup'],
  ['pagedown', 'pgdn'],
  ['pgup', 'pgup'],
  ['pgdown', 'pgdn'],
  ['backspace', 'backspace'],
  ['space', 'space'],
  [' ', 'space'],
]);

/** One canonical key token: `alt+w`, `esc`, `G`, `[`. */
function canonKey(raw, mods = {}) {
  const named = NAMED_KEYS.get(String(raw).toLowerCase());
  // A modifier spells its letter in whatever case the source felt like
  // ('Alt+W' in the copy, `keys: ['w'], alt: true` in the code); unmodified
  // character keys are case-significant and stay untouched.
  const base = named ?? (Object.keys(mods).length > 0 ? String(raw).toLowerCase() : String(raw));
  const prefix = ['ctrl', 'alt', 'meta', 'shift'].filter((m) => mods[m]);
  return [...prefix, base].join('+');
}

/** A whole keystroke, sequences joined by a space: `g g`. */
function canonSeq(keys, mods = {}) {
  return keys.map((k) => canonKey(k, mods)).join(' ');
}

// ─── 1. web bindings ────────────────────────────────────────────────────────

function walkTs(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkTs(p, out);
    else if (entry.name.endsWith('.ts')) out.push(p);
  }
  return out;
}

// Where a binding literal starts. Two spellings: `id: <expr>` and the `id,`
// shorthand the two generator functions use. The window a literal's fields are
// read from ends at the next anchor, so a non-binding literal (an overlay
// registration, a palette source) cannot borrow the next binding's `keys:`.
const ANCHOR = /\bid[ \t]*:[ \t]*('[^']*'|"[^"]*"|`[^`]*`|[A-Za-z_$][\w.$]*)|^[ \t]*id[ \t]*,[ \t]*$/gm;
const WINDOW_MAX = 1200;

const STRINGS = /'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"/g;

function literalStrings(text) {
  return [...text.matchAll(STRINGS)].map((m) => m[1] ?? m[2]);
}

// Comments are blanked, offsets and newlines preserved so reported line
// numbers still point at the source. KeymapController's doc comment contains a
// complete, correct KeyBinding as a usage example, and a binding in a comment
// is documentation, not a registration.
function stripComments(text) {
  const blank = (m) => m.replace(/[^\n]/g, ' ');
  return text.replace(/\/\*[\s\S]*?\*\//g, blank).replace(/^[ \t]*\/\/[^\n]*$/gm, blank);
}

// Reads the bracketed array that follows `keys:` at `from`. Quote-aware on
// purpose: `keys: [']']` binds the right bracket, and a `[^\]]*` match stops
// inside the quotes and silently loses the binding.
function readKeysArray(text, from) {
  const open = text.indexOf('[', from);
  if (open < 0) return null;
  let quote = null;
  for (let i = open + 1; i < text.length; i++) {
    const ch = text[i];
    if (quote) {
      if (ch === '\\') i++;
      else if (ch === quote) quote = null;
      continue;
    }
    if (ch === "'" || ch === '"' || ch === '`') quote = ch;
    else if (ch === ']') return text.slice(open + 1, i);
    else if (ch === '\n' && text.slice(open, i).length > 200) return null;
  }
  return null;
}

/**
 * Bindings whose `keys:` is an expression the regex cannot evaluate, keyed by
 * `<file>::<id expression>` so the entry survives the line moving. Each
 * resolver returns the concrete bindings that literal stands for; scope,
 * modifiers and `chars` still come from the literal itself, so a generator
 * that stopped gating its keys correctly is still caught.
 */
const GENERATED = new Map([
  // sz-palette.ts: `prefixBinding(id, prefix, description)`. The id, the key
  // and the copy are all literal at the callsite.
  [
    'web/src/features/neovim/sz-palette.ts::<shorthand>',
    (text) =>
      [...text.matchAll(/prefixBinding\(\s*'([^']+)'\s*,\s*'([^']+)'\s*,\s*'([^']*)'\s*\)/g)].map((m) => ({
        id: m[1],
        keys: [m[2]],
        description: m[3],
      })),
  ],
  // sz-palette.ts: `palette.refocus` re-binds whichever prefix opened the
  // palette, so its key set is exactly the set of opener prefixes above.
  [
    "web/src/features/neovim/sz-palette.ts::'palette.refocus'",
    (text) =>
      [...text.matchAll(/prefixBinding\(\s*'[^']+'\s*,\s*'([^']+)'/g)].map((m) => ({
        id: 'palette.refocus',
        keys: [m[1]],
      })),
  ],
  // sz-tmux-bar.ts: Alt+1…Alt+9, positional. All nine are registered whatever
  // the nav holds — a digit past the end deliberately goes unconsumed.
  [
    'web/src/features/tmux/sz-tmux-bar.ts::`tabs.switch.${index + 1}`',
    () => Array.from({ length: 9 }, (_, i) => ({ id: `tabs.switch.${i + 1}`, keys: [String(i + 1)] })),
  ],
  // sz-tmux-bar.ts: the nav-tab letters, derived from the tab name exactly as
  // the source derives them. The TUI reads the `key` field of the same file
  // instead, so the parity sweep below is what compares the two derivations.
  [
    'web/src/features/tmux/sz-tmux-bar.ts::`nav.tab.${tab.name}`',
    () => navTabs.map((tab) => ({ id: `nav.tab.${tab.name}`, keys: [tab.name.charAt(0).toLowerCase()] })),
  ],
  // sz-tmux-panes.ts: `paneBindings(id, keys, step)` — one binding per key.
  [
    'web/src/features/tmux/sz-tmux-panes.ts::<shorthand>',
    (text) =>
      [...text.matchAll(/paneBindings\(\s*'([^']+)'\s*,\s*\[([^\]]*)\]/g)].flatMap((m) =>
        literalStrings(m[2]).map((k) => ({ id: m[1], keys: [k] }))
      ),
  ],
]);

function parseWebBindings() {
  const bindings = [];
  for (const file of walkTs(paths.webSrc).sort()) {
    const rel = path.relative(repoRoot, file);
    const text = stripComments(readFileSync(file, 'utf8'));
    const anchors = [...text.matchAll(ANCHOR)];
    for (let i = 0; i < anchors.length; i++) {
      const start = anchors[i].index;
      const end = Math.min(anchors[i + 1]?.index ?? text.length, start + WINDOW_MAX);
      const window = text.slice(start, end);

      const keysAt = window.search(/\bkeys[ \t]*:[ \t]*\[/);
      const keysInner = keysAt < 0 ? null : readKeysArray(window, keysAt);
      const charsMatch = window.match(/\bchars[ \t]*:[ \t]*(true|false)\b/);
      // A KeyBinding is the literal that declares both; anything else with an
      // `id` (overlay registrations, palette sources, command items) is not
      // one and is skipped.
      if (keysInner === null || !charsMatch) continue;

      const scopeMatch = window.match(/\bscope[ \t]*:[ \t]*['"`]([^'"`]*)['"`]/);
      const descMatch = window.match(/\bdescription[ \t]*:[ \t]*('((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)")/);
      const mods = {};
      for (const mod of ['alt', 'ctrl', 'meta']) {
        if (new RegExp(`\\b${mod}[ \\t]*:[ \\t]*true\\b`).test(window)) mods[mod] = true;
      }
      const line = text.slice(0, start).split('\n').length;
      const base = {
        file: rel,
        line,
        scope: scopeMatch?.[1] ?? '(unparsed)',
        chars: charsMatch[1] === 'true',
        mods,
      };
      const description = (descMatch?.[2] ?? descMatch?.[3])?.replace(/\\(.)/g, '$1');
      const idExpr = anchors[i][1];

      const keys = literalStrings(keysInner);
      if (keys.length > 0) {
        bindings.push({ ...base, id: idExpr ? idExpr.slice(1, -1) : '(shorthand)', keys, description });
        continue;
      }

      const generatedKey = `${rel}::${idExpr ?? '<shorthand>'}`;
      const resolve = GENERATED.get(generatedKey);
      if (!resolve) {
        failures.push(
          `✗ ${rel}:${line} declares a binding whose keys the check cannot evaluate ([${keysInner.trim()}]).\n` +
            `    Teach GENERATED in scripts/check-keybindings.mjs how to resolve "${generatedKey}".`
        );
        continue;
      }
      const resolved = resolve(text);
      if (resolved.length === 0) {
        failures.push(`✗ ${rel}:${line} is a generated binding but "${generatedKey}" resolved to nothing`);
        continue;
      }
      for (const r of resolved) {
        bindings.push({ ...base, id: r.id, keys: r.keys, description: r.description ?? description, generated: true });
      }
    }
  }
  return bindings;
}

const web = parseWebBindings();

// ─── 2. TUI bindings ────────────────────────────────────────────────────────

function parseTuiBindings() {
  const text = stripComments(readFileSync(paths.keymapGo, 'utf8'));
  const tableStart = text.indexOf('var keyTable = []binding{');
  if (tableStart < 0) {
    failures.push('✗ tui/keymap.go has no `var keyTable = []binding{` — the TUI side of the check cannot run');
    return [];
  }
  // The table ends at the first line that closes it at column zero; matchNavTab
  // further down declares a binding too and must not be read as a table row.
  const tableEnd = text.indexOf('\n}\n', tableStart);
  const table = text.slice(tableStart, tableEnd < 0 ? text.length : tableEnd);

  const anchors = [...table.matchAll(/^\t\tid:[ \t]*(.+?),?[ \t]*$/gm)];
  const rows = [];
  for (let i = 0; i < anchors.length; i++) {
    const start = anchors[i].index;
    const window = table.slice(start, anchors[i + 1]?.index ?? table.length);
    const idExpr = anchors[i][1].trim();
    const id = /^"/.test(idExpr) ? idExpr.slice(1, -1) : idExpr;
    const line = text.slice(0, tableStart + start).split('\n').length;

    const withKeys = window.match(/key\.WithKeys\(([^)]*)\)/);
    const withHelp = window.match(/key\.WithHelp\(([^)]*)\)/);
    const scope = window.match(/\bscope:[ \t]*(\w+)/)?.[1] ?? '(unparsed)';
    const keys = withKeys ? literalStrings(withKeys[1]) : [];
    const help = withHelp ? literalStrings(withHelp[1]) : [];

    if (id === 'navTabsID') {
      // The placeholder row. resolve() expands it from the Model's home links,
      // which are content/data/nav.json — the corpus is never transcribed into
      // Go, so it is read from the same file here.
      for (const tab of navTabs) {
        rows.push({ id: `nav.tab.${tab.name}`, keys: [tab.key], help: [], scope, line, generated: true });
      }
      continue;
    }
    rows.push({ id, keys, help, scope, line });
  }
  return rows;
}

const tui = parseTuiBindings();

// ─── 3. the shared copy ─────────────────────────────────────────────────────

const shortcuts = JSON.parse(readFileSync(paths.shortcuts, 'utf8'));

// Rows that describe a range or a command rather than one keystroke. They are
// copy, and expanding them into bindings would invent keys nobody bound:
// Alt+1-5 is five of nine positional bindings, and `:set keys off` is a
// palette command typed into an input, not a shortcut.
const PROSE_ROWS = new Set(['Alt+1-5', ':set keys off']);

// Keys the shared copy documents that are deliberately NOT in either keymap.
// Tab is the focus trap's and the palette's, held in a capture-phase listener
// because it is the `aria-modal` Tab contract — an intrinsic widget mechanic,
// never registered (contracts §2, rows 9 and 12).
const INTRINSIC_DOCUMENTED = new Set(['tab']);

/** Parse a copy `keys` cell into canonical keystrokes. `j / k` is two, `g g` is one. */
function parseCopyKeys(cell) {
  return cell.split(' / ').map((alt) =>
    alt
      .trim()
      .split(/\s+/)
      .map((token) => {
        const parts = token.split('+');
        const base = parts.pop();
        const mods = {};
        for (const m of parts) mods[m.toLowerCase()] = true;
        return canonKey(base, mods);
      })
      .join(' ')
  );
}

const documented = [];
for (const row of shortcuts) {
  if (PROSE_ROWS.has(row.keys)) continue;
  for (const keystroke of parseCopyKeys(row.keys)) {
    documented.push({ keystroke, cell: row.keys, description: row.description });
  }
}

// ─── 4. indexes ─────────────────────────────────────────────────────────────

const webByKeystroke = new Map();
for (const b of web) {
  const keystroke = canonSeq(b.keys, b.mods);
  b.keystroke = keystroke;
  if (!webByKeystroke.has(keystroke)) webByKeystroke.set(keystroke, []);
  webByKeystroke.get(keystroke).push(b);
}

/** Individual canonical keys a runtime uses, sequences flattened. */
function keyUniverse(bindings, mods = true) {
  const set = new Set();
  for (const b of bindings) {
    for (const k of b.keys) {
      if (k === 'any key') continue; // the TUI's catch-all sentinel, not a key
      set.add(mods ? canonKey(k, b.mods ?? {}) : canonKey(k));
    }
  }
  return set;
}

const webKeys = keyUniverse(web);
// The TUI writes its modifiers into the key string itself ("ctrl+c"), so each
// token is already canonical once split.
const tuiKeys = new Set(
  [...keyUniverse(tui)].map((k) => {
    const parts = k.split('+');
    const base = parts.pop();
    return canonKey(base, Object.fromEntries(parts.map((m) => [m, true])));
  })
);

// ─── 5. the parse must have found something ─────────────────────────────────
//
// Floors, not counts: they fail a parse that stopped matching, and say nothing
// about whether a binding may be added or removed.
const MIN_WEB = 30;
const MIN_TUI = 25;
if (web.length < MIN_WEB) {
  failures.push(`✗ only ${web.length} web bindings parsed out of web/src (expected at least ${MIN_WEB}) — the parse is broken, not the tree`);
}
if (tui.length < MIN_TUI) {
  failures.push(`✗ only ${tui.length} TUI bindings parsed out of tui/keymap.go (expected at least ${MIN_TUI}) — the parse is broken, not the tree`);
}
if (documented.length === 0) {
  failures.push('✗ no keystrokes parsed out of content/data/shortcuts.json — the copy side of the check cannot run');
}

// ─── 6. assertion 1: one registration per (id, keystroke) ───────────────────
//
// Two bindings may share an id — a character key and its arrow twin are one
// action, and the inventory forbids a second id for it. The same id on the
// same keystroke is a duplicate registration, which resolves to whichever was
// registered first and leaves the other dead.
const seen = new Map();
for (const b of web) {
  const pair = `${b.id} → ${b.keystroke}`;
  const prior = seen.get(pair);
  if (prior) {
    failures.push(`✗ duplicate web binding ${pair}: ${prior.file}:${prior.line} and ${b.file}:${b.line}`);
  } else {
    seen.set(pair, b);
  }
}

// ─── 7. assertion 2: the WCAG 2.1.4 `chars` gate is coherent ────────────────
//
// The three prefixes are the switch's own control surface: gated, a
// keyboard-only user who ran `:set keys off` could never type `:set keys on`
// again. Nothing else may be exempt — a fourth entry here has to be argued for
// in a review, which is the entire point of hardcoding the list.
const CHARS_EXEMPT = new Set(['palette.command', 'palette.search', 'palette.help']);

// Keys outside WCAG 2.1.4 whatever their scope: not character keys.
const NON_CHARACTER = new Set(['esc', 'tab', 'up', 'down', 'left', 'right', 'home', 'end', 'pgup', 'pgdn', 'enter', 'backspace', 'space']);

for (const b of web) {
  const where = `${b.file}:${b.line}`;
  const modified = Object.keys(b.mods).length > 0;
  const tokens = b.keys.map((k) => canonKey(k));
  const character = !modified && tokens.every((t) => !NON_CHARACTER.has(t));

  if (!character && b.chars) {
    const why = modified ? 'is modified' : 'is not a character key';
    failures.push(`✗ ${b.id} (${b.keystroke}) at ${where} ${why} but declares chars: true — it is outside WCAG 2.1.4 and must not answer to the switch`);
    continue;
  }
  if (!character) continue;

  // An overlay owns focus (aria-modal, focus inside its own listbox), which is
  // exactly the WCAG 2.1.4 exemption for shortcuts active only while a
  // component has focus.
  if (b.scope.startsWith('overlay:')) {
    if (b.chars) {
      failures.push(`✗ ${b.id} (${b.keystroke}) at ${where} is overlay-scoped and must be chars: false — the overlay already owns focus`);
    }
    continue;
  }
  if (CHARS_EXEMPT.has(b.id)) {
    if (b.chars) failures.push(`✗ ${b.id} (${b.keystroke}) at ${where} is a sanctioned exemption and must stay chars: false`);
    continue;
  }
  if (!b.chars) {
    failures.push(
      `✗ ${b.id} (${b.keystroke}) at ${where} is a bare character shortcut declared chars: false.\n` +
        '    WCAG 2.1.4 requires it to answer to `:set keys on|off`. If it genuinely must not,\n' +
        '    add its id to CHARS_EXEMPT in scripts/check-keybindings.mjs with the reason.'
    );
  }
}

// ─── 8. assertion 3: the shared copy and the bindings describe the same keys ─

const STOPWORDS = new Set(['the', 'a', 'an', 'to', 'in', 'of', 'this', 'and', 'or', 'with', 'is', 'it', 'keys', 'key']);
function significant(text) {
  return new Set(
    (text ?? '')
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length > 2 && !STOPWORDS.has(w))
  );
}

for (const doc of documented) {
  const bound = webByKeystroke.get(doc.keystroke) ?? [];
  if (bound.length === 0) {
    if (INTRINSIC_DOCUMENTED.has(doc.keystroke)) continue;
    failures.push(
      `✗ content/data/shortcuts.json documents "${doc.cell}" ("${doc.description}") but no web binding answers ${doc.keystroke}`
    );
    continue;
  }
  // Prose varies on purpose — the copy explains, the binding labels. Only a
  // description with nothing in common with the copy is worth a look.
  const copyWords = significant(doc.description);
  const described = bound.filter((b) => b.description);
  if (described.length > 0 && !described.some((b) => [...significant(b.description)].some((w) => copyWords.has(w)))) {
    warnings.push(
      `! ${doc.keystroke}: shortcuts.json says "${doc.description}" but ${described.map((b) => `${b.id} says "${b.description}"`).join(', ')}`
    );
  }
}

const documentedKeystrokes = new Set(documented.map((d) => d.keystroke));
for (const b of web) {
  if (!b.description) continue;
  if (documentedKeystrokes.has(b.keystroke)) continue;
  warnings.push(
    `! web binding ${b.id} (${b.keystroke}) carries the description "${b.description}" but ${b.keystroke} is absent from content/data/shortcuts.json`
  );
}

// The `:set keys off` row names, in prose, exactly which keys the switch
// silences and which keep working. That sentence is the user's model of the
// gate, so it has to match the `chars` flags rather than merely coexist with
// them: a key the copy calls gated that is now exempt is a lie the user acts on.
const setKeysRow = shortcuts.find((row) => row.keys === ':set keys off');
if (!setKeysRow) {
  failures.push('✗ content/data/shortcuts.json has no ":set keys off" row — the gate is undocumented');
} else {
  const claimList = (re, what) => {
    const match = setKeysRow.description.match(re);
    if (!match) {
      failures.push(`✗ the ":set keys off" copy no longer names ${what}; the gate check cannot read it`);
      return [];
    }
    // "l y [ ] j k g G and the a/b/p/c tab letters" → single-character tokens,
    // slash-lists expanded, prose words dropped.
    return match[1]
      .split(/\s+/)
      .flatMap((token) => (token.includes('/') ? token.split('/') : [token]))
      .filter((token) => token.length === 1);
  };

  // The copy names a key, not a keystroke: `g` is the gg sequence's key, and
  // the switch only ever reaches bindings outside an overlay, since an overlay
  // that owns focus is the WCAG exemption itself.
  const switchable = (key) =>
    web.filter((b) => !b.scope.startsWith('overlay:') && b.keys.some((k) => canonKey(k, b.mods) === key));

  for (const key of claimList(/shortcuts above \(([^)]*)\)/, 'the keys it silences')) {
    const bound = switchable(canonKey(key));
    const gated = bound.filter((b) => b.chars);
    if (bound.length === 0) {
      failures.push(`✗ the ":set keys off" copy says it silences "${key}", but no web binding answers that key`);
    } else if (gated.length === 0) {
      failures.push(
        `✗ the ":set keys off" copy says it silences "${key}", but every binding on that key is chars: false — ` +
          `the copy claims a key is gated that is now exempt (${bound.map((b) => b.id).join(', ')})`
      );
    }
  }

  for (const key of claimList(/keys \(([^)]*)\) keep working/, 'the keys that keep working')) {
    const bound = switchable(canonKey(key));
    if (bound.length === 0) {
      failures.push(`✗ the ":set keys off" copy says "${key}" keeps working, but no web binding answers that key`);
      continue;
    }
    const gated = bound.filter((b) => b.chars);
    if (gated.length > 0) {
      failures.push(
        `✗ the ":set keys off" copy says "${key}" keeps working, but ${gated.map((b) => b.id).join(', ')} is chars: true — ` +
          'the switch would silence the key that turns the switch back on'
      );
    }
  }
}

// ─── 9. assertion 4: cross-runtime parity ───────────────────────────────────
//
// The keys both runtimes are expected to implement. Someone who learns the
// site in a browser and then SSHes into it must not find these missing.
const SHARED_KEYS = [':', '/', '?', 'l', 'j', 'k', 'g', 'G', 'q', 'esc', '[', ']', 'y', ...navTabs.map((t) => t.name.charAt(0).toLowerCase())];

for (const key of SHARED_KEYS) {
  const onWeb = webKeys.has(key);
  const onTui = tuiKeys.has(key);
  if (!onWeb || !onTui) {
    failures.push(`✗ "${key}" is expected in both runtimes but exists only in the ${onWeb ? 'web' : 'TUI'}`);
  }
}

// Divergence that is intentional. Every entry is a key one runtime has and the
// other structurally cannot; anything not listed here is drift and fails, so a
// new one-sided key has to be added deliberately.
const INTENTIONAL_WEB_ONLY = new Map([
  ['+', 'the Mermaid diagram viewer zooms; the TUI renders diagrams as text'],
  ['=', 'the unshifted twin of +, for the same viewer'],
  ['-', 'diagram zoom out'],
  ['0', 'diagram zoom reset'],
  ['space', 'activates a focused link and pages the man page; the TUI has no roving link focus'],
  ['home', "the browser's scroll keys, taken over so they scroll the article pane"],
  ['end', "the browser's scroll keys, taken over so they scroll the article pane"],
  ['pgup', "the man page's paging; the TUI help screen scrolls by line"],
  ['pgdn', "the man page's paging; the TUI help screen scrolls by line"],
  ['alt+w', 'toggles windowed / full-page chrome the TUI does not have'],
  ['alt+f', 'browser fullscreen'],
  ['alt+n', 'next wallpaper'],
  ['alt+h', 'tmux pane focus; the TUI has one pane'],
  ['alt+j', 'tmux pane focus; the TUI has one pane'],
  ['alt+k', 'tmux pane focus; the TUI has one pane'],
  ['alt+l', 'tmux pane focus; the TUI has one pane'],
  ...Array.from({ length: 9 }, (_, i) => [`alt+${i + 1}`, 'positional tab switching; over SSH Alt+digit belongs to the terminal']),
]);

const INTENTIONAL_TUI_ONLY = new Map([
  ['ctrl+c', 'disconnect. The browser tab is not ours to close'],
  ['tab', "palette autocomplete. On the web Tab is the focus trap's, intrinsic and never registered"],
  ['left', 'list/reader navigation; the web uses browser history and the back button'],
  ['right', 'list/reader navigation; the web uses browser history and the back button'],
  ['backspace', 'go back one level; the web has a back button'],
  ['ctrl+p', 'readline-style palette movement, the convention in a terminal'],
  ['ctrl+n', 'readline-style palette movement, the convention in a terminal'],
  ['ctrl+j', 'readline-style palette movement, the convention in a terminal'],
  ['ctrl+k', 'readline-style palette movement, the convention in a terminal'],
  ['n', 'declines the quit confirmation; the web never asks before a tab closes'],
]);

for (const key of [...webKeys].sort()) {
  if (tuiKeys.has(key) || INTENTIONAL_WEB_ONLY.has(key)) continue;
  const owners = web.filter((b) => b.keys.some((k) => canonKey(k, b.mods) === key)).map((b) => b.id);
  failures.push(
    `✗ "${key}" (${[...new Set(owners)].join(', ')}) exists only in the web runtime.\n` +
      '    Add it to tui/keymap.go, or list it in INTENTIONAL_WEB_ONLY with the reason it cannot exist there.'
  );
}
for (const key of [...tuiKeys].sort()) {
  if (webKeys.has(key) || INTENTIONAL_TUI_ONLY.has(key)) continue;
  const owners = tui.filter((b) => b.keys.some((k) => canonKey(k) === key || k === key)).map((b) => b.id);
  failures.push(
    `✗ "${key}" (${[...new Set(owners)].join(', ')}) exists only in the TUI runtime.\n` +
      '    Add it to the web keymap, or list it in INTENTIONAL_TUI_ONLY with the reason it cannot exist there.'
  );
}

// ─── report ─────────────────────────────────────────────────────────────────

if (warnings.length > 0) {
  console.warn(warnings.join('\n'));
}
if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(
  `✓ ${web.length} web bindings, ${tui.length} TUI bindings and ${documented.length} documented keystrokes agree` +
    (warnings.length > 0 ? ` (${warnings.length} warning${warnings.length === 1 ? '' : 's'})` : '')
);
process.exit(0);
