// Behavioural accessibility journey over the built _site/.
//
//   cd web && npm run build && node a11y-journey.mjs     # ad-hoc, prints a table
//   cd web && npm run check:a11y                         # same checks, as a gate
//
// Why this exists as a *separate* file from audit.mjs: axe and Lighthouse only
// ever look at a static initial DOM. They never press a key, never close a
// window, never emulate print media. The permanent keyboard trap that made this
// site's legal links unreachable scored 92-97 on Lighthouse and reported zero
// axe violations for as long as it existed. Everything below is a check no
// static scanner can express — it drives the real page and asserts behaviour.
//
// Every check is a named step that records pass/fail and keeps going, so one
// failure does not hide the other nine. scripts/check-a11y.mjs turns the
// results into an exit code.

import { chromium } from 'playwright';
import { serve, siteDir, STATE_KEY, requireSite } from './audit.mjs';

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };

const ARTICLE = '/blog/terminal-over-ssh/'; // long, has links + a mermaid diagram
const DIAGRAM_ARTICLE = '/blog/orval-typed-api-clients/';

/** Blog posts / project entries currently published — both archives print whole. */
const POST_ROWS = 8;
const PROJECT_PANES = 14;

// document.activeElement stops at a shadow host, so the real focus owner has to
// be found by walking shadowRoot.activeElement down — the same recursion
// core/keyboard.ts exports as deepActiveElement(). Every focus assertion in this
// file goes through this, because half the site's controls live in shadow roots
// and a naive document.activeElement check would report "sz-window" for all of
// them and pass while focus was trapped.
const DEEP_ACTIVE = `(() => {
  let el = document.activeElement;
  while (el?.shadowRoot?.activeElement) el = el.shadowRoot.activeElement;
  if (!el) return null;
  const root = el.getRootNode();
  const host = root instanceof ShadowRoot ? root.host.tagName.toLowerCase() : null;
  const cls = typeof el.className === 'string' && el.className.trim()
    ? '.' + el.className.trim().split(/\\s+/).join('.') : '';
  const label = el.getAttribute('aria-label') || (el.textContent || '').replace(/\\s+/g, ' ').trim().slice(0, 40);
  return {
    sig: (host ? host + '::' : '') + el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls + '[' + label + ']',
    tag: el.tagName.toLowerCase(),
    id: el.id,
    host,
    label,
    href: el.getAttribute('href'),
    inWindow: !!el.closest('sz-window') || !!(host && document.querySelector('sz-window')?.contains(root.host)),
  };
})()`;

/** Collects named check results without letting one failure abort the rest. */
export function createRun() {
  const checks = [];
  return {
    checks,
    async step(name, fn) {
      try {
        const detail = await fn();
        checks.push({ name, ok: true, detail: detail ?? '' });
      } catch (e) {
        checks.push({ name, ok: false, detail: e?.message ?? String(e) });
      }
      return checks[checks.length - 1];
    },
  };
}

function assert(cond, message) {
  if (!cond) throw new Error(message);
}

class Session {
  constructor(browser, base) {
    this.browser = browser;
    this.base = base;
  }

  /**
   * Fresh context per check. `settings` is merged into the persisted
   * core/state.ts blob before any script runs, which is how a saved preference
   * (theme, keyShortcuts) is exercised through its real restore path.
   */
  async open(route, { viewport = DESKTOP, settings = null, print = false } = {}) {
    const context = await this.browser.newContext({ viewport });
    if (settings) {
      await context.addInitScript(
        ([key, value]) => {
          try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
        },
        [STATE_KEY, settings],
      );
    }
    const page = await context.newPage();
    if (print) await page.emulateMedia({ media: 'print' });
    await page.goto(this.base + route, { waitUntil: 'networkidle' });
    // The window components hydrate, promote the scroller and lay themselves
    // out over a couple of frames; measuring before that reads the pre-hydration
    // document, which is a different scroll model.
    await page.waitForTimeout(1200);
    return { context, page, close: () => context.close() };
  }
}

const deep = page => page.evaluate(DEEP_ACTIVE);

async function tabTrail(page, steps) {
  const trail = [];
  for (let i = 0; i < steps; i++) {
    await page.keyboard.press('Tab');
    trail.push(await deep(page));
  }
  return trail;
}

/** Roles present in Chrome's own accessibility tree — not the DOM. */
async function axTree(context, page) {
  const cdp = await context.newCDPSession(page);
  await cdp.send('Accessibility.enable');
  const { nodes } = await cdp.send('Accessibility.getFullAXTree');
  return {
    roles: nodes.map(n => n.role?.value).filter(Boolean),
    names: nodes.map(n => n.name?.value).filter(Boolean),
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// 1. Keyboard journey
// ─────────────────────────────────────────────────────────────────────────────

async function keyboardChecks(run, s) {
  await run.step('Tab escapes the terminal window and the cycle wraps', async () => {
    const { page, close } = await s.open(ARTICLE);
    try {
      const trail = await tabTrail(page, 80);
      const sigs = trail.map(t => t?.sig ?? 'null');

      // The five groups the trap used to make unreachable. The last two are the
      // ones that mattered: the site's only legal links live outside sz-window.
      const required = {
        'skip link': t => t?.href === '#main-content',
        'tmux tab links': t => t?.host === 'sz-tmux-bar' && t.tag === 'a',
        'article body links': t => t?.href?.startsWith('http') && !t.host,
        'wallpaper previous': t => t?.label === 'Previous wallpaper',
        'wallpaper next': t => t?.label === 'Next wallpaper',
        'footer Terms link': t => t?.href === '/terms-and-conditions/',
        'footer Privacy link': t => t?.href === '/privacy/',
      };
      const missing = Object.entries(required)
        .filter(([, match]) => !trail.some(match))
        .map(([name]) => name);
      assert(missing.length === 0, `Tab never reached: ${missing.join(', ')} — focus is pinned inside <sz-window> (WCAG 2.1.2). Reached ${new Set(sigs).size} distinct stops: ${[...new Set(sigs)].slice(0, 12).join(' | ')}`);

      const tabs = trail.filter(required['tmux tab links']);
      assert(tabs.length >= 5, `only ${tabs.length} tmux tab stops in 80 Tabs`);

      // The cycle must repeat, not terminate: find the period at which the
      // trail starts over, and verify every stop matches one period later.
      const period = sigs.findIndex((sig, i) => i > 0 && sig === sigs[0]);
      assert(period > 0, 'Tab order never returned to its first stop in 80 presses — the cycle does not wrap');
      assert(period > 20, `Tab cycle is only ${period} stops long — that is a trap, not the page`);
      for (let i = 0; i + period < sigs.length; i++) {
        assert(sigs[i] === sigs[i + period], `Tab cycle is not periodic: stop ${i} (${sigs[i]}) != stop ${i + period} (${sigs[i + period]})`);
      }
      return `${period}-stop cycle, repeats; reaches skip link, ${tabs.length} tmux tabs, article links, both wallpaper buttons, Terms and Privacy`;
    } finally { await close(); }
  });

  await run.step('A closed window is inert — focus and AX tree both skip it', async () => {
    const { context, page, close } = await s.open(ARTICLE);
    try {
      await page.locator('sz-window .ctrl-btn.close').click();
      await page.waitForTimeout(1200);

      const hiddenBox = await page.evaluate(`(() => {
        const box = document.querySelector('sz-window')?.shadowRoot?.querySelector('.window');
        return box ? { inert: box.hasAttribute('inert'), hidden: box.classList.contains('hidden') } : null;
      })()`);
      assert(hiddenBox?.hidden, 'closing the terminal did not hide it');
      assert(hiddenBox.inert, '.window is hidden but not [inert] — opacity:0 leaves every control tabbable');

      const trail = await tabTrail(page, 40);
      const leaked = trail.filter(t => t?.inWindow);
      assert(leaked.length === 0, `Tab entered the hidden window ${leaked.length}x, first at ${leaked[0]?.sig}`);

      const { roles, names } = await axTree(context, page);
      // The titlebar is the site's banner and the window body holds main, so an
      // inert window must take both out of the tree along with its controls.
      for (const gone of ['Close', 'Fullscreen', 'Maximize', 'Scroll to top']) {
        assert(!names.includes(gone), `hidden window's "${gone}" control is still in the accessibility tree`);
      }
      assert(!roles.includes('main'), 'hidden window still exposes a main landmark');
      // ...while everything outside it stays reachable.
      assert(trail.some(t => t?.href === '/terms-and-conditions/'), 'Terms link unreachable once the window is closed');
      return `[inert] set; 40 Tabs stayed outside; AX tree drops the window's controls, main and banner (${trail.filter(t => t?.href).length} reachable links remain)`;
    } finally { await close(); }
  });

  await run.step('Character-key shortcut `b` navigates while single-key shortcuts are on', async () => {
    const { page, close } = await s.open('/', { settings: { keyShortcuts: true } });
    try {
      await page.evaluate(`window.__keys = []; window.addEventListener('keydown', e => window.__keys.push([e.key, e.defaultPrevented]));`);
      await page.keyboard.press('b');
      await page.waitForTimeout(900);
      assert(new URL(page.url()).pathname === '/blog/', `b did not navigate to /blog/ (landed on ${new URL(page.url()).pathname})`);
      const keys = await page.evaluate('window.__keys');
      assert(keys.some(([k, prevented]) => k === 'b' && prevented), 'b navigated without claiming the keystroke');
      return 'b -> /blog/, keystroke consumed';
    } finally { await close(); }
  });

  await run.step('WCAG 2.1.4: with the switch off, `b` does nothing and the keypress reaches the page', async () => {
    const { page, close } = await s.open('/', { settings: { keyShortcuts: false } });
    try {
      await page.evaluate(`window.__keys = []; window.addEventListener('keydown', e => window.__keys.push([e.key, e.defaultPrevented]));`);
      await page.keyboard.press('b');
      await page.waitForTimeout(900);
      assert(new URL(page.url()).pathname === '/', `b still navigated with shortcuts off (landed on ${new URL(page.url()).pathname}) — there is no working off switch`);
      const keys = await page.evaluate('window.__keys');
      const b = keys.find(([k]) => k === 'b');
      assert(b, 'the b keydown never reached the page');
      // Not merely "did not navigate": 2.1.4 wants the key left entirely alone,
      // so browser type-ahead-find and AT pass-through still work.
      assert(b[1] === false, 'b was preventDefault()ed even with shortcuts off — the key is still swallowed');
      return 'b inert, keydown delivered unprevented';
    } finally { await close(); }
  });

  for (const on of [true, false]) {
    await run.step(`Alt+2 still navigates with single-key shortcuts ${on ? 'on' : 'off'}`, async () => {
      const { page, close } = await s.open('/', { settings: { keyShortcuts: on } });
      try {
        await page.keyboard.press('Alt+2');
        await page.waitForTimeout(900);
        // 2.1.4 governs *unmodified* single-character keys only, so the modified
        // bindings must survive the switch — they are the fallback it leaves.
        assert(new URL(page.url()).pathname === '/about/', `Alt+2 did not navigate to /about/ (landed on ${new URL(page.url()).pathname})`);
        return 'Alt+2 -> /about/';
      } finally { await close(); }
    });
  }

  await run.step('The single-key shortcut setting survives a reload', async () => {
    const { page, close } = await s.open('/');
    try {
      await page.locator('sz-tmux-bar .keys-toggle').click();
      await page.waitForTimeout(300);
      const pressed = await page.locator('sz-tmux-bar .keys-toggle').getAttribute('aria-pressed');
      assert(pressed === 'false', `keys toggle did not flip off (aria-pressed=${pressed})`);
      await page.reload({ waitUntil: 'networkidle' });
      await page.waitForTimeout(1200);
      const stored = await page.evaluate(`JSON.parse(localStorage.getItem('${STATE_KEY}') || '{}').keyShortcuts`);
      assert(stored === false, `setting did not persist across reload (stored: ${JSON.stringify(stored)})`);
      const after = await page.locator('sz-tmux-bar .keys-toggle').getAttribute('aria-pressed');
      assert(after === 'false', `control does not reflect the restored setting (aria-pressed=${after})`);
      await page.keyboard.press('b');
      await page.waitForTimeout(900);
      assert(new URL(page.url()).pathname === '/', 'b navigated again after reload — the off switch did not survive');
      return 'toggled off via the tmux-bar control, still off after reload';
    } finally { await close(); }
  });

  await run.step('sz-links is a focus-managing dialog (desktop)', async () => {
    const { page, close } = await s.open(ARTICLE);
    try {
      const invokerLocator = page.locator('.sz-prose a[href^="http"]').first();
      await invokerLocator.focus();
      const invoker = await deep(page);
      await page.keyboard.press('l');
      await page.waitForTimeout(400);

      assert(await page.locator('sz-links[open]').count() === 1, 'l did not open sz-links');
      const opened = await deep(page);
      assert(opened?.host === 'sz-links', `focus did not move into the dialog (it is on ${opened?.sig}) — aria-modal hides the page behind it, so this would strand an AT user`);

      await page.keyboard.press('Tab');
      await page.waitForTimeout(200);
      const tabbed = await deep(page);
      assert(tabbed?.host === 'sz-links', `Tab escaped the aria-modal dialog to ${tabbed?.sig}`);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      assert(await page.locator('sz-links[open]').count() === 0, 'Escape did not close sz-links');
      const returned = await deep(page);
      assert(returned?.sig === invoker?.sig, `focus went to ${returned?.sig} instead of back to the invoker ${invoker?.sig}`);
      return `opened on ${invoker?.label}, focus held inside, Escape returned it`;
    } finally { await close(); }
  });

  await run.step('sz-links stays shut on a phone viewport', async () => {
    const { page, close } = await s.open(ARTICLE, { viewport: MOBILE });
    try {
      await page.locator('.sz-prose a[href^="http"]').first().focus();
      await page.keyboard.press('l');
      await page.waitForTimeout(400);
      // Deliberate: there is no `l` key to press on a phone, and the overlay
      // would cover the article it lists.
      assert(await page.locator('sz-links[open]').count() === 0, 'sz-links opened on a 390px viewport');
      return 'no overlay below 768px';
    } finally { await close(); }
  });

  await run.step('sz-diagram lightbox traps focus and hands it back', async () => {
    const { page, close } = await s.open(DIAGRAM_ARTICLE);
    try {
      const enlarge = page.locator('sz-diagram .enlarge').first();
      await enlarge.waitFor({ state: 'attached', timeout: 15000 });
      await enlarge.focus();
      const invoker = await deep(page);
      await enlarge.click();
      await page.waitForTimeout(500);

      const opened = await deep(page);
      assert(opened?.host === 'sz-diagram' && /close/i.test(opened.label), `lightbox did not focus its Close control (focus is on ${opened?.sig})`);

      const trail = await tabTrail(page, 8);
      const escaped = trail.filter(t => t?.host !== 'sz-diagram');
      assert(escaped.length === 0, `Tab left the lightbox to ${escaped[0]?.sig} — the article behind an aria-modal overlay must not be tabbable`);

      await page.keyboard.press('Escape');
      await page.waitForTimeout(400);
      assert(await page.locator('sz-diagram .modal').count() === 0, 'Escape did not close the lightbox');
      const returned = await deep(page);
      assert(returned?.sig === invoker?.sig, `focus went to ${returned?.sig} instead of back to the Enlarge button`);
      return `${new Set(trail.map(t => t?.sig)).size} in-dialog stops, Escape returned focus to Enlarge`;
    } finally { await close(); }
  });

  await run.step('SPA navigation is announced, titled and focused', async () => {
    const { page, close } = await s.open('/blog/');
    try {
      const before = await page.title();
      await page.locator('#main-content a.post-row').first().click();
      await page.waitForTimeout(1200);

      const state = await page.evaluate(`(() => {
        const main = document.getElementById('main-content');
        return {
          path: location.pathname,
          title: document.title,
          announced: document.getElementById('sz-route-announcer')?.textContent ?? null,
          activeId: document.activeElement?.id ?? '',
          activeInMain: !!main && main.contains(document.activeElement),
          h1: document.querySelector('#main-content h1')?.textContent?.trim() ?? null,
        };
      })()`);

      assert(state.path !== '/blog/', 'client-side navigation did not change the path');
      assert(state.title !== before, `document.title still says "${before}"`);
      assert(state.announced === state.title, `#sz-route-announcer says "${state.announced}" but the page is "${state.title}" — a client-side nav changes no document, so nothing else announces it`);
      // The router focuses #main-content itself. On the two archive routes
      // sz-portfolio then moves focus to its first entry, which is still inside
      // main — hence the "or inside" arm rather than a strict identity check.
      assert(state.activeId === 'main-content' || state.activeInMain, `focus stayed outside the new content (activeElement id "${state.activeId}")`);
      return `${state.path} announced as "${state.announced}", focus on ${state.activeId || 'a child of #main-content'}`;
    } finally { await close(); }
  });

  await run.step('Landmarks survive into the accessibility tree on every route', async () => {
    // banner is the fragile one: it is not authored in base.njk at all, it is
    // the implicit role of sz-window's shadow-root <header class="titlebar">.
    // Setting titlebar="hidden" on #terminal would silently delete the site's
    // only banner, and no DOM query for `body > header` would notice.
    const routes = ['/', '/404.html', '/about/', '/blog/', ARTICLE, '/contact/', '/cv/', '/projects/'];
    const report = [];
    for (const route of routes) {
      const { context, page, close } = await s.open(route);
      try {
        const { roles, names } = await axTree(context, page);
        // Exactly one of each: duplicates are what axe's landmark-no-duplicate-*
        // rules are about, and two mains or two banners make the tree useless
        // to navigate by landmark.
        for (const role of ['banner', 'main', 'contentinfo']) {
          const n = roles.filter(r => r === role).length;
          assert(n === 1, `${route}: expected exactly 1 ${role} landmark in the AX tree, found ${n}`);
        }
        // Navigation is legitimately plural — article routes add a breadcrumb,
        // a prev/next pager and a series rail on top of the tmux tab bar. The
        // invariant is that the *primary* nav is there and named.
        assert(names.includes('Sections'), `${route}: no navigation landmark named "Sections" in the AX tree`);
        report.push(`${route} (${roles.filter(r => r === 'navigation').length} nav)`);
      } finally { await close(); }
    }
    return `banner/main/contentinfo each exactly once, "Sections" nav present: ${report.join(', ')}`;
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// 2. Scroll model
// ─────────────────────────────────────────────────────────────────────────────

const SCROLL_PROBE = `(() => {
  const doc = document.scrollingElement;
  const main = document.getElementById('main-content');
  return {
    docExtent: doc.scrollHeight - doc.clientHeight,
    docOverflowY: getComputedStyle(doc).overflowY,
    mainExtent: main.scrollHeight - main.clientHeight,
    mainOverflowY: getComputedStyle(main).overflowY,
    hOverflow: doc.scrollWidth - doc.clientWidth,
  };
})()`;

async function scrollChecks(run, s) {
  await run.step('Mobile (390x844): the document is the scroller', async () => {
    const { page, close } = await s.open(ARTICLE, { viewport: MOBILE });
    try {
      const m = await page.evaluate(SCROLL_PROBE);
      // >0 means the main frame has somewhere to scroll to. It was exactly 0
      // before wave 1, and that zero is why iOS Safari's status-bar
      // tap-to-top was a silent no-op: UIKit scrollsToTop only ever addresses
      // the main frame's scroll view, never an overflow:auto subtree.
      assert(m.docExtent > 0, `document scroll extent is ${m.docExtent}px — the main frame cannot scroll, which kills the iOS status-bar tap-to-top, pull-to-refresh and URL-bar collapse`);
      // Extent alone proves nothing, and neither does a programmatic scroll:
      // `overflow: hidden` still reports scrollHeight > clientHeight and still
      // accepts scrollTo() — it only refuses the *user*. `visible`/`auto` is
      // the difference between a scroller and a clip, so assert the computed
      // value and then prove it with a real wheel gesture below.
      assert(['visible', 'auto', 'scroll'].includes(m.docOverflowY), `the scrolling element computes overflow-y: ${m.docOverflowY} — the document reports an extent it will not let anyone scroll`);
      // If #main-content also scrolls, the article is inside a subtree scroller
      // again and the document extent above is just chrome overflow.
      assert(!['auto', 'scroll'].includes(m.mainOverflowY), `#main-content computes overflow-y: ${m.mainOverflowY} at mobile width — the subtree is the scroller again`);
      assert(m.hOverflow === 0, `${m.hOverflow}px of horizontal overflow at 390px wide`);

      // A real user gesture over the page body, not scrollTo(): this is the
      // thing a phone user actually does, and the only check that a clipped
      // document cannot fake.
      await page.mouse.move(195, 500);
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(400);
      const wheeled = await page.evaluate('document.scrollingElement.scrollTop');
      assert(wheeled > 0, `a 300px wheel over the article moved the document ${wheeled}px — the main frame is not the scroller`);
      return `document extent ${m.docExtent}px (overflow-y: ${m.docOverflowY}), wheel moved it ${wheeled}px, #main-content overflow-y: ${m.mainOverflowY}, no horizontal overflow`;
    } finally { await close(); }
  });
  // The mobile tap-to-top control mirrors the iOS status-bar gesture. It only
  // earns its place once the reader has moved down the page — at rest it would
  // be a tab stop and an accessibility-tree node that do nothing when
  // activated. This also guards a subtler thing: a stray in-flow node left
  // behind by SPA navigation (mermaid's global tooltip div did exactly this)
  // makes a short page report a few px of phantom extent, and the horizontal
  // half catches a full-bleed child escaping its host's padding.
  await run.step('The tap-to-top control appears only once the reader scrolls', async () => {
    const probe = `(() => {
      const doc = document.scrollingElement;
      const btn = document.querySelector('sz-window')?.shadowRoot?.querySelector('.to-top');
      const r = btn ? btn.getBoundingClientRect() : null;
      return {
        extent: doc.scrollHeight - doc.clientHeight,
        hOverflow: doc.scrollWidth - doc.clientWidth,
        clientWidth: doc.clientWidth,
        display: btn ? getComputedStyle(btn).display : 'absent',
        right: r ? Math.round(r.right) : null,
      };
    })()`;
    const seen = [];
    for (const [route, scrolls] of [[ARTICLE, true], ['/blog/', true], ['/contact/', false], ['/', false]]) {
      const { page, close } = await s.open(route, { viewport: MOBILE });
      try {
        const rest = await page.evaluate(probe);
        // No page may overflow sideways at phone width, whatever it does vertically.
        assert(rest.hOverflow === 0, `${route} overflows horizontally by ${rest.hOverflow}px at 390px wide`);
        // display:none, not visibility/opacity: only display removes it from
        // the tab order and the accessibility tree.
        assert(rest.display === 'none', `${route} is at the top of the page yet the tap-to-top control computes display: ${rest.display} — it is a focusable no-op`);

        if (!scrolls) {
          assert(rest.extent === 0, `${route} should not scroll at 390x844 but reports ${rest.extent}px of extent — something is left in flow, check for a stray body-level node`);
          seen.push(`${route} static, hidden`);
          continue;
        }
        // Past the threshold the control has to actually turn up, and sit
        // against the screen edge rather than inside the titlebar's notch padding.
        await page.evaluate('window.scrollTo(0, innerHeight * 1.5)');
        await page.waitForTimeout(400);
        const moved = await page.evaluate(probe);
        assert(moved.display === 'flex', `${route} scrolled ${rest.extent}px worth but the tap-to-top control is still display: ${moved.display}`);
        assert(moved.right === moved.clientWidth, `the tap-to-top control's right edge is ${moved.right}px in a ${moved.clientWidth}px viewport — it should be flush to the screen edge, not inset by the titlebar padding`);
        seen.push(`${route} hidden at rest, shown at 1.5 viewports, flush right`);
      } finally { await close(); }
    }
    return seen.join(' | ');
  });

  // The search button is the only way into the palette on a phone, and the
  // palette module is not in the mobile bundle — so a cold load must lazy-load
  // it rather than leaving a visible, labelled control that does nothing.
  await run.step('The mobile search button toggles the palette and announces it', async () => {
    const { page, close } = await s.open('/blog/', { viewport: MOBILE });
    try {
      const read = () => page.evaluate(`(() => {
        const sr = document.querySelector('sz-palette')?.shadowRoot ?? null;
        const btn = document.querySelector('sz-tmux-bar').shadowRoot.querySelector('.search-btn');
        return { open: sr ? !!sr.querySelector('.overlay') : false, expanded: btn.getAttribute('aria-expanded') };
      })()`);
      const tap = async () => {
        await page.evaluate(`document.querySelector('sz-tmux-bar').shadowRoot.querySelector('.search-btn').click()`);
        await page.waitForTimeout(900);
      };
      const before = await read();
      assert(before.open === false && before.expanded === 'false', `the palette is already open before the button was pressed`);
      await tap();
      const opened = await read();
      assert(opened.open, 'the first press did not open the palette — on a cold mobile load the module is not bundled, so the button has to lazy-load it');
      assert(opened.expanded === 'true', `aria-expanded is ${opened.expanded} while the palette is open`);
      await tap();
      const closed = await read();
      // The palette's outside-click handler runs in the capture phase, so
      // without an explicit exemption it hides the palette before the button's
      // own handler re-opens it, and the toggle only ever opens.
      assert(!closed.open, 'the second press did not close the palette — check the capture-phase outside-click handler is exempting [data-palette-toggle]');
      assert(closed.expanded === 'false', `aria-expanded is ${closed.expanded} while the palette is closed`);
      return 'cold load lazy-loads on first press, second press closes, aria-expanded tracks both';
    } finally { await close(); }
  });

  await run.step('Desktop (1440x900): #main-content is still the scroller', async () => {
    const { page, close } = await s.open(ARTICLE, { viewport: DESKTOP });
    try {
      const m = await page.evaluate(SCROLL_PROBE);
      // 0 is correct here and the inverse of the mobile assertion: the desktop
      // UI hangs off a position:fixed window with html/body overflow:hidden, so
      // the document must have no scroll extent at all. A non-zero value means
      // the mobile model has leaked into desktop.
      assert(m.docExtent === 0, `document scroll extent is ${m.docExtent}px on desktop — the mobile scroll model has leaked upward`);
      assert(['auto', 'scroll'].includes(m.mainOverflowY), `#main-content computes overflow-y: ${m.mainOverflowY} — nothing scrolls the article on desktop`);
      assert(m.mainExtent > 0, `#main-content has ${m.mainExtent}px of scroll extent — the desktop reading scroller is not scrollable`);
      assert(m.hOverflow === 0, `${m.hOverflow}px of horizontal overflow at 1440px wide`);
      return `document extent 0, #main-content extent ${m.mainExtent}px (overflow-y: ${m.mainOverflowY})`;
    } finally { await close(); }
  });

  for (const [label, viewport, root] of [
    ['Mobile', MOBILE, 'document.scrollingElement'],
    ['Desktop', DESKTOP, 'document.getElementById("main-content")'],
  ]) {
    await run.step(`${label}: scroll resets on client-side navigation and is restored on Back`, async () => {
      const { page, close } = await s.open(ARTICLE, { viewport });
      try {
        await page.evaluate(`${root}.scrollTo({ top: 1500, behavior: 'auto' })`);
        await page.waitForTimeout(400);
        const before = await page.evaluate(`${root}.scrollTop`);
        assert(before > 0, `could not scroll ${root} — it has no scroll extent`);

        await page.locator('sz-tmux-bar a.tab[href="/blog/"]').click();
        await page.waitForTimeout(1400);
        const afterNav = await page.evaluate(`${root}.scrollTop`);
        assert(afterNav === 0, `landed ${afterNav}px down the new page instead of at the top`);

        await page.goBack();
        await page.waitForTimeout(1800);
        const afterBack = await page.evaluate(`${root}.scrollTop`);
        // history.scrollRestoration is 'manual' and the router rebuilds
        // #main-content on every navigation, so nothing restores this unless
        // the per-history-entry offset map does.
        assert(Math.abs(afterBack - before) <= 4, `Back restored ${afterBack}px, expected ~${before}px`);
        return `${before}px -> 0 on nav -> ${afterBack}px on Back`;
      } finally { await close(); }
    });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// 3. Print
// ─────────────────────────────────────────────────────────────────────────────

const PRINT_PROBE = `(() => {
  const style = sel => {
    const el = document.querySelector(sel);
    return el ? getComputedStyle(el) : null;
  };
  const win = document.querySelector('sz-window')?.shadowRoot?.querySelector('.window');
  const box = el => el ? { overflow: getComputedStyle(el).overflow, position: getComputedStyle(el).position } : null;
  return {
    chrome: Object.fromEntries(
      ['sz-tmux-bar', 'sz-statusbar', 'sz-background', 'sz-slideshow', 'sz-start-screen',
       'sz-notifications', 'sz-copyright-footer', 'sz-links', 'sz-view-toggle', '.skip-link']
        .map(sel => [sel, style(sel)?.display ?? 'absent']),
    ),
    chain: {
      '#main-content': box(document.getElementById('main-content')),
      'sz-neovim': box(document.querySelector('sz-neovim')),
      'sz-tmux-panes': box(document.querySelector('sz-tmux-panes')),
      'sz-window .window': box(win),
    },
  };
})()`;

/** Visible article titles: the reading-view <h1> and its markdown-source twin. */
const TITLE_PROBE = `[...document.querySelectorAll('.sz-article__title, .sz-md-header .md-h1')]
  .filter(el => el.getClientRects().length > 0)
  .map(el => el.tagName.toLowerCase() + '.' + el.className + ' "' + el.textContent.replace(/\\s+/g, ' ').trim().slice(0, 40) + '"')`;

async function printChecks(run, s) {
  await run.step('Print: the terminal chrome is gone', async () => {
    const { page, close } = await s.open(DIAGRAM_ARTICLE, { print: true });
    try {
      const { chrome } = await page.evaluate(PRINT_PROBE);
      const showing = Object.entries(chrome).filter(([, d]) => d !== 'none' && d !== 'absent');
      assert(showing.length === 0, `still rendering on paper: ${showing.map(([s2, d]) => `${s2} (${d})`).join(', ')} — is the media="print" sheet linked from base.njk?`);
      return `${Object.keys(chrome).length} chrome hosts all display:none`;
    } finally { await close(); }
  });

  await run.step('Print: the fixed, clipping window chain is flattened', async () => {
    const { page, close } = await s.open(DIAGRAM_ARTICLE, { print: true });
    try {
      const { chain } = await page.evaluate(PRINT_PROBE);
      for (const [sel, m] of Object.entries(chain)) {
        assert(m, `${sel} is missing from the page`);
        // Any clipping or fixed link in this chain prints exactly one page and
        // throws the rest of the article away.
        assert(m.overflow === 'visible', `${sel} computes overflow: ${m.overflow} on paper — everything past the first page is clipped`);
        assert(m.position !== 'fixed', `${sel} is still position: fixed on paper`);
      }
      return Object.keys(chain).map(k => `${k}: visible/${chain[k].position}`).join(', ');
    } finally { await close(); }
  });

  await run.step('Print: exactly one article title, in both view modes', async () => {
    const { page, close } = await s.open(DIAGRAM_ARTICLE, { print: true });
    try {
      const seen = [];
      // article.njk emits the header twice — a reading-view copy and a
      // markdown-source twin — and html[data-view] picks one on screen. Print
      // must pin the same one whichever the reader last chose, or two readers
      // print different documents from the same URL. This is the print sheet's
      // most fragile invariant.
      for (const view of ['reading', 'code']) {
        await page.evaluate(`document.documentElement.dataset.view = '${view}'`);
        await page.waitForTimeout(250);
        const titles = await page.evaluate(TITLE_PROBE);
        assert(titles.length === 1, `data-view="${view}" prints ${titles.length} article titles: ${JSON.stringify(titles)}`);
        assert(/sz-article__title/.test(titles[0]), `data-view="${view}" prints the markdown-source twin instead of the reading-view heading: ${titles[0]}`);
        seen.push(`${view}: ${titles[0]}`);
      }
      return seen.join(' | ');
    } finally { await close(); }
  });

  for (const [route, selector, expected, what] of [
    ['/blog/', 'li[data-tags]', POST_ROWS, 'post rows'],
    ['/projects/', 'a.project-pane[data-tags]', PROJECT_PANES, 'project panes'],
  ]) {
    await run.step(`Print: all ${expected} ${what} reach paper on ${route}`, async () => {
      const { page, close } = await s.open(route, { print: true });
      try {
        const m = await page.evaluate(`(() => {
          const els = [...document.querySelectorAll('${selector}')];
          return {
            total: els.length,
            visible: els.filter(e => e.getClientRects().length > 0).length,
            inlineHidden: els.filter(e => e.style.display === 'none').length,
          };
        })()`);
        assert(m.total === expected, `expected ${expected} ${what} in the DOM, found ${m.total} — update the count in a11y-journey.mjs if content changed`);
        // sz-portfolio.applyView() writes inline display:none past its page size
        // and applyGroups() hides whole month groups; paper has no scroll event,
        // so the print sheet has to override both with !important.
        assert(m.visible === expected, `only ${m.visible}/${expected} ${what} print (${m.inlineHidden} carry an inline display:none the print sheet did not override)`);
        return `${m.visible}/${m.total} visible on paper`;
      } finally { await close(); }
    });
  }
}

/**
 * Runs every behavioural check. `browser` and `base` are supplied by the caller
 * (scripts/check-a11y.mjs shares one browser and one server with the axe sweep).
 */
export async function runJourney({ base, browser }) {
  const run = createRun();
  const s = new Session(browser, base);
  await keyboardChecks(run, s);
  await scrollChecks(run, s);
  await printChecks(run, s);
  return run.checks;
}

export function reportJourney(checks) {
  for (const c of checks) {
    console.log(c.ok ? `✓ ${c.name}${c.detail ? `\n    ${c.detail}` : ''}` : `✗ ${c.name}\n    ${c.detail}`);
  }
  return checks.filter(c => !c.ok).length;
}

async function main() {
  await requireSite();
  const server = await serve(siteDir);
  const base = `http://127.0.0.1:${server.address().port}`;
  const browser = await chromium.launch();
  try {
    const checks = await runJourney({ base, browser });
    const failed = reportJourney(checks);
    console.log(`\n${checks.length - failed}/${checks.length} behavioural checks passed`);
    process.exitCode = failed > 0 ? 1 : 0;
  } finally {
    await browser.close();
    server.close();
  }
}

if (process.argv[1] && (await import('node:url')).pathToFileURL(process.argv[1]).href === import.meta.url) {
  await main();
}
