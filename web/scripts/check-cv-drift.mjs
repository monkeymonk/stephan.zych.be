// Guards against CV headline facts drifting apart across the files that
// restate them: the structured content/data/*.json sources and the prose
// pages that quote the same numbers by hand. Fails the build if any of the
// "N to 20 people" / "200+ platforms" / "15 years" / "1 exit" figures
// disagree between files.
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const paths = {
  cv: path.join(repoRoot, 'content/data/cv.json'),
  profile: path.join(repoRoot, 'content/data/profile.json'),
  about: path.join(repoRoot, 'content/pages/about.md'),
  whoami: path.join(repoRoot, 'content/pages/whoami.md'),
};

const cvText = readFileSync(paths.cv, 'utf8');
const profileText = readFileSync(paths.profile, 'utf8');
const aboutText = readFileSync(paths.about, 'utf8');
const whoamiText = readFileSync(paths.whoami, 'utf8');

JSON.parse(cvText); // validates cv.json is well-formed
const profileJson = JSON.parse(profileText);
const stats = Array.isArray(profileJson.stats) ? profileJson.stats : [];

const failures = [];

// Extracts the first capture group of `regex` from `text`, or records a
// failure naming `label` (the source file) and `what` (what we expected).
function extractFirst(text, regex, label, what) {
  const match = text.match(regex);
  if (!match) {
    failures.push(`✗ ${what} not found in ${label} (expected to match ${regex})`);
    return null;
  }
  return match[1];
}

function findStat(predicate, what) {
  const stat = stats.find(predicate);
  if (!stat) {
    failures.push(`✗ profile.json is missing a stats entry for ${what}`);
    return null;
  }
  return stat;
}

// 1. Company growth figure — "grew from N to 20 people".
const growthRegex = /(\d+)\s*(?:to|→|-|–|—)\s*20\b/;
const growthCv = extractFirst(cvText, growthRegex, 'cv.json', 'growth figure ("N to 20 people")');
const growthAbout = extractFirst(aboutText, growthRegex, 'about.md', 'growth figure ("N to 20 people")');
const growthWhoami = extractFirst(whoamiText, growthRegex, 'whoami.md', 'growth figure ("N to 20 people")');

if (growthCv !== null && growthAbout !== null && growthWhoami !== null) {
  if (growthCv !== growthAbout || growthCv !== growthWhoami) {
    failures.push(
      `✗ growth figure differs: cv.json=${growthCv}, about.md=${growthAbout}, whoami.md=${growthWhoami}`
    );
  }
}

// 2. Platforms shipped — "200(+) platforms".
const platformsRegex = /(\d+)\+?\s*(?:web\s+)?platforms/i;
const platformsCv = extractFirst(cvText, platformsRegex, 'cv.json', 'platforms figure ("N platforms")');
const platformsAbout = extractFirst(aboutText, platformsRegex, 'about.md', 'platforms figure ("N platforms")');
const platformsWhoami = extractFirst(whoamiText, platformsRegex, 'whoami.md', 'platforms figure ("N platforms")');

if (platformsCv !== null && platformsCv !== '200') {
  failures.push(`✗ platforms figure in cv.json is ${platformsCv}, expected 200`);
}
if (platformsAbout !== null && platformsAbout !== '200') {
  failures.push(`✗ platforms figure in about.md is ${platformsAbout}, expected 200`);
}
if (platformsWhoami !== null && platformsWhoami !== '200') {
  failures.push(`✗ platforms figure in whoami.md is ${platformsWhoami}, expected 200`);
}

findStat((s) => s.value === 200 && /platforms/i.test(s.label ?? ''), 'value=200 with a "platforms" label');

// 3. Team peak — profile.json must have a "20" stat, consistent with the
// literal "20" the growth-figure regex already requires above.
findStat((s) => s.value === 20 && /(team|peak)/i.test(s.label ?? ''), 'value=20 with a "team"/"peak" label');

// 4. Years & exits (structured only — prose spells these out as words).
findStat((s) => s.value === 15, 'value=15 (years)');
findStat((s) => s.value === 1, 'value=1 (exit)');

if (!/\b15\+?\s*years/i.test(cvText)) {
  failures.push('✗ cv.json has no "15+ years" reference to match profile.json\'s years stat');
}
if (!/acqui(?:re|red|sition)/i.test(cvText)) {
  failures.push('✗ cv.json has no acquisition/exit reference to match profile.json\'s exit stat');
}

// 5. Section headings must stay in lockstep across the three CV renderers —
// the web include, the Markdown export, and the Go/TUI generator all restate
// the same ordered section list by hand, so a rename in one must land in all.
const renderers = [
  {
    name: 'web/src/_includes/cv-body.njk',
    // <h2>…</h2> are the section headers (h1 = name, h3/h4 = jobs/groups).
    extract: (t) => [...t.matchAll(/<h2>([^<]+)<\/h2>/g)].map((m) => m[1].replace(/&amp;/g, '&').trim()),
  },
  {
    name: 'web/src/pages/cv-md.njk',
    // `## Label` at h2 level; the lookbehind rejects the `### ` job titles.
    extract: (t) => [...t.matchAll(/(?<!#)##\s+([^\n"\\]+)/g)].map((m) => m[1].trim()),
  },
  {
    name: 'tui/cv.go',
    extract: (t) => [...t.matchAll(/(?<!#)##\s+([^\n"\\]+)/g)].map((m) => m[1].trim()),
  },
];

const sectionLists = renderers.map((r) => ({
  name: r.name,
  sections: r.extract(readFileSync(path.join(repoRoot, r.name), 'utf8')),
}));
const ref = sectionLists[0];
if (ref.sections.length === 0) {
  failures.push(`✗ no CV section headings extracted from ${ref.name} — the section drift check can't run`);
}
for (const { name, sections } of sectionLists.slice(1)) {
  if (JSON.stringify(sections) !== JSON.stringify(ref.sections)) {
    failures.push(
      '✗ CV section headings differ between renderers:\n' +
        `    ${ref.name}: ${ref.sections.join(' | ')}\n` +
        `    ${name}: ${sections.join(' | ')}`
    );
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('✓ CV headline facts and section headings are consistent across cv.json / profile.json / renderers');
process.exit(0);
