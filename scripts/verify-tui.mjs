// The SSH TUI keyboard gate. Builds ./tui, drives it over a pseudo-terminal and
// asserts the rendered frame.
//
//   node scripts/verify-tui.mjs
//
// Why this exists: `q`/`esc` resolution in the TUI is spread across Update,
// updateHome, updateList, updateReader, updatePalette and updateLinks, with the
// back target held in two scalar fields (Model.prev, Model.returnTo) that can
// each remember one screen and no context. Two of the cases below exist purely
// to pin the bugs that fall out of that, so the location-stack rewrite can be
// verified instead of hoped at. There are no Go tests in this repo — this file
// is the safety net for that rewrite.
//
// How it drives the program: bubbletea needs a real terminal (it sets raw mode,
// and it blocks on an OSC 11 background-colour query before its first frame), so
// `child_process.spawn` on the binary with piped stdio is not enough. There is
// no node-pty dependency and this harness does not get to add one, so it shells
// out to `script -qec`, which allocates a pty, and answers the startup queries
// itself — see BOOT_REPLY.
//
// How it reads the screen: only stable substrings, after stripping ANSI. Exact
// frame bytes would pin lipgloss padding, the clock, the animated home tagline
// and the terminal width, none of which are behaviour. Every assertion is made
// against a forced full repaint (see snapshot()), because bubbletea only
// rewrites the lines that changed and a "nothing happened" frame is empty.

import { spawn, execFileSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const BINARY = '/tmp/sz-tui-verify';

// ─────────────────────────────────────────────────────────────────────────────
// BASELINE — the ONLY place a known-buggy expectation is written down.
//
// Both rows are now false: the keymap + history rewire fixed them. The failure
// modes are kept because they are what the two cases below exist to catch if
// they ever come back, and because a bare `false` explains nothing.
//
// FIXED by the location stack (tui/navigation.go): `followedLinkQIsDeadKey`.
//   followLink used to call openReader(a, m.screen) with m.screen already
//   screenReader, so Model.prev pointed at the reader the reader was in: `q` on
//   an article reached through an in-article link "returned" to itself and the
//   key did nothing at all. It now pops to the previous article.
//
// FIXED by the same change: `helpIsATrap`. Pressing `?` while help was already
//   open set returnTo = screenHelp, so from then on `q`, `esc` and `h` all
//   "left" help by re-entering it — the only way out was ctrl+c. `q`/esc now
//   resolve as close overlay → pop history → root, and both fall out.
//
// NOTE: `q` at the root is no longer a quit, and that is not a flag. It raises
//   the disconnect prompt; `ctrl+c` is the unprompted way out and is asserted
//   separately from every screen. Nothing about either is expected to change,
//   so both are asserted directly.
// ─────────────────────────────────────────────────────────────────────────────
const BASELINE = {
  followedLinkQIsDeadKey: false,
  helpIsATrap: false,
};

/** Nav keys and the screen each one opens, from content/data/nav.json. */
const NAV = [
  { key: 'a', marker: 'About · Stéphan Zych', what: 'the about page' },
  { key: 'p', marker: '~ / projects', what: 'the projects list' },
  { key: 'b', marker: '~ / blog', what: 'the blog list' },
  { key: 'c', marker: 'Contact · Stéphan Zych', what: 'the contact page' },
];

/** Markers that identify a screen in a stripped frame. */
const HOME = 'open command palette';   // homeHint(), only rendered by viewHome
const HELP = 'Keys';                   // renderHelp()'s first group heading
const PICKER = 'links in this page';    // viewLinks()'s title
const READER_STATUS = 'esc back';      // viewReader()'s statusline
const PALETTE = 'command palette';     // renderPaletteBox()'s title row
const CONFIRM = 'disconnect?';         // viewConfirmQuit()'s title
/** The prompt's own hint row — the only place the answer keys are stated. */
const CONFIRM_HINT = 'y / ⏎ disconnect · n / esc / q stay';

/** Rows the help screen must carry now that it is generated from the keymap. */
const HELP_BACK_ROW = 'esc / h / q';
const HELP_QUIT_ROW = 'ctrl+c';

const ESC = '\x1b';
const ENTER = '\r';
const DOWN = '\x1b[B';
const CTRL_C = '\x03';
/** An unclaimed key, so the reader's own viewport still gets it. */
const PAGE_DOWN = '\x1b[6~';

/**
 * bubbletea (via termenv) writes an OSC 11 background-colour query plus a cursor
 * position request and *blocks on the answer* before rendering anything. A real
 * terminal replies; a pty with nothing on the other end does not, so the program
 * hangs at a blank screen forever. This is that reply.
 */
const BOOT_REPLY = '\x1b]11;rgb:1e1e/1e1e/2e2e\x1b\\\x1b[1;1R';

const CSI_OSC = /\u001b\][^\u0007\u001b]*(\u0007|\u001b\\)/g;
const CSI_ESC = /\u001b[@-Z\\-_]|\u001b\[[0-?]*[ -/]*[@-~]/g;

const sleep = ms => new Promise(r => setTimeout(r, ms));

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

function has(frame, marker, what) {
  assert(frame.includes(marker), `${what}: expected the frame to contain ${JSON.stringify(marker)}, got ${JSON.stringify(digest(frame))}`);
}

function lacks(frame, marker, what) {
  assert(!frame.includes(marker), `${what}: expected the frame NOT to contain ${JSON.stringify(marker)}, but it is still on screen`);
}

/** A frame short enough to print in a failure line and specific enough to read. */
function digest(frame) {
  const lines = frame.split('\n').filter(l => l.trim());
  return [lines[0] ?? '', lines[1] ?? '', lines[lines.length - 1] ?? ''].join(' ⏎ ').slice(0, 220);
}

class Session {
  constructor() {
    // `stty` inside the pty rather than COLUMNS/LINES: bubbletea asks the
    // kernel for the window size with an ioctl and never reads the environment,
    // and `script`'s own pty inherits nothing useful when its stdout is a pipe.
    this.proc = spawn('script', ['-qec', `stty rows 40 cols 120; CONTENT_DIR=content ${BINARY} -local`, '/dev/null'], {
      cwd: repo,
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, TERM: 'xterm-256color' },
    });
    this.buf = '';
    this.exited = false;
    this.proc.stdout.on('data', d => { this.buf += d; });
    this.proc.stderr.on('data', d => { this.buf += d; });
    this.proc.on('exit', () => { this.exited = true; });
  }

  async boot() {
    await sleep(400);
    this.proc.stdin.write(BOOT_REPLY);
    // Content load, theme build and the first frame.
    await sleep(2000);
    assert(!this.exited, 'the TUI exited during startup');
    const frame = await this.snapshot();
    has(frame, HOME, 'startup');
    return frame;
  }

  async press(keys, settle = 600) {
    assert(!this.exited, `the TUI exited before ${JSON.stringify(keys)} could be pressed`);
    this.proc.stdin.write(keys);
    await sleep(settle);
  }

  /**
   * Every descendant of `script`: the signal has to reach the Go process, and
   * `script -c` with more than one command leaves a shell in between. Matching
   * on the binary name instead would pick up a second harness run.
   */
  descendants(pid = this.proc.pid, acc = []) {
    let children = '';
    try {
      children = execFileSync('pgrep', ['-P', String(pid)], { encoding: 'utf8' }).trim();
    } catch { return acc; }
    for (const child of children.split('\n').filter(Boolean)) {
      acc.push(child);
      this.descendants(Number(child), acc);
    }
    return acc;
  }

  /**
   * Forces a full repaint and returns it. bubbletea's renderer only rewrites the
   * lines that differ from the last frame, so reading "the output since the last
   * keystroke" gives a partial frame — and for a key that does nothing, an empty
   * one, which no assertion can tell apart from a key that cleared the screen.
   * A SIGWINCH makes the renderer drop its cached frame and paint everything.
   */
  async snapshot(settle = 700) {
    this.buf = '';
    for (const pid of this.descendants()) {
      try { execFileSync('kill', ['-WINCH', pid]); } catch { /* already gone */ }
    }
    await sleep(settle);
    return this.buf
      .replace(CSI_OSC, '')
      .replace(CSI_ESC, '')
      .replace(/\r/g, '\n')
      .split('\n')
      .map(l => l.trimEnd())
      .filter(l => l.trim())
      .join('\n');
  }

  /** True once the program has quit — the observable result of `q` at the root. */
  async waitForExit(ms) {
    const deadline = Date.now() + ms;
    while (!this.exited && Date.now() < deadline) await sleep(100);
    return this.exited;
  }

  kill() { this.proc.kill('SIGKILL'); }
}

/** Collects named results without letting one failure abort the rest. */
function createRun() {
  const checks = [];
  return {
    checks,
    async step(name, fn) {
      const session = new Session();
      try {
        await session.boot();
        const detail = await fn(session);
        checks.push({ name, ok: true, detail: detail ?? '' });
      } catch (e) {
        checks.push({ name, ok: false, detail: e?.message ?? String(e) });
      } finally {
        session.kill();
      }
      return checks[checks.length - 1];
    },
  };
}

// ─────────────────────────────────────────────────────────────────────────────

/** Opens the blog list and the top article, leaving the reader on screen. */
async function openTopArticle(s) {
  await s.press('b', 700);
  has(await s.snapshot(), '~ / blog', 'entering the blog list');
  await s.press(ENTER, 900);
  const frame = await s.snapshot();
  has(frame, READER_STATUS, 'opening the top article');
  return frame;
}

/**
 * The article the reader currently holds, read off the breadcrumb. Taking the
 * whole statusline instead would fold in the clock, so a case that compares two
 * snapshots a minute apart would flake.
 */
function readerTitle(frame) {
  const line = frame.split('\n').find(l => l.trimStart().startsWith('~ /')) ?? '';
  const crumb = line.split(' / ').pop() ?? '';
  return crumb.split(/\s{2,}/)[0].trim();
}

async function navigationChecks(run) {
  for (const { key, marker, what } of NAV) {
    await run.step(`\`${key}\` from home opens ${what}`, async (s) => {
      await s.press(key, 800);
      const frame = await s.snapshot();
      has(frame, marker, `\`${key}\` from home`);
      lacks(frame, HOME, `\`${key}\` from home left the home screen up`);
      return `home → ${marker}`;
    });
  }

  await run.step('`?` opens help and `esc` leaves it', async (s) => {
    await s.press('?', 700);
    has(await s.snapshot(), HELP, '`?` from home');
    await s.press(ESC, 700);
    has(await s.snapshot(), HOME, '`esc` from help');
    return 'home → help → home';
  });

  await run.step('`?` opens help and `q` leaves it', async (s) => {
    await s.press('?', 700);
    has(await s.snapshot(), HELP, '`?` from home');
    await s.press('q', 700);
    const frame = await s.snapshot();
    assert(!s.exited, '`q` in help quit the program instead of closing help');
    has(frame, HOME, '`q` from help');
    return 'home → help → home';
  });

  for (const [key, label] of [[ESC, 'esc'], ['q', 'q'], ['h', 'h']]) {
    await run.step(`\`${label}\` on a list returns home`, async (s) => {
      await s.press('b', 800);
      has(await s.snapshot(), '~ / blog', 'entering the blog list');
      await s.press(key, 800);
      const frame = await s.snapshot();
      assert(!s.exited, `\`${label}\` on a list quit the program instead of going back`);
      has(frame, HOME, `\`${label}\` on the blog list`);
      return 'blog list → home';
    });
  }
}

async function pickerChecks(run) {
  await run.step('`l` opens the in-article link picker and `esc` closes it', async (s) => {
    await openTopArticle(s);
    await s.press('l', 700);
    has(await s.snapshot(), PICKER, '`l` in the reader');
    await s.press(ESC, 700);
    const frame = await s.snapshot();
    lacks(frame, PICKER, '`esc` in the link picker');
    has(frame, READER_STATUS, '`esc` in the link picker dropped out of the reader as well');
    return 'reader → picker → reader';
  });
}

async function historyChecks(run) {
  await run.step('`q` after following an in-article link', async (s) => {
    const opened = await openTopArticle(s);
    const from = readerTitle(opened);

    await s.press('l', 700);
    // Walk to an internal row: an external row copies its URL to the client
    // clipboard instead of navigating, which is a different observable.
    const picker = await s.snapshot();
    const rows = picker.split('\n').filter(l => l.includes('│'));
    const target = rows.findIndex(l => l.includes('→ article') || l.includes('→ page') || l.includes('→ list'));
    assert(target >= 0, `the top blog article has no internal link to follow (picker rows: ${rows.length})`);
    for (let i = 0; i < target; i++) await s.press(DOWN, 200);
    await s.press(ENTER, 900);

    const followed = await s.snapshot();
    const to = readerTitle(followed);
    has(followed, READER_STATUS, 'following an internal link');
    assert(to && to !== from, `following an internal link did not change the article (still ${JSON.stringify(from)})`);

    await s.press('q', 800);
    const after = await s.snapshot();
    const landed = readerTitle(after);
    assert(!s.exited, '`q` after following a link quit the program');
    if (BASELINE.followedLinkQIsDeadKey) {
      assert(landed === to, `\`q\` went back after following a link — expected today's dead key on ${JSON.stringify(to)}, got ${JSON.stringify(digest(after))}`);
      return `\`q\` did nothing, still on ${JSON.stringify(to)} (recorded baseline: dead key)`;
    }
    // The location stack pops to where the link was followed *from*, which is
    // the first article — not the list two steps back.
    assert(landed === from, `\`q\` did not pop back to ${JSON.stringify(from)}: got ${JSON.stringify(digest(after))}`);
    has(after, READER_STATUS, '`q` popped out of the reader entirely');
    return `\`q\` returned to ${JSON.stringify(from)}`;
  });

  await run.step('`?` pressed twice, then `esc`', async (s) => {
    await s.press('?', 700);
    has(await s.snapshot(), HELP, 'first `?`');
    await s.press('?', 700);
    has(await s.snapshot(), HELP, 'second `?` left the help screen');
    await s.press(ESC, 800);
    const frame = await s.snapshot();
    assert(!s.exited, '`esc` in help quit the program');
    if (BASELINE.helpIsATrap) {
      has(frame, HELP, '`esc` escaped help after two `?` — expected today\'s trap');
      lacks(frame, HOME, '`esc` escaped help after two `?` — expected today\'s trap');
      return '`esc` re-entered help (recorded baseline: `?` `?` is a trap)';
    }
    has(frame, HOME, '`esc` after two `?`');
    return 'help → home';
  });

  await run.step('`q` at the root raises the disconnect prompt', async (s) => {
    await s.press('q', 700);
    const frame = await s.snapshot();
    assert(!s.exited, '`q` at home quit outright — the root back is a prompt now, not a disconnect');
    has(frame, CONFIRM, '`q` at home');
    // The hint row is the only place the answer keys are stated, so a prompt
    // without it is a prompt nobody can answer.
    has(frame, CONFIRM_HINT, '`q` at home');
    lacks(frame, HOME, 'the prompt did not cover the home screen');
    return 'home → disconnect prompt';
  });

  for (const [key, label] of [['y', 'y'], [ENTER, 'enter']]) {
    await run.step(`\`${label}\` at the disconnect prompt quits`, async (s) => {
      await s.press('q', 700);
      has(await s.snapshot(), CONFIRM, 'raising the prompt');
      await s.press(key, 300);
      assert(await s.waitForExit(4000), `\`${label}\` did not disconnect from the prompt`);
      return 'prompt → disconnected';
    });
  }

  for (const [key, label] of [['n', 'n'], [ESC, 'esc'], ['q', 'q']]) {
    await run.step(`\`${label}\` at the disconnect prompt cancels back to home`, async (s) => {
      await s.press('q', 700);
      has(await s.snapshot(), CONFIRM, 'raising the prompt');
      await s.press(key, 800);
      const frame = await s.snapshot();
      // `q` cancels as well as asks: it is the key the hand is already on, and
      // the press a user repeats when a screen seems not to have reacted.
      // Reading the repeat as "yes" would disconnect them for pressing back
      // twice.
      assert(!s.exited, `\`${label}\` disconnected instead of cancelling`);
      lacks(frame, CONFIRM, `\`${label}\` at the prompt`);
      has(frame, HOME, `\`${label}\` at the prompt`);
      return 'prompt → home, still connected';
    });
  }

  await run.step('an unrelated key at the disconnect prompt neither quits nor dismisses', async (s) => {
    await s.press('q', 700);
    has(await s.snapshot(), CONFIRM, 'raising the prompt');
    await s.press('x', 800);
    const frame = await s.snapshot();
    // The prompt is the whole of what reads the answer: every other key
    // resolves to nothing while it is up. A stray keystroke must not be read as
    // either answer.
    assert(!s.exited, 'a stray `x` disconnected from the prompt');
    has(frame, CONFIRM, '`x` at the prompt');
    return 'prompt still up, still connected';
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// The openers, the unprompted exit, and the keys the table leaves alone
// ─────────────────────────────────────────────────────────────────────────────

async function keymapChecks(run) {
  await run.step('`:` over an open link picker displaces it', async (s) => {
    await openTopArticle(s);
    await s.press('l', 700);
    has(await s.snapshot(), PICKER, '`l` in the reader');
    await s.press(':', 800);
    const frame = await s.snapshot();
    // The picker used to swallow every key it did not handle, `:` `/` and `?`
    // included, so the palette was unreachable from it. The three prefixes are
    // scopeAlways openers now, and an opener displaces whatever is up.
    lacks(frame, PICKER, '`:` over the link picker');
    has(frame, PALETTE, '`:` over the link picker');
    has(frame, '│ :', '`:` opened the palette at the wrong prefix');
    return 'picker closed, palette open at :';
  });

  // ctrl+c is the one unprompted way out, from anywhere — including from the
  // prompt that exists to ask. Each context is its own case: the palette and
  // the picker are exactly where it used to be swallowed.
  const CONTEXTS = [
    ['home', async () => {}],
    ['the disconnect prompt', async (s) => { await s.press('q', 700); has(await s.snapshot(), CONFIRM, 'raising the prompt'); }],
    ['a list', async (s) => { await s.press('b', 800); has(await s.snapshot(), '~ / blog', 'entering the blog list'); }],
    ['the reader', async (s) => { await openTopArticle(s); }],
    ['the palette', async (s) => { await s.press(':', 700); has(await s.snapshot(), PALETTE, 'opening the palette'); }],
    ['the link picker', async (s) => { await openTopArticle(s); await s.press('l', 700); has(await s.snapshot(), PICKER, 'opening the picker'); }],
  ];
  for (const [where, setup] of CONTEXTS) {
    await run.step(`\`ctrl+c\` disconnects from ${where}`, async (s) => {
      await setup(s);
      await s.press(CTRL_C, 300);
      assert(await s.waitForExit(4000), `ctrl+c did not disconnect from ${where}`);
      return 'disconnected immediately, unprompted';
    });
  }

  await run.step('a key the table does not claim still scrolls the reader', async (s) => {
    const before = await openTopArticle(s);
    const firstLine = before.split('\n').find(l => l.includes('#')) ?? '';
    await s.press(PAGE_DOWN, 800);
    const after = await s.snapshot();
    // PageDown is intrinsic viewport mechanics, deliberately unregistered: the
    // keymap dropping unclaimed keys instead of handing them on would break
    // reading a long article.
    assert(after !== before, 'PageDown in the reader changed nothing — the unclaimed key was dropped');
    has(after, READER_STATUS, 'PageDown left the reader');
    assert(!after.includes(firstLine) || firstLine === '', `PageDown did not move the article body (still showing ${JSON.stringify(firstLine.trim().slice(0, 40))})`);
    return 'article body moved, still in the reader';
  });

  await run.step('a key the table does not claim still types into the palette', async (s) => {
    await s.press(':', 700);
    has(await s.snapshot(), PALETTE, 'opening the palette');
    await s.press('blo', 800);
    const frame = await s.snapshot();
    // The prefixes are scopeAlways openers, but inside the palette they are
    // ordinary characters its input has to receive — which is what
    // keyboardFree() in the table exists to express.
    has(frame, '│ :blo', 'typing into the palette');
    return 'input reads `:blo`';
  });

  await run.step('the help screen is generated from the keymap', async (s) => {
    await s.press('?', 800);
    const frame = await s.snapshot();
    has(frame, HELP, '`?` from home');
    // Asserted as rows, not wording: the hand-written keySpecs table is deleted,
    // and it used to claim "esc / h / q → back" while `q` at home disconnected
    // without asking. A generated row can only describe the binding it names.
    has(frame, HELP_BACK_ROW, 'the help screen');
    has(frame, HELP_QUIT_ROW, 'the help screen');
    return `Keys section carries the ${HELP_BACK_ROW} and ${HELP_QUIT_ROW} rows`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────

function report(checks) {
  for (const c of checks) {
    console.log(`${c.ok ? 'ok  ' : 'FAIL'} ${c.name}`);
    if (c.detail) console.log(`       ${c.detail}`);
  }
  return checks.filter(c => !c.ok).length;
}

async function main() {
  // The module lives in tui/, so the build runs there — `go build ./tui` from
  // the repo root finds no main module.
  execFileSync('go', ['build', '-o', BINARY, '.'], { cwd: path.join(repo, 'tui'), stdio: 'inherit' });

  const run = createRun();
  await navigationChecks(run);
  await pickerChecks(run);
  await historyChecks(run);
  await keymapChecks(run);

  const failed = report(run.checks);
  console.log(`\n${run.checks.length - failed}/${run.checks.length} TUI cases passed`);
  if (failed > 0) {
    console.log('Expectations live in the BASELINE table at the top of this file; a failure is either a regression or a wave that forgot to flip one.');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
