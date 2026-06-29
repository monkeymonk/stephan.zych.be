// Reproducible before/after audit for the built site: Lighthouse (mobile +
// desktop) plus axe-core accessibility checks on the key routes. Serves the
// already-built _site/ over a throwaway static server, drives headless Chromium
// (the one Playwright already installed) for both tools.
//
//   cd web && npm run build && npm run audit            # timestamped report
//   cd web && npm run build && npm run audit -- --baseline   # also write baseline.json
//
// Results: web/audit/report-<ts>.json (+ web/audit/baseline.json with --baseline).

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, access } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import lighthouse from 'lighthouse';
import { launch as launchChrome } from 'chrome-launcher';
import { chromium } from 'playwright';
import AxeBuilder from '@axe-core/playwright';

const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.join(here, '_site');
const outDir = path.join(here, 'audit');

const ROUTES = ['/', '/about/', '/blog/', '/blog/terminal-over-ssh/', '/projects/'];

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon',
  '.xml': 'application/xml', '.txt': 'text/plain',
};

function serve(dir) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(dir, p);
      if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

const CATS = ['performance', 'accessibility', 'best-practices', 'seo'];

async function runLighthouse(url, port, desktop) {
  const config = desktop
    ? (await import('lighthouse/core/config/desktop-config.js')).default
    : undefined; // default config = mobile emulation
  const result = await lighthouse(url, {
    port, output: 'json', logLevel: 'error', onlyCategories: CATS,
  }, config);
  const scores = {};
  for (const c of CATS) scores[c] = Math.round((result.lhr.categories[c].score ?? 0) * 100);
  return scores;
}

async function main() {
  await access(siteDir).catch(() => {
    console.error('No _site/ — run `npm run build` first.');
    process.exit(1);
  });
  await mkdir(outDir, { recursive: true });

  const server = await serve(siteDir);
  const base = `http://127.0.0.1:${server.address().port}`;
  const chrome = await launchChrome({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });
  const browser = await chromium.launch();
  const context = await browser.newContext();

  const report = { generatedAt: new Date().toISOString(), base, routes: {} };
  try {
    for (const route of ROUTES) {
      const url = base + route;
      const desktop = await runLighthouse(url, chrome.port, true);
      const mobile = await runLighthouse(url, chrome.port, false);

      const page = await context.newPage();
      await page.goto(url, { waitUntil: 'networkidle' });
      await page.waitForTimeout(800);
      const axe = await new AxeBuilder({ page })
        .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
        .analyze();
      await page.close();

      report.routes[route] = {
        desktop, mobile,
        axe: {
          violations: axe.violations.length,
          ids: axe.violations.map(v => `${v.id}(${v.nodes.length})`),
        },
      };
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
  console.log('\nroute                         | D:perf a11y bp seo | M:perf | axe');
  console.log('-'.repeat(72));
  for (const [route, r] of Object.entries(report.routes)) {
    const d = r.desktop, m = r.mobile;
    console.log(
      `${route.padEnd(28)} |   ${String(d.performance).padStart(3)}  ${String(d.accessibility).padStart(3)} ${String(d['best-practices']).padStart(3)} ${String(d.seo).padStart(3)} |    ${String(m.performance).padStart(3)} | ${r.axe.violations}${r.axe.violations ? ' ' + r.axe.ids.join(',') : ''}`,
    );
  }
}

main().catch(e => { console.error(e); process.exit(1); });
