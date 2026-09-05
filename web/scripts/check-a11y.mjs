// The accessibility gate. Fails (exit 1) on any of:
//   1. an axe WCAG violation on any audited route, in any of the three themes
//   2. an axe heading/landmark violation (best-practice rules run by id — see
//      STRUCTURE_RULES in audit.mjs for why the WCAG tags miss them)
//   3. a failed behavioural check from a11y-journey.mjs (keyboard, scroll, print)
//   4. a Lighthouse accessibility score below the recorded audit/baseline.json
//
//   cd web && npm run build && npm run check:a11y
//
// Division of labour: audit.mjs measures and records and never judges, so it
// stays usable for ad-hoc "where are we?" runs; a11y-journey.mjs owns the
// behavioural assertions static scanning cannot express; this file is the only
// thing that decides pass/fail. One server and one browser are shared across
// all three phases.

import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { launch as launchChrome } from 'chrome-launcher';
import { chromium } from 'playwright';
import {
  ROUTES, THEMES, VIEWPORTS, outDir, siteDir, serve, requireSite, runLighthouse, scanRoute,
} from '../audit.mjs';
import { runJourney } from '../a11y-journey.mjs';

const failures = [];
const notes = [];

async function readBaseline() {
  try {
    return JSON.parse(await readFile(path.join(outDir, 'baseline.json'), 'utf8'));
  } catch {
    return null;
  }
}

function section(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 66 - title.length))}`);
}

async function main() {
  await requireSite();
  const baseline = await readBaseline();
  if (!baseline) {
    // Not a soft warning: the score comparison is one of the four gate
    // conditions, and a missing baseline would silently switch it off.
    failures.push('✗ audit/baseline.json is missing — run `npm run audit -- --baseline` to record one');
  }

  const server = await serve(siteDir);
  const base = `http://127.0.0.1:${server.address().port}`;
  const chrome = await launchChrome({
    chromePath: chromium.executablePath(),
    chromeFlags: ['--headless=new', '--no-sandbox', '--disable-gpu'],
  });
  const browser = await chromium.launch();

  try {
    section(`axe: ${ROUTES.length} routes x ${THEMES.length} themes x ${VIEWPORTS.length} viewports`);
    console.log(`themes:    ${THEMES.join(', ')}`);
    console.log(`viewports: ${VIEWPORTS.map(v => `${v.name} ${v.width}x${v.height}`).join(', ')}`);
    for (const route of ROUTES) {
      const axe = await scanRoute(browser, base + route);
      // One cell per theme x viewport, in declaration order: 6 numbers that say
      // exactly which combination is dirty.
      const perCombo = VIEWPORTS.flatMap(v =>
        THEMES.map(t => `${v.name.slice(0, 4)}/${t.split('-').pop().slice(0, 5)}:${axe.byCombo[`${t}@${v.name}`].violations}`),
      ).join(' ');
      const worstContrast = Math.max(...Object.values(axe.contrast));
      const ok = axe.violations === 0 && axe.structure.violations === 0;
      console.log(`${ok ? '✓' : '✗'} ${route.padEnd(26)} wcag ${String(axe.violations).padStart(2)}  contrast<=${worstContrast}  structure ${axe.structure.violations}   [${perCombo}]`);
      for (const [combo, r] of Object.entries(axe.byCombo)) {
        if (r.violations > 0) {
          failures.push(`✗ ${route} [${combo}] axe WCAG violations: ${r.ids.join(', ')}`);
        }
      }
      for (const [viewport, r] of Object.entries(axe.structure.byViewport)) {
        if (r.violations > 0) {
          failures.push(`✗ ${route} [${viewport}] axe heading/landmark violations: ${r.ids.join(', ')}`);
        }
      }
    }

    section('behaviour: keyboard, scroll model, print');
    const checks = await runJourney({ base, browser });
    for (const c of checks) {
      console.log(c.ok ? `✓ ${c.name}${c.detail ? `\n    ${c.detail}` : ''}` : `✗ ${c.name}\n    ${c.detail}`);
      if (!c.ok) failures.push(`✗ behaviour: ${c.name} — ${c.detail}`);
    }

    section('lighthouse accessibility vs audit/baseline.json');
    if (baseline) {
      for (const route of ROUTES) {
        const recorded = baseline.routes?.[route];
        if (!recorded) {
          // A new route is not a regression, but an unrecorded one is
          // unguarded — say so instead of passing it in silence.
          notes.push(`! ${route} has no baseline row — re-run \`npm run audit -- --baseline\` to start guarding it`);
          console.log(`! ${route.padEnd(26)} not in baseline`);
          continue;
        }
        const desktop = await runLighthouse(base + route, chrome.port, true, ['accessibility']);
        const mobile = await runLighthouse(base + route, chrome.port, false, ['accessibility']);
        const row = [
          ['desktop', desktop.accessibility, recorded.desktop?.accessibility],
          ['mobile', mobile.accessibility, recorded.mobile?.accessibility],
        ];
        const regressed = row.filter(([, now, was]) => typeof was === 'number' && now < was);
        const fmt = row.map(([k, now, was]) => `${k} ${now}${was === now ? '' : ` (was ${was})`}`).join('  ');
        console.log(`${regressed.length ? '✗' : '✓'} ${route.padEnd(26)} ${fmt}`);
        for (const [form, now, was] of regressed) {
          failures.push(`✗ ${route} Lighthouse accessibility (${form}) dropped from ${was} to ${now}`);
        }
      }
    }
  } finally {
    await browser.close();
    await chrome.kill();
    server.close();
  }

  console.log('');
  for (const n of notes) console.log(n);
  if (failures.length > 0) {
    console.error(`\n${failures.length} accessibility check(s) failed:\n`);
    for (const f of failures) console.error(f);
    console.error('\nFix the site, not the check: these are the wave 1-3 regressions this gate exists to catch.');
    process.exit(1);
  }

  console.log(`✓ accessibility gate passed — ${ROUTES.length} routes x ${THEMES.length} themes x ${VIEWPORTS.length} viewports clean under axe (WCAG + heading/landmark rules), behavioural keyboard/scroll/print checks green, no Lighthouse accessibility regression`);
  process.exit(0);
}

main().catch(e => { console.error(e); process.exit(1); });
