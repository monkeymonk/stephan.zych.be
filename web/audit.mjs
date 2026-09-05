// Reproducible before/after audit for the built site: Lighthouse (mobile +
// desktop) plus axe-core accessibility checks on the key routes. Serves the
// already-built _site/ over a throwaway static server, drives headless Chromium
// (the one Playwright already installed) for both tools.
//
//   cd web && npm run build && npm run audit            # timestamped report
//   cd web && npm run build && npm run audit -- --baseline   # also write baseline.json
//
// Results: web/audit/report-<ts>.json (+ web/audit/baseline.json with --baseline).
//
// This file's job is to *measure and record*, never to judge: it exits 0 whatever
// it finds, so it stays usable for ad-hoc "where are we?" runs. The pass/fail
// gate is scripts/check-a11y.mjs, which imports the primitives below (plus the
// behavioural journey in a11y-journey.mjs) and is the thing that exits non-zero.
// Everything the gate needs is exported here rather than duplicated there.

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import lighthouse from 'lighthouse';
import { launch as launchChrome } from 'chrome-launcher';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
export const siteDir = path.join(here, '_site');
export const outDir = path.join(here, 'audit');

// /404.html, /contact/ and /cv/ joined the original five in wave 4: /404.html
// rendered no content at all until wave 3 and nothing was measuring it.
export const ROUTES = [
  '/',
  '/404.html',
  '/about/',
  '/blog/',
  '/blog/terminal-over-ssh/',
  '/contact/',
  '/cv/',
  '/projects/',
];

// Colour contrast is a property of the *theme*, not of the markup, and only the
// default theme's stylesheet ships render-blocking (app/index.ts) — so a scan of
// the default theme alone says nothing about the other two.
export const THEMES = ['catppuccin-mocha', 'gruvbox-dark', 'tokyonight'];

// Both viewports, because a one-viewport sweep is not a check. The same
// article reports 0 axe violations at 1280x720 and 9 at 390x844 with
// byte-identical computed colours: on desktop every element sits inside a
// position:fixed window over an opacity backplate and axe resolves far fewer
// backgrounds there, so mobile is the sensitive pass for contrast. Desktop is
// still required — #main-content only becomes a scrollable region there, which
// is where scrollable-region-focusable lives.
export const VIEWPORTS = [
  { name: 'desktop', width: 1280, height: 720 },
  { name: 'mobile', width: 390, height: 844 },
];

export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'];

// Heading and landmark rules are axe *best-practice*, not wcag2a/2aa/21a/21aa:
// withTags(AXE_TAGS) never runs them. That blind spot is why the pre-wave-3
// build reported zero violations while /, /blog/, /projects/ and /404.html had
// no <h1> at all. Run them explicitly, by id, so the gate sees them.
export const STRUCTURE_RULES = [
  'page-has-heading-one',
  'heading-order',
  'landmark-one-main',
  'landmark-no-duplicate-main',
  'landmark-no-duplicate-banner',
  'landmark-no-duplicate-contentinfo',
  'landmark-banner-is-top-level',
  'landmark-main-is-top-level',
  'landmark-contentinfo-is-top-level',
  'landmark-unique',
  'region',
];

// Reviewed residuals of the `region` rule, deliberately not "fixed":
//  - sz-statusbar and sz-tmux-bar's clock cell are terminal chrome; wrapping
//    them in a landmark would reinstate the spurious live region wave 3 removed.
//  - .skip-link has to sit outside every landmark — that is what WCAG 2.4.1
//    asks for, so axe's generic "put it in a landmark" advice is wrong here.
// Matched on the node's target selector, so a *different* node newly failing
// the same rule still fails the gate.
export const AXE_ALLOWLIST = [
  { rule: 'region', target: 'sz-statusbar' },
  { rule: 'region', target: '.right-item' },
  { rule: 'region', target: '.skip-link' },
];

/** localStorage key core/state.ts persists the whole user-settings object under. */
export const STATE_KEY = 'sz-state-v1';

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon',
  '.xml': 'application/xml', '.txt': 'text/plain', '.jpg': 'image/jpeg',
};

export function serve(dir) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(dir, p);
      if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, {
        'content-type': MIME[path.extname(file)] || 'application/octet-stream',
        // Never let a browser reuse a response across builds. Without this a
        // rebuilt stylesheet reads as unapplied — Chromium happily serves the
        // previous build's CSS from its heuristic cache (no Cache-Control, no
        // ETag, so it invents a freshness lifetime), and the gate reports green
        // on a tree that regressed. Do not remove.
        'cache-control': 'no-store, must-revalidate',
      });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const CATS = ['performance', 'accessibility', 'best-practices', 'seo'];

export async function runLighthouse(url, port, desktop, categories = CATS) {
  const config = desktop
    ? (await import('lighthouse/core/config/desktop-config.js')).default
    : undefined; // default config = mobile emulation
  const result = await lighthouse(url, {
    port, output: 'json', logLevel: 'error', onlyCategories: categories,
  }, config);
  const scores = {};
  for (const c of categories) scores[c] = Math.round((result.lhr.categories[c].score ?? 0) * 100);
  return scores;
}

/**
 * Fresh browser context pinned to `theme`.
 *
 * Seeds the saved-settings blob before any script runs, so app/index.ts picks
 * the theme up through its real code path (ensureThemeCss appends the on-demand
 * <link>, then sets data-theme) instead of us hand-poking the attribute and
 * scanning against a stylesheet that never loaded.
 */
export async function themedContext(browser, theme, extra = {}) {
  const context = await browser.newContext(extra);
  await context.addInitScript(
    ([key, value]) => {
      try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
    },
    [STATE_KEY, { theme }],
  );
  return context;
}

/** True once every stylesheet <link> in <head> has resolved. */
const THEME_READY = `(async () => {
  const links = [...document.querySelectorAll('link[rel=stylesheet]')];
  await Promise.all(links.map(l => l.sheet ? null : new Promise(r => {
    l.addEventListener('load', r, { once: true });
    l.addEventListener('error', r, { once: true });
    setTimeout(r, 2000);
  })));
  return document.documentElement.dataset.theme;
})()`;

function allowed(ruleId, node) {
  const target = JSON.stringify(node.target ?? []);
  return AXE_ALLOWLIST.some(a => a.rule === ruleId && target.includes(a.target));
}

/** Drops allow-listed nodes, then drops any violation left with no nodes. */
export function filterAllowlisted(violations) {
  const kept = [];
  for (const v of violations) {
    const nodes = v.nodes.filter(n => !allowed(v.id, n));
    if (nodes.length > 0) kept.push({ ...v, nodes });
  }
  return kept;
}

const summarise = violations => ({
  violations: violations.length,
  ids: violations.map(v => `${v.id}(${v.nodes.length})`),
});

/**
 * axe on one already-loaded page, in two passes: the WCAG tags (the hard gate)
 * and the explicit structural rule ids (see STRUCTURE_RULES).
 */
export async function analyzeAxe(page) {
  const wcag = await new AxeBuilder({ page }).withTags(AXE_TAGS).analyze();
  const structure = await new AxeBuilder({ page }).withRules(STRUCTURE_RULES).analyze();
  return {
    wcag: filterAllowlisted(wcag.violations),
    structure: filterAllowlisted(structure.violations),
  };
}

/**
 * Load `url` once per theme x viewport combination and scan it. Returns the
 * per-combination results plus a rolled-up view, so a caller can report *which*
 * theme and *which* width failed without a second pass.
 *
 * Combination keys read `<theme>@<viewport>`.
 */
export async function scanRoute(browser, url, { themes = THEMES, viewports = VIEWPORTS } = {}) {
  const byCombo = {};
  const contrast = {};
  const structure = {};
  for (const viewport of viewports) {
    for (const theme of themes) {
      const key = `${theme}@${viewport.name}`;
      const context = await themedContext(browser, theme, {
        viewport: { width: viewport.width, height: viewport.height },
      });
      const page = await context.newPage();
      try {
        await page.goto(url, { waitUntil: 'networkidle' });
        await page.evaluate(THEME_READY);
        // The window components hydrate and promote the scroller over a couple
        // of frames; scanning before that measures the pre-hydration layout.
        await page.waitForTimeout(600);
        const { wcag, structure: struct } = await analyzeAxe(page);
        byCombo[key] = summarise(wcag);
        contrast[key] = wcag
          .filter(v => v.id === 'color-contrast')
          .reduce((n, v) => n + v.nodes.length, 0);
        // Heading/landmark structure is theme-independent markup, but it *is*
        // viewport-dependent (mobile hides the view toggle, the archives group
        // differently), so it is recorded per viewport against one theme.
        if (theme === themes[0]) structure[viewport.name] = summarise(struct);
      } finally {
        await context.close();
      }
    }
  }
  const violations = Object.values(byCombo).reduce((n, t) => n + t.violations, 0);
  const ids = [...new Set(Object.values(byCombo).flatMap(t => t.ids))].sort();
  const structureViolations = Object.values(structure).reduce((n, s) => n + s.violations, 0);
  const structureIds = [...new Set(Object.values(structure).flatMap(s => s.ids))].sort();
  return {
    violations, ids, byCombo, contrast,
    structure: { violations: structureViolations, ids: structureIds, byViewport: structure },
  };
}

export async function requireSite() {
  await access(siteDir).catch(() => {
    console.error('No _site/ — run `npm run build` first.');
    process.exit(1);
  });
}

async function main() {
  await requireSite();
  await mkdir(outDir, { recursive: true });

  const server = await serve(siteDir);
  const base = `http://127.0.0.1:${server.address().port}`;
  const chrome = await launchChrome({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });
  const browser = await chromium.launch();

  const report = {
    generatedAt: new Date().toISOString(),
    base,
    themes: THEMES,
    viewports: VIEWPORTS.map(v => `${v.name} ${v.width}x${v.height}`),
    routes: {},
  };
  try {
    for (const route of ROUTES) {
      const url = base + route;
      const desktop = await runLighthouse(url, chrome.port, true);
      const mobile = await runLighthouse(url, chrome.port, false);
      const axe = await scanRoute(browser, url);

      report.routes[route] = { desktop, mobile, axe };
      console.log(`✓ ${route}`);
    }
  } finally {
    await browser.close();
    await chrome.kill();
    server.close();
  }

  const ts = report.generatedAt.replace(/[:.]/g, '-');
  await writeFile(path.join(outDir, `report-${ts}.json`), JSON.stringify(report, null, 2));
  if (process.argv.includes('--baseline')) {
    await writeFile(path.join(outDir, 'baseline.json'), JSON.stringify(report, null, 2));
    console.log('→ wrote audit/baseline.json');
  }

  // Summary table
  console.log('\nroute                         | D:perf a11y bp seo | M:perf | axe (themes x viewports) | structure');
  console.log('-'.repeat(100));
  for (const [route, r] of Object.entries(report.routes)) {
    const d = r.desktop, m = r.mobile;
    console.log(
      `${route.padEnd(28)} |   ${String(d.performance).padStart(3)}  ${String(d.accessibility).padStart(3)} ${String(d['best-practices']).padStart(3)} ${String(d.seo).padStart(3)} |    ${String(m.performance).padStart(3)} | ${String(r.axe.violations).padStart(3)}${r.axe.violations ? ' ' + r.axe.ids.join(',') : '              '} | ${r.axe.structure.violations}${r.axe.structure.violations ? ' ' + r.axe.structure.ids.join(',') : ''}`,
    );
  }
}

// Only self-run: scripts/check-a11y.mjs imports the helpers above.
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch(e => { console.error(e); process.exit(1); });
}
