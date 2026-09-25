// Guards against CV headline facts drifting apart across the files that
// restate them: content/cv/index.md (the migrated markdown CV source) and
// the prose pages that quote the same numbers by hand. Fails the build if
// any of the "N to 20 people" / "200+ platforms" / "15 years" / "1 exit"
// figures disagree between files.
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import matter from 'gray-matter';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

const paths = {
  cv: path.join(repoRoot, 'content/cv/index.md'),
  profile: path.join(repoRoot, 'content/data/profile.json'),
  about: path.join(repoRoot, 'content/pages/about.md'),
  whoami: path.join(repoRoot, 'content/pages/whoami.md'),
};

const cvText = readFileSync(paths.cv, 'utf8');
const profileText = readFileSync(paths.profile, 'utf8');
const aboutText = readFileSync(paths.about, 'utf8');
const whoamiText = readFileSync(paths.whoami, 'utf8');

// (content/cv/index.md is Markdown, not JSON — no parse-validity check needed;
// readFileSync above already fails loudly if the file is missing.)
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
const growthCv = extractFirst(cvText, growthRegex, 'content/cv/index.md', 'growth figure ("N to 20 people")');
const growthAbout = extractFirst(aboutText, growthRegex, 'about.md', 'growth figure ("N to 20 people")');
const growthWhoami = extractFirst(whoamiText, growthRegex, 'whoami.md', 'growth figure ("N to 20 people")');

if (growthCv !== null && growthAbout !== null && growthWhoami !== null) {
  if (growthCv !== growthAbout || growthCv !== growthWhoami) {
    failures.push(
      `✗ growth figure differs: content/cv/index.md=${growthCv}, about.md=${growthAbout}, whoami.md=${growthWhoami}`
    );
  }
}

// 2. Platforms shipped — "200(+) platforms".
const platformsRegex = /(\d+)\+?\s*(?:web\s+)?platforms/i;
const platformsCv = extractFirst(cvText, platformsRegex, 'content/cv/index.md', 'platforms figure ("N platforms")');
const platformsAbout = extractFirst(aboutText, platformsRegex, 'about.md', 'platforms figure ("N platforms")');
const platformsWhoami = extractFirst(whoamiText, platformsRegex, 'whoami.md', 'platforms figure ("N platforms")');

if (platformsCv !== null && platformsCv !== '200') {
  failures.push(`✗ platforms figure in content/cv/index.md is ${platformsCv}, expected 200`);
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
  failures.push('✗ content/cv/index.md has no "15+ years" reference to match profile.json\'s years stat');
}
if (!/acqui(?:re|red|sition)/i.test(cvText)) {
  failures.push('✗ content/cv/index.md has no acquisition/exit reference to match profile.json\'s exit stat');
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
    // Work item 4 replaced this file's own hand-built "## Work experience"
    // block with a verbatim re-emission of `cv.experienceMarkdown` — the
    // already-markdown body text the parser retained from
    // content/cv/index.md — so that one heading is no longer hardcoded
    // text in this template to extract; it's covered separately below by
    // checking content/cv/index.md's own heading instead. Every other
    // section heading is still hand-emitted here and stays compared.
    extract: (t) => [...t.matchAll(/(?<!#)##\s+([^\n"\\]+)/g)].map((m) => m[1].trim()),
    knownMissing: ['Work experience'],
  },
  {
    name: 'tui/cv.go',
    // Only the literal `b.WriteString("## <Heading>\n\n")` calls inside
    // cvArticle() are renderer output; a bare `## ` scan over the whole
    // file also matches this file's own body-parsing regexes (e.g.
    // `` regexp.MustCompile(`^## Work experience\s*$`) ``) and doc
    // comments quoting the same heading text, which aren't rendered
    // section headings and would falsely multiply/pollute the list.
    extract: (t) => [...t.matchAll(/b\.WriteString\("##\s+([^\\"]+)\\n/g)].map((m) => m[1].trim()),
  },
];

const sectionLists = renderers.map((r) => ({
  name: r.name,
  sections: r.extract(readFileSync(path.join(repoRoot, r.name), 'utf8')),
  knownMissing: r.knownMissing ?? [],
}));
const ref = sectionLists[0];
if (ref.sections.length === 0) {
  failures.push(`✗ no CV section headings extracted from ${ref.name} — the section drift check can't run`);
}
for (const { name, sections, knownMissing } of sectionLists.slice(1)) {
  const expected = ref.sections.filter((h) => !knownMissing.includes(h));
  if (JSON.stringify(sections) !== JSON.stringify(expected)) {
    failures.push(
      '✗ CV section headings differ between renderers:\n' +
        `    ${ref.name}: ${ref.sections.join(' | ')}\n` +
        `    ${name}: ${sections.join(' | ')}`
    );
  }
}

// cv-md.njk's "## Work experience" heading is no longer its own hardcoded
// string — it flows through verbatim from content/cv/index.md's own
// heading via `cv.experienceMarkdown` — so close the loop the other way:
// that source heading must still literally read "## Work experience" to
// match what cv-body.njk/tui/cv.go hardcode, or a rename there would slip
// past cv-md.njk's export uncaught.
if (ref.sections.includes('Work experience') && !/^##\s+Work experience\s*$/m.test(cvText)) {
  failures.push(
    '✗ content/cv/index.md has no "## Work experience" heading matching the ' +
      'hardcoded heading in cv-body.njk/tui/cv.go (cv-md.njk\'s export re-emits ' +
      'this heading verbatim from that file, so a rename there wouldn\'t ' +
      'otherwise be caught)'
  );
}

// 6. Cross-variant content-identity check — every section shared across
// content/cv/*.md (i.e. every section except "tagline" in front matter,
// and "summary"/"## Work experience"/"## Core expertise"/"## Technical
// stack"/"## Selected engineering work" in the body — the sections a
// variant is explicitly allowed to frame differently per role) must be
// byte-identical text across every file. This is the mechanical backstop
// the no-merge role-variant architecture needs for the sections that
// genuinely never change per role (earlier roles, community, education,
// languages): shared content is duplicated on disk instead of inherited
// from a single base, so nothing else guards against silent, accidental
// drift between index.md/php.md/react.md et al. for those.
const CV_DIR = path.join(repoRoot, 'content/cv');
const SHARED_BASICS_KEYS = ['name', 'location', 'email', 'website', 'linkedin', 'github', 'photo'];
const EXCLUDED_BODY_SECTIONS = ['core expertise', 'technical stack', 'work experience', 'selected engineering work'];
const CV_HEADING2 = /^##[ \t]+(.+)$/gm;

function extractSharedSections(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);
  const body = content.trim();

  const sections = {};
  for (const key of SHARED_BASICS_KEYS) {
    if (data[key] !== undefined) sections[`front matter: ${key}`] = String(data[key]).trim();
  }

  // "summary" (the leading paragraphs) is allowed to differ per role, same
  // as "## Work experience" — each persona may frame its own intro.
  const headings = [...body.matchAll(CV_HEADING2)];

  for (let i = 0; i < headings.length; i++) {
    const title = headings[i][1].trim();
    if (EXCLUDED_BODY_SECTIONS.includes(title.toLowerCase())) continue;
    const start = headings[i].index;
    const end = i + 1 < headings.length ? headings[i + 1].index : body.length;
    sections[`## ${title}`] = body.slice(start, end).trim();
  }

  return sections;
}

const cvFiles = readdirSync(CV_DIR)
  .filter((f) => f.endsWith('.md'))
  .sort();

if (cvFiles.length > 1) {
  const [refCvFile, ...otherCvFiles] = cvFiles;
  const refSections = extractSharedSections(path.join(CV_DIR, refCvFile));

  for (const file of otherCvFiles) {
    const fileSections = extractSharedSections(path.join(CV_DIR, file));

    for (const [name, refText] of Object.entries(refSections)) {
      if (!(name in fileSections)) {
        failures.push(`✗ content/cv/${file} is missing shared CV section "${name}" present in content/cv/${refCvFile}`);
      } else if (fileSections[name] !== refText) {
        failures.push(`✗ content/cv/${file}'s shared CV section "${name}" differs from content/cv/${refCvFile}'s`);
      }
    }
    for (const name of Object.keys(fileSections)) {
      if (!(name in refSections)) {
        failures.push(`✗ content/cv/${file} has shared CV section "${name}" absent from content/cv/${refCvFile}`);
      }
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log('✓ CV headline facts and section headings are consistent across content/cv/index.md / profile.json / renderers');
process.exit(0);
