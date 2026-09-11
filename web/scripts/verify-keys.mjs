// The keyboard gate. Drives the built _site/ and asserts the observable result
// of every site-wide keyboard behaviour, in both `keyShortcuts` states.
//
//   cd web && npm run build && node scripts/verify-keys.mjs
//
// Why this exists: thirteen separate document/window keydown listeners decide
// what a keystroke means today, four of them by asking the DOM whether some
// other component is open (`document.querySelector('sz-links[open]')`). The
// overlay + keymap registries replace all of that, and there are no tests in
// this repo — so this file is the entire safety net for that migration. It
// records what the tree does *now*, key by key, so a regression shows up as a
// named failing case instead of as a bug report months later.
//
// It asserts results, never mechanism: a scroll offset that moved, a URL that
// changed, a clipboard that holds the share link, an `aria-modal` that is
// visible. Nothing here knows which listener did the work, which is the point —
// the migration moves the work and must not move the behaviour.
//
// Primitives (serve, themed contexts, STATE_KEY seeding, the named-step runner)
// come from audit.mjs and a11y-journey.mjs rather than being duplicated here.

import { chromium } from 'playwright';
import { serve, siteDir, requireSite, STATE_KEY, blockAnalytics } from '../audit.mjs';
import { createRun } from '../a11y-journey.mjs';

// ─────────────────────────────────────────────────────────────────────────────
// BASELINE — the ONLY place an expectation about a known bug or a deliberate
// Wave 2 behaviour change is written down.
//
// Every value below is what the tree does today, recorded deliberately.
// Flipping one here is the whole edit a wave needs: no assertion elsewhere in
// this file encodes a decision of its own.
//
// FIXED in wave 2: `paletteGatedByCharsSwitch` is now false. `:`, `/` and `?`
//   are the WCAG 2.1.4 switch's own control surface, and the keymap declares
//   all three `chars: false`. Before the keymap, sz-palette.ts:316 gated them
//   behind `singleKeyAllowed()`, so a keyboard-only user who ran
//   `:set keys off` could never type `:set keys on` again.
//
// FIXED in wave 2: `escapeLeaksPastThePaletteInput` is now false. Escape used
//   to be handled by the palette input's own @keydown, which called hide()
//   without preventDefault, so the event reached focus-nav and backed out to
//   the article's archive as well — one Escape, two effects. `nav.back.escape`
//   is now a `page` binding, suppressed while a modal owns the keyboard.
//
// CHANGE in wave 2, nothing flips later: the three prefixes are `global`-scope
//   openers, so `:` or `/` pressed while the `?` man page is up displaces it
//   and opens the palette. Previously nothing happened — the palette's old
//   listener returned early in its `helpOpen` branch. Displacing whatever
//   surface is up is the whole point of that tier, so this is asserted
//   directly rather than through a flag.
//
// CHANGE in wave 2, nothing flips later: a re-pressed prefix refocuses the
//   palette's input instead of toggling the palette shut — `palette.refocus`
//   wins on scope specificity.
//
// NOTE: do not "fix" the aria-modal count back to 1 while the palette owns the
//   keyboard. `sz-palette` declares no `aria-modal` today; only `sz-links`,
//   `sz-diagram` and `sz-window` do. So after `l` then `/` the count is 0 —
//   the picker is gone and the palette that replaced it is not announced as a
//   dialog. Palette dialog semantics are a wave 3 item. What this file asserts
//   instead is the invariant that holds either way: AT MOST ONE visible
//   aria-modal in the document, checked on every overlay case (see
//   assertAtMostOneModal), plus overlay exclusivity on state.
// ─────────────────────────────────────────────────────────────────────────────
const BASELINE = {
  paletteGatedByCharsSwitch: false,
  escapeLeaksPastThePaletteInput: false,
};

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

/** Long, has six external prose links and a pager on both sides. */
const ARTICLE = '/blog/terminal-over-ssh/';
/** The one article whose prose links include internal ones, so Enter can be followed. */
const LINKED_ARTICLE = '/blog/terminal-agent-workbench/';
/** The route whose ```mermaid block renders an <svg>, so the lightbox has something to show. */
const DIAGRAM_ARTICLE = '/blog/orval-typed-api-clients/';

/** Routes the prefix keys are asserted on — every page shape the site has. */
const PREFIX_ROUTES = ['/', '/about/', '/blog/', ARTICLE, '/cv/'];

/** Nav tabs in Alt+1..Alt+9 order, straight from the tmux bar. */
const NAV_TABS = ['/', '/about/', '/projects/', '/blog/', '/contact/'];

/**
 * Every bare-letter/bracket binding in the page tier. With the switch off each
 * must be inert *and* unconsumed — 2.1.4 asks for the key left entirely alone,
 * so browser type-ahead-find and AT pass-through keep working.
 */
const BARE_BINDINGS = ['l', 'j', 'k', 'g', 'G', 'y', '[', ']', 'q', 'a', 'p', 'b', 'c'];

// Console errors are collected per route as sessions close, then reported as
// one case per route at the end — a stray error on /cv/ must not be attributed
// to whichever case happened to be holding that page open.
const consoleErrors = new Map();

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

/** Failure text the report can show verbatim as expected-vs-actual. */
function eq(actual, expected, what) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  assert(a === e, `${what}: expected ${e}, got ${a}`);
}

/**
 * The one overlay invariant that holds whatever surfaces carry the role, and
 * the one this file refuses to let regress: a document never paints two
 * `aria-modal="true"` elements at once. Two of them means assistive tech has
 * been told the rest of the page is hidden behind each of two dialogs, and the
 * user is inside neither.
 *
 * Asserted on every overlay case rather than only the exclusivity one. It is
 * deliberately an upper bound, not an equality: `sz-palette` declares no
 * aria-modal today, so a palette that owns the keyboard paints zero — see the
 * NOTE in the BASELINE block before "fixing" that to 1.
 */
function assertAtMostOneModal(state, what) {
  assert(state.visibleAriaModals <= 1,
    `${what}: ${state.visibleAriaModals} visible aria-modal elements at once (${state.ariaModalLabels.join(' | ')}) — at most one surface may claim the document`);
}

/**
 * Fresh context per case. `settings` is merged into the persisted core/state.ts
 * blob before any script runs, which is how `keyShortcuts` is exercised through
 * its real restore path (a11y-journey.mjs seeds the theme the same way).
 *
 * Clipboard permissions are granted because the only observable result of `y`
 * is what ends up on the clipboard; without them copyText's catch branch fires
 * and the case would pass on the error toast.
 */
async function open(base, browser, route, { keyShortcuts = true, viewport = DESKTOP } = {}) {
  const context = await browser.newContext({ viewport });
  await context.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: base });
  await context.addInitScript(
    ([key, value]) => {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    },
    [STATE_KEY, { keyShortcuts }],
  );
  // These cases load real pages, and this runs in CI on every push. The
  // tracker's data-domains guard already stops a 127.0.0.1 run reporting; this
  // is the second lock. See blockAnalytics in ../audit.mjs.
  await blockAnalytics(context);
  const page = await context.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', e => errors.push(String(e)));
  await page.goto(base + route, { waitUntil: 'networkidle' });
  // The window components hydrate, promote the scroller and lay themselves out
  // over a couple of frames; pressing a key before that measures a different
  // scroll model and a half-registered listener set.
  await page.waitForTimeout(1200);
  return {
    page,
    close: async () => {
      const seen = consoleErrors.get(route) ?? [];
      consoleErrors.set(route, seen.concat(errors));
      await context.close();
    },
  };
}

/**
 * Overlay state as a user and a screen reader see it: the reflected host
 * attributes, the palette's rendered prefix, whether focus sits in the
 * palette's own input, and which `aria-modal="true"` elements are actually
 * painted. The modal list has to cross shadow roots, because every modal
 * surface on this site renders inside one.
 */
const OVERLAY_PROBE = `(() => {
  const palette = document.querySelector('sz-palette');
  const links = document.querySelector('sz-links');
  const diagram = document.querySelector('sz-diagram');
  const shadowModals = [...document.querySelectorAll('*')]
    .flatMap(el => el.shadowRoot ? [...el.shadowRoot.querySelectorAll('[aria-modal="true"]')] : []);
  const visible = [...shadowModals, ...document.querySelectorAll('[aria-modal="true"]')]
    .filter(el => el.getClientRects().length > 0);
  let focused = document.activeElement;
  while (focused?.shadowRoot?.activeElement) focused = focused.shadowRoot.activeElement;
  const help = palette?.shadowRoot?.querySelector('.help-overlay');
  return {
    paletteOpen: !!palette?.hasAttribute('open'),
    paletteHelpOpen: !!palette?.hasAttribute('help-open'),
    palettePrefix: palette?.shadowRoot?.querySelector('.prefix')?.textContent ?? null,
    helpHeader: palette?.shadowRoot?.querySelector('.help-header')?.textContent?.slice(0, 15) ?? null,
    helpScrollTop: help ? help.scrollTop : null,
    helpScrollExtent: help ? help.scrollHeight - help.clientHeight : null,
    paletteInputFocused: focused?.tagName === 'INPUT' && focused?.getAttribute('role') === 'combobox',
    linksOpen: !!links?.hasAttribute('open'),
    diagramOpen: !!diagram?.shadowRoot?.querySelector('.modal'),
    diagramTransform: diagram?.shadowRoot?.querySelector('.zoomable')?.getAttribute('style') ?? null,
    visibleAriaModals: visible.length,
    ariaModalLabels: visible.map(el => el.getAttribute('aria-label')),
  };
})()`;

/**
 * The active scroller and its offset. core/scroll.ts owns this decision for the
 * app (desktop scrolls #main-content under a position:fixed window, mobile
 * scrolls the document); the probe mirrors its rule rather than assuming one,
 * because asserting the wrong element reads 0 forever and passes nothing.
 */
const SCROLL_PROBE = `(() => {
  const doc = document.scrollingElement;
  const root = doc.scrollHeight > doc.clientHeight ? doc : document.getElementById('main-content');
  return { which: root === doc ? 'document' : 'main-content', top: root.scrollTop, extent: root.scrollHeight - root.clientHeight };
})()`;

/**
 * Two listeners, because one cannot answer both questions. The capture-phase
 * listener proves the keystroke was *delivered* to the page at all. It can
 * never see preventDefault — it runs before the document handlers do — so the
 * swallow test needs the bubble-phase listener on window, which runs last.
 *
 * Idempotent: cases that press a series of keys on one page re-run this to
 * clear the log, and a second pair of listeners would double every entry.
 */
const KEY_PROBE = `(() => {
  if (!window.__keyProbeInstalled) {
    window.__keyProbeInstalled = true;
    window.addEventListener('keydown', e => window.__delivered.push(e.key), true);
    window.addEventListener('keydown', e => window.__settled.push([e.key, e.defaultPrevented]));
  }
  window.__delivered = [];
  window.__settled = [];
})()`;

/**
 * The deepest focused element, by tag and by label. document.activeElement
 * stops at a shadow host, and half this site's controls live in shadow roots —
 * a naive read reports `sz-diagram` for every one of them and passes while
 * focus is somewhere else entirely. Same recursion core/keyboard.ts exports as
 * deepActiveElement().
 */
const DEEP = `(() => {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  return el;
})()`;
const DEEP_TAG = `${DEEP}?.tagName ?? null`;
const DEEP_LABEL = `${DEEP}?.getAttribute('aria-label') ?? null`;

/** Picker rows as rendered: selection index plus each row's destination. */
const PICKER_PROBE = `(() => {
  const root = document.querySelector('sz-links')?.shadowRoot;
  if (!root) return null;
  const items = [...root.querySelectorAll('.item')];
  return {
    count: items.length,
    selected: items.findIndex(i => i.classList.contains('selected')),
    activedescendant: root.querySelector('.list')?.getAttribute('aria-activedescendant') ?? null,
    focusInList: root.activeElement === root.querySelector('.list'),
    dests: items.map(i => i.querySelector('.dest')?.textContent ?? ''),
  };
})()`;

const NOTIFY_PROBE = `(document.querySelector('sz-notifications')?.shadowRoot?.textContent ?? '').replace(/\\s+/g, ' ').trim()`;

const pathOf = page => new URL(page.url()).pathname;

// ─────────────────────────────────────────────────────────────────────────────
// 1. Palette prefixes — `:` command, `/` search, `?` help
// ─────────────────────────────────────────────────────────────────────────────

/** What each prefix is expected to open, when the switch lets it through. */
const PREFIX_SURFACES = [
  [':', { paletteOpen: true, paletteHelpOpen: false, palettePrefix: ':', helpHeader: null }],
  ['/', { paletteOpen: true, paletteHelpOpen: false, palettePrefix: '/', helpHeader: null }],
  ['?', { paletteOpen: false, paletteHelpOpen: true, palettePrefix: null, helpHeader: 'STEPHAN.ZYCH(1)' }],
];

const NO_SURFACE = { paletteOpen: false, paletteHelpOpen: false, palettePrefix: null, helpHeader: null };

/** Where `q`/Escape back out to from this route, or null when there is nowhere. */
function archiveFor(route) {
  const m = route.match(/^\/(blog|projects)\/[^/]+\/$/);
  return m ? `/${m[1]}/` : null;
}

async function prefixChecks(run, base, browser) {
  for (const keyShortcuts of [true, false]) {
    // A fresh page per prefix. Sequencing them would leave focus in the
    // palette's own input, and isInputFocused() then swallows the next prefix —
    // a false failure that says nothing about the binding under test.
    const opens = keyShortcuts || !BASELINE.paletteGatedByCharsSwitch;
    for (const route of PREFIX_ROUTES) {
      for (const [key, surface] of PREFIX_SURFACES) {
        await run.step(`\`${key}\` on ${route} with keyShortcuts=${keyShortcuts}`, async () => {
          const { page, close } = await open(base, browser, route, { keyShortcuts });
          try {
            await page.evaluate(KEY_PROBE);
            await page.keyboard.press(key);
            await page.waitForTimeout(450);
            const state = await page.evaluate(OVERLAY_PROBE);
            const want = opens ? surface : NO_SURFACE;
            for (const [field, value] of Object.entries(want)) {
              eq(state[field], value, `\`${key}\` on ${route} (keyShortcuts=${keyShortcuts}) → ${field}`);
            }
            assertAtMostOneModal(state, `after \`${key}\` on ${route} (keyShortcuts=${keyShortcuts})`);
            if (!opens) {
              // Gated is not the same as consumed: with nothing opened the key
              // still has to reach the browser and assistive tech untouched.
              eq(await page.evaluate('window.__settled'), [[key, false]],
                `\`${key}\` opened nothing but was preventDefault()ed anyway`);
              return 'inert and unconsumed';
            }
            // Escape is the one `always`-scope binding, so it has to close
            // whichever surface just opened. Whether it *also* backs out of the
            // article behind it is the recorded baseline, not a decision made
            // here.
            await page.keyboard.press('Escape');
            await page.waitForTimeout(400);
            const closed = await page.evaluate(OVERLAY_PROBE);
            eq({ palette: closed.paletteOpen, help: closed.paletteHelpOpen }, { palette: false, help: false },
              `Escape did not close what \`${key}\` opened on ${route}`);
            const leaks = key !== '?' && BASELINE.escapeLeaksPastThePaletteInput;
            const archive = archiveFor(route);
            eq(pathOf(page), leaks && archive ? archive : route,
              `where Escape left us after closing what \`${key}\` opened on ${route}`);
            if (leaks && archive) {
              return `opened the palette at prefix ${key}; Escape closed it and backed out to ${archive} (recorded baseline: Escape leaks past the palette input)`;
            }
            return `opened ${key === '?' ? 'the help overlay' : `the palette at prefix ${key}`}, Escape closed it`;
          } finally { await close(); }
        });
      }
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Link picker
// ─────────────────────────────────────────────────────────────────────────────

async function pickerChecks(run, base, browser) {
  await run.step('`l` opens the link picker on an article and it owns the keyboard', async () => {
    const { page, close } = await open(base, browser, ARTICLE);
    try {
      await page.keyboard.press('l');
      await page.waitForTimeout(400);
      const state = await page.evaluate(OVERLAY_PROBE);
      eq(state.linksOpen, true, '`l` did not open the picker');
      eq(state.visibleAriaModals, 1, 'picker is open but not exactly one aria-modal is painted');
      const picker = await page.evaluate(PICKER_PROBE);
      assert(picker.count > 0, 'picker opened with no rows');
      eq(picker.selected, 0, 'picker did not select its first row');
      eq(picker.focusInList, true, 'picker declares aria-modal but focus never entered its listbox');
      return `${picker.count} rows, row 0 selected, focus in the listbox, 1 aria-modal painted`;
    } finally { await close(); }
  });

  await run.step('`j` / `k` move the picker selection', async () => {
    const { page, close } = await open(base, browser, ARTICLE);
    try {
      await page.keyboard.press('l');
      await page.waitForTimeout(400);
      await page.keyboard.press('j');
      await page.waitForTimeout(200);
      const down = await page.evaluate(PICKER_PROBE);
      eq(down.selected, 1, '`j` did not move the picker selection down');
      // aria-activedescendant is how the selection is announced: the options
      // are unfocusable on purpose, so a moved highlight with a stale
      // activedescendant moves nothing for a screen reader.
      eq(down.activedescendant, 'sz-links-opt-1', '`j` moved the highlight without moving aria-activedescendant');
      await page.keyboard.press('k');
      await page.waitForTimeout(200);
      const up = await page.evaluate(PICKER_PROBE);
      eq(up.selected, 0, '`k` did not move the picker selection back up');
      eq(up.activedescendant, 'sz-links-opt-0', '`k` moved the highlight without moving aria-activedescendant');
      return 'j → row 1, k → row 0, aria-activedescendant follows';
    } finally { await close(); }
  });

  await run.step('`Enter` follows the selected link', async () => {
    const { page, close } = await open(base, browser, LINKED_ARTICLE);
    try {
      await page.keyboard.press('l');
      await page.waitForTimeout(400);
      const picker = await page.evaluate(PICKER_PROBE);
      // Walk to the first internal row rather than hardcoding an index: an
      // external row follows into a _blank popup, which is a different
      // observable and would make this case depend on content order.
      const target = picker.dests.findIndex(d => d.startsWith('→'));
      assert(target >= 0, `${LINKED_ARTICLE} has no internal prose link to follow (rows: ${picker.dests.join(' | ')})`);
      for (let i = 0; i < target; i++) {
        await page.keyboard.press('j');
        await page.waitForTimeout(120);
      }
      const dest = picker.dests[target].replace(/^→\s*/, '');
      await page.keyboard.press('Enter');
      await page.waitForTimeout(1500);
      eq(pathOf(page), dest, '`Enter` did not follow the selected row');
      eq((await page.evaluate(OVERLAY_PROBE)).linksOpen, false, '`Enter` followed the link but left the picker open');
      return `row ${target} → ${dest}, picker closed`;
    } finally { await close(); }
  });

  for (const key of ['q', 'l', 'Escape']) {
    await run.step(`\`${key}\` closes the link picker`, async () => {
      const { page, close } = await open(base, browser, ARTICLE);
      try {
        await page.keyboard.press('l');
        await page.waitForTimeout(400);
        eq((await page.evaluate(OVERLAY_PROBE)).linksOpen, true, 'picker never opened');
        await page.keyboard.press(key);
        await page.waitForTimeout(400);
        const state = await page.evaluate(OVERLAY_PROBE);
        eq(state.linksOpen, false, `\`${key}\` did not close the picker`);
        eq(state.visibleAriaModals, 0, `\`${key}\` closed the picker but left an aria-modal painted`);
        // Closing must not also back out to the archive: Escape used to do both,
        // because focus-nav read the reflected [open] attribute after Lit had
        // already dropped it.
        eq(pathOf(page), ARTICLE, `\`${key}\` closed the picker and navigated away as well`);
        return 'picker closed, no aria-modal left, still on the article';
      } finally { await close(); }
    });
  }

  await run.step('`l` does not open the picker on a mobile viewport', async () => {
    const { page, close } = await open(base, browser, ARTICLE, { viewport: MOBILE });
    try {
      await page.evaluate(KEY_PROBE);
      await page.keyboard.press('l');
      await page.waitForTimeout(400);
      eq((await page.evaluate(OVERLAY_PROBE)).linksOpen, false, '`l` opened the picker at 390px — the overlay covers the article it lists');
      const settled = await page.evaluate('window.__settled');
      eq(settled, [['l', false]], '`l` was consumed on mobile even though the picker never opened');
      return 'inert and unconsumed at 390x844';
    } finally { await close(); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Overlay exclusivity and the `global`-scope openers
// ─────────────────────────────────────────────────────────────────────────────

async function exclusivityChecks(run, base, browser) {
  await run.step('`/` over an open link picker displaces it', async () => {
    const { page, close } = await open(base, browser, ARTICLE);
    try {
      await page.keyboard.press('l');
      await page.waitForTimeout(400);
      const picker = await page.evaluate(OVERLAY_PROBE);
      eq(picker.linksOpen, true, 'picker never opened');
      assertAtMostOneModal(picker, 'with the link picker open');

      await page.keyboard.press('/');
      await page.waitForTimeout(500);
      const state = await page.evaluate(OVERLAY_PROBE);
      // Exclusivity is a claim about overlay *state*, not about who carries the
      // dialog role: one surface owns the keyboard, and the incumbent is closed
      // rather than left open underneath.
      eq({ links: state.linksOpen, palette: state.paletteOpen, prefix: state.palettePrefix },
        { links: false, palette: true, prefix: '/' }, 'overlay exclusivity after `l` then `/`');
      assertAtMostOneModal(state, 'after `/` displaced the link picker');
      return `picker closed, palette open at /, ${state.visibleAriaModals} aria-modal painted`;
    } finally { await close(); }
  });

  for (const key of [':', '/']) {
    await run.step(`\`${key}\` over the open man page displaces it`, async () => {
      const { page, close } = await open(base, browser, '/');
      try {
        await page.keyboard.press('?');
        await page.waitForTimeout(500);
        const help = await page.evaluate(OVERLAY_PROBE);
        eq(help.paletteHelpOpen, true, 'the man page never opened');
        assertAtMostOneModal(help, 'with the man page open');

        await page.keyboard.press(key);
        await page.waitForTimeout(600);
        const state = await page.evaluate(OVERLAY_PROBE);
        // The prefixes are `global`-scope openers: displacing whatever surface
        // is up is the whole point of that tier. Before the keymap this did
        // nothing at all — the palette's listener returned early while its help
        // overlay was open.
        eq({ help: state.paletteHelpOpen, header: state.helpHeader, palette: state.paletteOpen, prefix: state.palettePrefix },
          { help: false, header: null, palette: true, prefix: key },
          `\`${key}\` over the man page`);
        eq(state.paletteInputFocused, true, `\`${key}\` opened the palette without focusing its input`);
        assertAtMostOneModal(state, `after \`${key}\` displaced the man page`);
        return `man page gone, palette open at ${key}, input focused`;
      } finally { await close(); }
    });
  }

  await run.step('a re-pressed prefix refocuses the palette instead of closing it', async () => {
    const { page, close } = await open(base, browser, '/');
    try {
      await page.keyboard.press(':');
      await page.waitForTimeout(500);
      eq((await page.evaluate(OVERLAY_PROBE)).paletteOpen, true, 'the palette never opened');
      // Blur first, or "input is focused afterwards" would be true either way
      // and the case would pass without the refocus doing anything.
      await page.evaluate(`(() => { let el = document.activeElement; while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement; el?.blur(); })()`);
      const blurred = await page.evaluate(OVERLAY_PROBE);
      eq({ open: blurred.paletteOpen, focused: blurred.paletteInputFocused }, { open: true, focused: false },
        'blurring the palette input closed the palette');

      await page.keyboard.press(':');
      await page.waitForTimeout(500);
      const state = await page.evaluate(OVERLAY_PROBE);
      // `palette.refocus` wins on scope specificity, so the prefix does not
      // toggle the palette shut the way the old opener did.
      eq({ open: state.paletteOpen, prefix: state.palettePrefix, focused: state.paletteInputFocused },
        { open: true, prefix: ':', focused: true }, 're-pressed `:`');
      assertAtMostOneModal(state, 'after re-pressing `:`');
      return 'palette still open at :, input refocused';
    } finally { await close(); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3b. `overlay:diagram` — the Mermaid lightbox
// ─────────────────────────────────────────────────────────────────────────────

/**
 * The rendered scale, parsed out of the inline transform the lightbox writes.
 * Asserted as a direction of travel rather than as a literal factor: 1.25 is
 * the component's zoom step, not a promise to the user.
 */
function scaleOf(transform, what) {
  const m = /scale\(([\d.]+)\)/.exec(transform ?? '');
  assert(m, `${what}: no scale() in the lightbox transform (${JSON.stringify(transform)})`);
  return Number.parseFloat(m[1]);
}

async function diagramChecks(run, base, browser) {
  await run.step('the diagram lightbox zooms with `+` `=` `-` and resets with `0`', async () => {
    const { page, close } = await open(base, browser, DIAGRAM_ARTICLE);
    try {
      // mermaid renders client-side and the enlarge control only appears once
      // it has swapped the source block for an <svg>, so there is nothing to
      // open until then. No diagram route, no case — do not invent one.
      const enlarge = page.locator('sz-diagram .enlarge').first();
      await enlarge.waitFor({ state: 'attached', timeout: 20000 });
      await enlarge.click();
      await page.waitForTimeout(700);

      const opened = await page.evaluate(OVERLAY_PROBE);
      eq(opened.diagramOpen, true, 'the enlarge control did not open the lightbox');
      assertAtMostOneModal(opened, 'with the diagram lightbox open');
      const base1 = scaleOf(opened.diagramTransform, 'freshly opened');
      eq(base1, 1, 'the lightbox did not open at 1:1');

      await page.keyboard.press('+');
      await page.waitForTimeout(300);
      const zoomedIn = scaleOf((await page.evaluate(OVERLAY_PROBE)).diagramTransform, 'after `+`');
      assert(zoomedIn > base1, `\`+\` did not zoom in: scale stayed ${zoomedIn}`);

      // `=` is the same physical key without Shift and the one most people
      // press, so it has to zoom in too, not merely be tolerated.
      await page.keyboard.press('=');
      await page.waitForTimeout(300);
      const zoomedMore = scaleOf((await page.evaluate(OVERLAY_PROBE)).diagramTransform, 'after `=`');
      assert(zoomedMore > zoomedIn, `\`=\` did not zoom in: scale stayed ${zoomedMore}`);

      await page.keyboard.press('-');
      await page.waitForTimeout(300);
      const zoomedOut = scaleOf((await page.evaluate(OVERLAY_PROBE)).diagramTransform, 'after `-`');
      assert(zoomedOut < zoomedMore, `\`-\` did not zoom out: scale stayed ${zoomedOut}`);

      await page.keyboard.press('0');
      await page.waitForTimeout(300);
      eq(scaleOf((await page.evaluate(OVERLAY_PROBE)).diagramTransform, 'after `0`'), 1, '`0` did not reset the zoom');
      return `1 → ${zoomedIn} → ${zoomedMore} → ${zoomedOut} → 1`;
    } finally { await close(); }
  });

  await run.step('Escape closes the lightbox and hands focus back exactly once', async () => {
    const { page, close } = await open(base, browser, DIAGRAM_ARTICLE);
    try {
      const enlarge = page.locator('sz-diagram .enlarge').first();
      await enlarge.waitFor({ state: 'attached', timeout: 20000 });
      await enlarge.focus();
      // Counting focus events rather than just reading the final activeElement:
      // "focus restored" and "focus restored once" are different claims, and a
      // superseded overlay restoring focus as well as its successor is the
      // failure this counts.
      await page.evaluate(`(() => {
        const btn = document.querySelector('sz-diagram').shadowRoot.querySelector('.enlarge');
        window.__invokerFocuses = 0;
        btn.addEventListener('focus', () => { window.__invokerFocuses++; });
      })()`);
      await enlarge.click();
      await page.waitForTimeout(700);
      eq((await page.evaluate(OVERLAY_PROBE)).diagramOpen, true, 'the lightbox never opened');

      await page.keyboard.press('Escape');
      await page.waitForTimeout(600);
      const closed = await page.evaluate(OVERLAY_PROBE);
      eq(closed.diagramOpen, false, 'Escape did not close the lightbox');
      eq(closed.visibleAriaModals, 0, 'Escape closed the lightbox but left an aria-modal painted');
      eq(await page.evaluate(DEEP_LABEL), 'Enlarge diagram', 'focus did not go back to the control that opened the lightbox');
      eq(await page.evaluate('window.__invokerFocuses'), 1, 'the invoker was focused more than once on close');
      eq(pathOf(page), DIAGRAM_ARTICLE, 'Escape closed the lightbox and backed out of the article as well');
      return 'closed, focus back on Enlarge, one focus event, still on the article';
    } finally { await close(); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3c. `overlay:effect` — the matrix rain
// ─────────────────────────────────────────────────────────────────────────────

/** Canvases parked directly on <body>: how the effect makes itself visible. */
const CANVAS_PROBE = `[...document.body.children].filter(el => el.tagName === 'CANVAS').length`;

/** Runs `:matrix` through the palette, the only way a user starts the effect. */
async function runMatrix(page) {
  await page.keyboard.press(':');
  await page.waitForTimeout(400);
  await page.keyboard.type('matrix');
  await page.waitForTimeout(400);
  await page.keyboard.press('Enter');
  await page.waitForTimeout(800);
}

async function effectChecks(run, base, browser) {
  for (const key of ['q', 'Escape']) {
    await run.step(`\`${key}\` dismisses the matrix effect`, async () => {
      const { page, close } = await open(base, browser, '/');
      try {
        eq(await page.evaluate(CANVAS_PROBE), 0, 'a canvas was already on <body> before the effect ran');
        await runMatrix(page);
        eq(await page.evaluate(CANVAS_PROBE), 1, '`:matrix` did not put a canvas on the page');
        // The effect self-cleans after 8s, so every wait here stays well inside
        // that window — otherwise the case would pass on the timeout instead of
        // on the key.
        await page.keyboard.press(key);
        await page.waitForTimeout(700);
        eq(await page.evaluate(CANVAS_PROBE), 0, `\`${key}\` did not dismiss the effect`);
        const state = await page.evaluate(OVERLAY_PROBE);
        eq({ palette: state.paletteOpen, help: state.paletteHelpOpen }, { palette: false, help: false },
          `\`${key}\` dismissed the effect but left a palette surface open`);
        assertAtMostOneModal(state, `after \`${key}\` dismissed the effect`);
        eq(pathOf(page), '/', `\`${key}\` dismissed the effect and navigated as well`);
        return 'canvas appeared, key removed it, nothing else changed';
      } finally { await close(); }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3d. `panes.next` / `panes.prev` — Alt+h/j/k/l
// ─────────────────────────────────────────────────────────────────────────────

const PANES_PROBE = `(() => {
  const el = document.querySelector('sz-tmux-panes');
  const panes = [...(el?.shadowRoot?.querySelectorAll('.pane') ?? [])];
  return { present: !!el, configured: !!el?.config, count: panes.length, active: panes.findIndex(p => p.classList.contains('active')) };
})()`;

async function paneChecks(run, base, browser) {
  await run.step('Alt+h/j/k/l are inert and unconsumed with no pane config', async () => {
    const { page, close } = await open(base, browser, '/');
    try {
      const shipped = await page.evaluate(PANES_PROBE);
      // base.njk mounts <sz-tmux-panes> with no config attribute, so every
      // built route runs the single-pane branch. That is the shipped state, and
      // the pane keys must not act in it.
      eq({ present: shipped.present, configured: shipped.configured }, { present: true, configured: false },
        'sz-tmux-panes is not in its shipped, unconfigured state');
      await page.evaluate(KEY_PROBE);
      for (const key of ['Alt+l', 'Alt+j', 'Alt+h', 'Alt+k']) {
        await page.keyboard.press(key);
        await page.waitForTimeout(200);
      }
      eq(await page.evaluate(PANES_PROBE), shipped, 'a pane key changed something with no config mounted');
      const settled = await page.evaluate('window.__settled');
      const consumed = settled.filter(([, prevented]) => prevented);
      eq(consumed, [], `pane keys were consumed with no config mounted: ${JSON.stringify(consumed)}`);
      eq(pathOf(page), '/', 'a pane key navigated');
      return 'no active-pane change, nothing consumed';
    } finally { await close(); }
  });

  await run.step('Alt+l/j step the active pane forward and Alt+h/k back', async () => {
    const { page, close } = await open(base, browser, '/');
    try {
      // No built route ships a pane config, so this is the one case in the file
      // that configures a component itself, through the same public `config`
      // property the template would set. The keystroke path under test is the
      // real one; only the split is synthetic. Reported as such — it is not an
      // end-to-end assertion.
      await page.evaluate(`(() => {
        document.querySelector('sz-tmux-panes').config = {
          direction: 'horizontal',
          panes: [{ component: 'a', size: 50 }, { component: 'b', size: 25 }, { component: 'c', size: 25 }],
        };
      })()`);
      await page.waitForTimeout(600);
      const start = await page.evaluate(PANES_PROBE);
      eq({ count: start.count, active: start.active }, { count: 3, active: 0 }, 'the injected pane config did not render three panes');

      const trail = [start.active];
      for (const key of ['Alt+l', 'Alt+j', 'Alt+h', 'Alt+k']) {
        await page.keyboard.press(key);
        await page.waitForTimeout(300);
        trail.push((await page.evaluate(PANES_PROBE)).active);
      }
      // Alt+l and Alt+j are the same binding, as are Alt+h and Alt+k, so the
      // walk is forward, forward, back, back — and it clamps at both ends.
      eq(trail, [0, 1, 2, 1, 0], 'active-pane walk under Alt+l/j/h/k');

      await page.keyboard.press('Alt+h');
      await page.waitForTimeout(300);
      eq((await page.evaluate(PANES_PROBE)).active, 0, 'Alt+h ran off the front of the pane list');
      return 'active pane 0 → 1 → 2 → 1 → 0, clamped at the front';
    } finally { await close(); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3e. `focus.activate` — Space on a focused anchor
// ─────────────────────────────────────────────────────────────────────────────

async function spaceChecks(run, base, browser) {
  await run.step('Space follows a focused internal anchor', async () => {
    const { page, close } = await open(base, browser, ARTICLE);
    try {
      // The footer legal links are plain DOM with no target, so following one
      // is an observable navigation rather than a popup.
      const link = page.locator('a[href="/terms-and-conditions/"]').first();
      await link.focus();
      eq(await page.evaluate(DEEP_TAG), 'A', 'could not put focus on an anchor — the case would assert nothing');
      await page.keyboard.press(' ');
      await page.waitForTimeout(1500);
      eq(pathOf(page), '/terms-and-conditions/', 'Space did not follow the focused anchor');
      return `${ARTICLE} → /terms-and-conditions/`;
    } finally { await close(); }
  });

  await run.step('Space on a focused external anchor opens its target', async () => {
    const { page, close } = await open(base, browser, ARTICLE);
    try {
      const link = page.locator('.sz-prose a[href^="https://"]').first();
      await link.focus();
      eq(await page.evaluate(DEEP_TAG), 'A', 'could not put focus on an anchor');
      const href = await link.getAttribute('href');
      // An external anchor is target="_blank", so "followed" means a new page,
      // not a navigation in this one.
      const [popup] = await Promise.all([
        page.context().waitForEvent('page', { timeout: 6000 }).catch(() => null),
        page.keyboard.press(' '),
      ]);
      assert(popup, `Space on ${href} opened no new page`);
      eq(pathOf(page), ARTICLE, 'the article navigated as well as opening the popup');
      return `Space → popup at ${new URL(popup.url()).host}, article untouched`;
    } finally { await close(); }
  });

  await run.step('Space with no anchor focused scrolls and is not swallowed', async () => {
    const { page, close } = await open(base, browser, ARTICLE);
    try {
      await page.evaluate(`document.getElementById('main-content').focus()`);
      eq(await page.evaluate(DEEP_TAG), 'MAIN', 'focus is not on #main-content');
      await page.evaluate(KEY_PROBE);
      const before = (await page.evaluate(SCROLL_PROBE)).top;
      await page.keyboard.press(' ');
      await page.waitForTimeout(700);
      const after = (await page.evaluate(SCROLL_PROBE)).top;
      // `focus.activate` has a `when` guard, so with no anchor focused the key
      // must fall through to the browser's own page-down — untouched, or
      // reading a long article with the space bar stops working.
      assert(after > before, `Space did not scroll the page (${before}px → ${after}px)`);
      eq(await page.evaluate('window.__settled'), [[' ', false]], 'Space was consumed with no anchor focused');
      eq(pathOf(page), ARTICLE, 'Space navigated with no anchor focused');
      return `${before}px → ${after}px, keydown delivered unprevented`;
    } finally { await close(); }
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 3f. `overlay:palette-help` — scrolling the man page
// ─────────────────────────────────────────────────────────────────────────────

async function helpScrollChecks(run, base, browser) {
  const { page, close } = await open(base, browser, '/');
  const at = async () => page.evaluate(OVERLAY_PROBE);

  try {
    await run.step('`?` opens a man page with somewhere to scroll', async () => {
      await page.keyboard.press('?');
      await page.waitForTimeout(700);
      const state = await at();
      eq(state.paletteHelpOpen, true, '`?` did not open the man page');
      assert(state.helpScrollExtent > 100,
        `the man page has ${state.helpScrollExtent}px of scroll extent — every scroll case below would pass vacuously`);
      eq(state.helpScrollTop, 0, 'the man page did not open at the top');
      assertAtMostOneModal(state, 'with the man page open');
      return `extent ${state.helpScrollExtent}px`;
    });

    // Sequential on one page: each case asserts a delta against the offset the
    // previous one left, which is how a reader actually moves through it.
    // The component picks 'smooth' unless prefers-reduced-motion is set, so
    // every wait here has to outlast the animation.
    for (const [key, direction] of [
      ['j', 'down'], ['ArrowDown', 'down'], ['k', 'up'], ['ArrowUp', 'up'],
      ['PageDown', 'down'], ['PageUp', 'up'], [' ', 'down'],
    ]) {
      await run.step(`\`${key === ' ' ? 'Space' : key}\` scrolls the man page ${direction}`, async () => {
        if (direction === 'up' && (await at()).helpScrollTop === 0) {
          await page.keyboard.press('PageDown');
          await page.waitForTimeout(800);
        }
        await page.evaluate(KEY_PROBE);
        const before = (await at()).helpScrollTop;
        await page.keyboard.press(key);
        await page.waitForTimeout(800);
        const after = (await at()).helpScrollTop;
        assert(direction === 'down' ? after > before : after < before,
          `\`${key}\` should scroll ${direction}: expected an offset ${direction === 'down' ? 'above' : 'below'} ${before}, got ${after}`);
        // Overlay-scoped bindings own the keyboard while the man page is up, so
        // these must be consumed — unlike the page tier's fall-through keys.
        eq(await page.evaluate('window.__settled'), [[key, true]], `\`${key}\` scrolled the man page without claiming the keystroke`);
        return `${before}px → ${after}px`;
      });
    }

    await run.step('`q` closes the man page', async () => {
      eq((await at()).paletteHelpOpen, true, 'the man page is already closed');
      await page.keyboard.press('q');
      await page.waitForTimeout(600);
      const state = await at();
      eq({ help: state.paletteHelpOpen, palette: state.paletteOpen }, { help: false, palette: false }, '`q` did not close the man page');
      eq(state.visibleAriaModals, 0, '`q` closed the man page but left an aria-modal painted');
      eq(pathOf(page), '/', '`q` closed the man page and navigated as well');
      return 'man page closed, nothing else changed';
    });
  } finally { await close(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 4. Scrolling
// ─────────────────────────────────────────────────────────────────────────────

async function scrollChecks(run, base, browser) {
  const { page, close } = await open(base, browser, ARTICLE);
  const at = () => page.evaluate(SCROLL_PROBE);

  try {
    await run.step('the article has a scroller with somewhere to go', async () => {
      const s = await at();
      assert(s.extent > 200, `scroll extent is ${s.extent}px on ${ARTICLE} — every scroll case below would pass vacuously`);
      eq(s.top, 0, 'article did not open at the top');
      return `${s.which}, extent ${s.extent}px`;
    });

    // Each case asserts a delta against the offset the previous one left, which
    // is what a reader actually experiences: keys compose.
    for (const [key, direction] of [['j', 'down'], ['k', 'up'], ['ArrowDown', 'down'], ['ArrowUp', 'up']]) {
      await run.step(`\`${key}\` scrolls ${direction}`, async () => {
        if (direction === 'up' && (await at()).top === 0) {
          await page.keyboard.press('ArrowDown');
          await page.waitForTimeout(250);
        }
        const before = (await at()).top;
        await page.keyboard.press(key);
        await page.waitForTimeout(250);
        const after = (await at()).top;
        assert(direction === 'down' ? after > before : after < before,
          `\`${key}\` should scroll ${direction}: expected an offset ${direction === 'down' ? 'above' : 'below'} ${before}, got ${after}`);
        return `${before}px → ${after}px`;
      });
    }

    for (const [key, where] of [['G', 'bottom'], ['Home', 'top'], ['End', 'bottom']]) {
      await run.step(`\`${key}\` scrolls to the ${where}`, async () => {
        if (where === 'bottom') {
          await page.keyboard.press('Home');
          await page.waitForTimeout(300);
        }
        const before = await at();
        await page.keyboard.press(key);
        await page.waitForTimeout(400);
        const after = await at();
        eq(after.top, where === 'top' ? 0 : after.extent, `\`${key}\` from ${before.top}px`);
        return `${before.top}px → ${after.top}px of ${after.extent}px`;
      });
    }

    await run.step('a lone `g` changes nothing and is not consumed', async () => {
      await page.keyboard.press('End');
      await page.waitForTimeout(400);
      const before = (await at()).top;
      await page.evaluate(KEY_PROBE);
      await page.keyboard.press('g');
      await page.waitForTimeout(300);
      eq((await at()).top, before, 'a lone `g` scrolled');
      // A pending prefix must not be swallowed, or every other `g`-prefixed
      // handler and the browser itself stop seeing the key.
      eq(await page.evaluate('window.__settled'), [['g', false]], 'a lone `g` was consumed');
      return `offset held at ${before}px, keydown delivered unprevented`;
    });

    await run.step('`g` `g` scrolls to the top', async () => {
      const before = (await at()).top;
      assert(before > 0, 'already at the top — `g` `g` would pass vacuously');
      await page.keyboard.press('g');
      await page.waitForTimeout(120);
      await page.keyboard.press('g');
      await page.waitForTimeout(400);
      eq((await at()).top, 0, '`g` `g` did not reach the top');
      return `${before}px → 0px`;
    });
  } finally { await close(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 5. Pager, share, nav tabs, window and wallpaper
// ─────────────────────────────────────────────────────────────────────────────

async function pageBindingChecks(run, base, browser) {
  for (const [key, which, selector] of [
    ['[', 'previous', '.sz-pager__link--prev'],
    [']', 'next', '.sz-pager__link--next'],
  ]) {
    await run.step(`\`${key}\` navigates to the ${which} article`, async () => {
      const { page, close } = await open(base, browser, ARTICLE);
      try {
        const href = await page.evaluate(`document.querySelector('${selector}')?.getAttribute('href') ?? null`);
        assert(href, `${ARTICLE} has no ${selector} — nothing to navigate to`);
        await page.keyboard.press(key);
        await page.waitForTimeout(1500);
        eq(pathOf(page), href, `\`${key}\` did not follow the pager`);
        return `${ARTICLE} → ${href}`;
      } finally { await close(); }
    });
  }

  await run.step('`[` / `]` do nothing where there is no pager', async () => {
    const { page, close } = await open(base, browser, '/blog/');
    try {
      eq(await page.evaluate(`document.querySelectorAll('.sz-pager__link--prev, .sz-pager__link--next').length`), 0,
        '/blog/ grew a pager — pick another pagerless route for this case');
      await page.evaluate(KEY_PROBE);
      await page.keyboard.press('[');
      await page.keyboard.press(']');
      await page.waitForTimeout(600);
      eq(pathOf(page), '/blog/', 'a bracket key navigated off a page with no pager');
      // Scoped by presence, not by page type: with no pager the key must fall
      // through untouched, not be eaten by a listener that found nothing to do.
      eq(await page.evaluate('window.__settled'), [['[', false], [']', false]], 'brackets were consumed with no pager present');
      return 'no navigation, both keys delivered unprevented';
    } finally { await close(); }
  });

  await run.step('`y` copies the share URL', async () => {
    const { page, close } = await open(base, browser, ARTICLE);
    try {
      const href = await page.evaluate(`document.querySelector('.js-share-copy')?.href ?? null`);
      assert(href, `${ARTICLE} has no .js-share-copy anchor — nothing to copy`);
      await page.keyboard.press('y');
      await page.waitForTimeout(600);
      eq(await page.evaluate('navigator.clipboard.readText()'), href, '`y` did not put the share URL on the clipboard');
      const toast = await page.evaluate(NOTIFY_PROBE);
      assert(toast.includes('Link copied'), `no copy confirmation surfaced (notifications read: ${JSON.stringify(toast)})`);
      return `clipboard holds ${href}, toast: ${JSON.stringify(toast.slice(0, 40))}`;
    } finally { await close(); }
  });

  await run.step('`y` does nothing where there is no share control', async () => {
    const { page, close } = await open(base, browser, '/blog/');
    try {
      eq(await page.evaluate(`document.querySelectorAll('.js-share-copy').length`), 0,
        '/blog/ grew a share control — pick another route for this case');
      await page.evaluate(`navigator.clipboard.writeText('sentinel')`);
      await page.evaluate(KEY_PROBE);
      await page.keyboard.press('y');
      await page.waitForTimeout(500);
      eq(await page.evaluate('navigator.clipboard.readText()'), 'sentinel', '`y` copied something on a page with no share control');
      eq(await page.evaluate('window.__settled'), [['y', false]], '`y` was consumed with no share control present');
      return 'clipboard untouched, keydown delivered unprevented';
    } finally { await close(); }
  });

  for (const keyShortcuts of [true, false]) {
    await run.step(`Alt+1..Alt+5 switch nav tabs with keyShortcuts=${keyShortcuts}`, async () => {
      const { page, close } = await open(base, browser, '/', { keyShortcuts });
      try {
        const trail = [];
        for (let i = 0; i < NAV_TABS.length; i++) {
          await page.keyboard.press(`Alt+${i + 1}`);
          await page.waitForTimeout(1100);
          trail.push(pathOf(page));
        }
        // 2.1.4 governs unmodified single-character keys only, so every Alt
        // binding must survive the switch — they are the fallback it leaves.
        eq(trail, NAV_TABS, 'Alt+digit nav trail');
        return trail.join(' → ');
      } finally { await close(); }
    });

    await run.step(`Alt+W, Alt+F and Alt+N fire with keyShortcuts=${keyShortcuts}`, async () => {
      const { page, close } = await open(base, browser, '/', { keyShortcuts });
      const WINDOW_PROBE = `(() => {
        const w = document.querySelector('sz-window')?.shadowRoot;
        const pressed = label => w?.querySelector('button[aria-label="' + label + '"]')?.getAttribute('aria-pressed') ?? null;
        const layer = document.querySelector('sz-slideshow')?.shadowRoot?.querySelector('.layer.active');
        return {
          maximized: pressed('Maximize'),
          fullscreen: pressed('Fullscreen'),
          fullscreenElement: !!document.fullscreenElement,
          wallpaper: layer?.getAttribute('style') ?? null,
        };
      })()`;
      try {
        const before = await page.evaluate(WINDOW_PROBE);
        assert(before.wallpaper, 'no active wallpaper layer — Alt+N has nothing observable to change');

        await page.keyboard.press('Alt+n');
        await page.waitForTimeout(1200);
        const wallpapered = await page.evaluate(WINDOW_PROBE);
        assert(wallpapered.wallpaper !== before.wallpaper,
          `Alt+N did not advance the wallpaper: still ${before.wallpaper}`);

        await page.keyboard.press('Alt+w');
        await page.waitForTimeout(900);
        const maximized = await page.evaluate(WINDOW_PROBE);
        // The maximize button's aria-pressed is the only announcement a screen
        // reader gets for this, so it is the assertion, not the layout box.
        eq(maximized.maximized, 'true', 'Alt+W did not toggle the window into maximized mode');

        await page.keyboard.press('Alt+f');
        await page.waitForTimeout(900);
        const full = await page.evaluate(WINDOW_PROBE);
        eq({ fullscreen: full.fullscreen, fullscreenElement: full.fullscreenElement },
          { fullscreen: 'true', fullscreenElement: true }, 'Alt+F');
        return `wallpaper advanced, maximize aria-pressed=true, fullscreen entered`;
      } finally { await close(); }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 6. WCAG 2.1.4 — the switch off
// ─────────────────────────────────────────────────────────────────────────────

async function switchOffChecks(run, base, browser) {
  const { page, close } = await open(base, browser, ARTICLE, { keyShortcuts: false });

  try {
    for (const key of BARE_BINDINGS) {
      await run.step(`\`${key}\` is inert and unconsumed with keyShortcuts=false`, async () => {
        await page.evaluate(`navigator.clipboard.writeText('sentinel')`);
        await page.evaluate(KEY_PROBE);
        const before = await page.evaluate(SCROLL_PROBE);
        await page.keyboard.press(key);
        await page.waitForTimeout(350);

        const after = await page.evaluate(SCROLL_PROBE);
        const overlays = await page.evaluate(OVERLAY_PROBE);
        eq(pathOf(page), ARTICLE, `\`${key}\` navigated with the switch off`);
        eq(after.top, before.top, `\`${key}\` scrolled with the switch off`);
        eq({ links: overlays.linksOpen, palette: overlays.paletteOpen, help: overlays.paletteHelpOpen },
          { links: false, palette: false, help: false }, `\`${key}\` opened an overlay with the switch off`);
        eq(await page.evaluate('navigator.clipboard.readText()'), 'sentinel', `\`${key}\` touched the clipboard with the switch off`);

        // Inert is only half of 2.1.4: the key must also be left entirely
        // alone, so browser type-ahead-find and AT pass-through still work.
        eq(await page.evaluate('window.__delivered'), [key], `the \`${key}\` keydown never reached the page`);
        eq(await page.evaluate('window.__settled'), [[key, false]], `\`${key}\` was preventDefault()ed with the switch off`);
        return 'no navigation, no scroll, no overlay, no clipboard write, keydown delivered unprevented';
      });
    }

    await run.step('Escape and the arrows stay live with keyShortcuts=false', async () => {
      // Everything outside the 2.1.4 criterion has to keep working, or the
      // switch takes the keyboard away instead of handing it back.
      const before = await page.evaluate(SCROLL_PROBE);
      await page.keyboard.press('ArrowDown');
      await page.waitForTimeout(300);
      const moved = await page.evaluate(SCROLL_PROBE);
      assert(moved.top > before.top, `ArrowDown was gated by the switch (${before.top}px → ${moved.top}px)`);
      await page.keyboard.press('Home');
      await page.waitForTimeout(300);
      eq((await page.evaluate(SCROLL_PROBE)).top, 0, 'Home was gated by the switch');
      return `ArrowDown ${before.top}px → ${moved.top}px, Home → 0px`;
    });
  } finally { await close(); }
}

// ─────────────────────────────────────────────────────────────────────────────
// 7. Console errors
// ─────────────────────────────────────────────────────────────────────────────

async function consoleChecks(run) {
  for (const [route, errors] of [...consoleErrors.entries()].sort()) {
    await run.step(`no console errors on ${route}`, () => {
      const unique = [...new Set(errors)];
      assert(unique.length === 0, `${errors.length} error(s), ${unique.length} distinct: ${unique.slice(0, 3).join(' | ')}`);
      return `${route} clean across every session that loaded it`;
    });
  }
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
  await requireSite();
  const server = await serve(siteDir);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  const run = createRun();
  try {
    await prefixChecks(run, base, browser);
    await pickerChecks(run, base, browser);
    await exclusivityChecks(run, base, browser);
    await diagramChecks(run, base, browser);
    await effectChecks(run, base, browser);
    await paneChecks(run, base, browser);
    await spaceChecks(run, base, browser);
    await helpScrollChecks(run, base, browser);
    await scrollChecks(run, base, browser);
    await pageBindingChecks(run, base, browser);
    await switchOffChecks(run, base, browser);
    await consoleChecks(run);
  } finally {
    await browser.close();
    server.close();
  }

  const failed = report(run.checks);
  console.log(`\n${run.checks.length - failed}/${run.checks.length} keyboard cases passed`);
  if (failed > 0) {
    console.log('Expectations live in the BASELINE table at the top of this file; a failure is either a regression or a wave that forgot to flip one.');
  }
  process.exit(failed > 0 ? 1 : 0);
}

main().catch(e => { console.error(e); process.exit(1); });
