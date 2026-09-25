// Build-time parser for content/cv/*.md — the CV source of truth.
//
// content/cv/index.md is the base CV: flat front matter (name, tagline,
// location, email, website, linkedin, github, photo — identity/contact
// scalars only) plus a Markdown body. Every other section is a "##"
// heading in the body: leading paragraphs = summary; "## Work experience"
// = repeated "### " job blocks; "## Core expertise" / "## Technical
// stack" = repeated "### <label>" groups of plain-text bullets (no
// per-item markup — chip styling comes from the surrounding
// <ul class="sz-cv__taglist">); "## Interests" = a flat plain-text bullet
// list; "## Selected engineering work" / "## Earlier roles" / "## Leadership
// & community" / "## Education & training" / "## Language skills" each
// parse into their own structured shape from a body grammar documented
// next to each parser below. content/cv/<slug>.md files are role
// variants: each one a complete, standalone CV parsed with the identical
// front matter/body grammar (front matter additionally requires `slug`
// and `label`) — there is no merge step, a variant's parsed result
// stands entirely on its own.
//
// Free-text fields (summary, job.summary, job.note, evidence.detail,
// community.detail) are extracted completely as-is — including any literal
// "<sz-tag>...</sz-tag>" substring, a real Lit web component
// (web/src/components/ui/sz-tag.ts) hydrated client-side. The parser does
// not scan for or transform it; cv-body.njk renders those specific fields
// with "| safe" so the raw HTML survives into the page.
//
// Lives in lib/ rather than the data dir for the usual reason: dir.data is
// the shared content/data, which holds content only — never build code.
// Registered in .eleventy.js with addGlobalData, same as tokens.js/wakapi.js.
//
// tui/cv.go implements the identical body grammar independently for the Go
// TUI — this is the renderer-parity-critical half. Keep the two readings of
// the format in sync; do not drift from what's actually on disk in
// content/cv/*.md.

const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');

const CV_DIR = path.join(__dirname, '..', '..', 'content', 'cv');

// Front-matter/body keys that nest under the assembled cv object's
// `basics.*` (flat in the source Markdown, nested here for template
// compatibility — cv-body.njk still reads cv.basics.name etc). Keys not in
// either list are ignored, matching the source schema exactly.
const BASICS_KEYS = ['name', 'tagline', 'location', 'email', 'website', 'linkedin', 'github', 'photo'];

// Keys that stay top-level on the assembled cv object. Shared by
// assembleCV() for both the base CV and every variant, so the mapping
// cannot drift between them.
const TOP_LEVEL_KEYS = [
  'summary',
  'expertise',
  'experience',
  'experienceMarkdown',
  'evidence',
  'earlier',
  'earlierClients',
  'skills',
  'interests',
  'community',
  'education',
  'languages',
];

const HEADING2 = /^##[ \t]+(.+)$/gm;
const HEADING3 = /^###[ \t]+(.+)$/gm;

// "**<label>.**" opener on a paragraph-per-entry section (evidence,
// community): the bold span is the label plus its trailing period.
const BOLD_LABEL = /^\*\*(.+?)\.\*\*\s*/;

// A trailing Markdown link, "[link text](url)", at the very end of an
// evidence entry's detail text. Only the visible text is kept as `link`,
// matching today's bare-domain display convention (cv-body.njk renders it
// as `https://{{ item.link }}`) — the URL itself is discarded.
const TRAILING_LINK = /\[([^\]]+)\]\([^)]+\)\s*$/;

// The free-text fields (summary, job.summary, job.note, evidence/
// community detail) may contain a literal "<sz-tag>...</sz-tag>" span — a
// real Lit web component (web/src/components/ui/sz-tag.ts) rendered
// client-side, passed through untouched by this parser. An unmatched
// opening/closing tag there would hydrate silently broken, so the parser
// fails the build loudly instead, naming the file and the offending text.
const SZ_TAG_OPEN = /<sz-tag>/g;
const SZ_TAG_CLOSE = /<\/sz-tag>/g;

function checkSzTagPairing(text, filePath, fieldDescription) {
  const opens = (text.match(SZ_TAG_OPEN) || []).length;
  const closes = (text.match(SZ_TAG_CLOSE) || []).length;
  if (opens !== closes) {
    throw new Error(`${filePath}: unmatched "<sz-tag>"/"</sz-tag>" in ${fieldDescription} "${text}"`);
  }
}

function normalizeParagraph(text) {
  return text.replace(/\s+/g, ' ').trim();
}

function splitParagraphs(text) {
  if (!text) return [];
  return text
    .split(/\n\s*\n/)
    .map(normalizeParagraph)
    .filter(Boolean);
}

function isGroupBlock(block) {
  return /^\*\*(.+)\*\*$/.test(block.split('\n')[0]);
}

function isBulletBlock(block) {
  return block.startsWith('- ');
}

function isClientsBlock(block) {
  return block.startsWith('Representative clients:');
}

function bulletItems(block) {
  return block
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.startsWith('- '))
    .map((line) => line.slice(2).trim());
}

// "Representative clients: a, b, c" — shared by a job block's trailing
// clients line and "## Earlier roles"' own trailing clients line.
function parseClientsList(text) {
  return text
    .slice('Representative clients:'.length)
    .split(',')
    .map((c) => c.trim())
    .filter(Boolean);
}

// "*<location> · <period>*" — either half may be absent (single value, no
// stray " · "). A lone value with a digit in it is treated as the period
// (dates), otherwise as the location — real CV periods always carry a year,
// real CV locations never do.
function parseMeta(text) {
  const sepIndex = text.indexOf(' · ');
  if (sepIndex === -1) {
    return /\d/.test(text) ? { period: text.trim() } : { location: text.trim() };
  }
  return {
    location: text.slice(0, sepIndex).trim(),
    period: text.slice(sepIndex + 3).trim(),
  };
}

// One "### <role> — <company>[ · via <via>]" job block, body text is
// everything after the title line (meta / summary / groups / highlights /
// clients / note, per the grammar documented in cvContent.js's header).
function parseJob(jobText, filePath) {
  const newlineIndex = jobText.indexOf('\n');
  const titleLine = (newlineIndex === -1 ? jobText : jobText.slice(0, newlineIndex))
    .replace(/^###[ \t]+/, '')
    .trim();
  const bodyText = (newlineIndex === -1 ? '' : jobText.slice(newlineIndex + 1)).trim();

  const titleMatch = titleLine.match(/^(.+?)\s+—\s+(.+)$/);
  if (!titleMatch) {
    throw new Error(`${filePath}: malformed job title "${titleLine}" — expected "<role> — <company>"`);
  }

  const role = titleMatch[1].trim();
  let company = titleMatch[2].trim();
  let via;
  const viaMatch = company.match(/^(.+?)\s+·\s+via\s+(.+)$/);
  if (viaMatch) {
    company = viaMatch[1].trim();
    via = viaMatch[2].trim();
  }

  const job = { role, company };
  if (via) job.via = via;

  const blocks = bodyText
    ? bodyText.split(/\n\s*\n/).map((b) => b.trim()).filter(Boolean)
    : [];
  let idx = 0;

  // Optional "*location · period*" meta line: single line, single asterisk
  // (bold group labels use a double asterisk, so this cannot collide).
  if (blocks[idx] && !blocks[idx].includes('\n') && /^\*(.+)\*$/.test(blocks[idx]) && !blocks[idx].startsWith('**')) {
    const meta = parseMeta(blocks[idx].slice(1, -1));
    if (meta.location) job.location = meta.location;
    if (meta.period) job.period = meta.period;
    idx++;
  }

  // Optional job summary paragraph: the first remaining block, unless it's
  // already a group/highlights/clients block (i.e. there is no summary).
  if (blocks[idx] && !isGroupBlock(blocks[idx]) && !isBulletBlock(blocks[idx]) && !isClientsBlock(blocks[idx])) {
    job.summary = normalizeParagraph(blocks[idx]);
    checkSzTagPairing(job.summary, filePath, 'a job summary');
    idx++;
  }

  const groups = [];
  let highlights = [];
  for (; idx < blocks.length; idx++) {
    const block = blocks[idx];
    if (isClientsBlock(block)) {
      job.clients = parseClientsList(block);
      continue;
    }
    if (isGroupBlock(block)) {
      const label = block.split('\n')[0].match(/^\*\*(.+)\*\*$/)[1].trim();
      groups.push({ label, items: bulletItems(block) });
      continue;
    }
    if (isBulletBlock(block)) {
      highlights = highlights.concat(bulletItems(block));
      continue;
    }
    // Trailing plain paragraph after everything else.
    job.note = normalizeParagraph(block);
    checkSzTagPairing(job.note, filePath, "a job's trailing note");
  }

  if (highlights.length) job.highlights = highlights;
  if (groups.length) job.groups = groups;

  return job;
}

// The content of a "## Work experience" section (heading line already
// stripped) — repeated "### " job blocks, nothing else tolerated.
function parseJobs(sectionContent, filePath) {
  if (!sectionContent) return [];

  const jobHeadings = [...sectionContent.matchAll(HEADING3)];
  if (!jobHeadings.length) {
    throw new Error(`${filePath}: "## Work experience" section has no "### " job entries`);
  }

  const jobs = [];
  for (let i = 0; i < jobHeadings.length; i++) {
    const start = jobHeadings[i].index;
    const end = i + 1 < jobHeadings.length ? jobHeadings[i + 1].index : sectionContent.length;
    jobs.push(parseJob(sectionContent.slice(start, end).trimEnd(), filePath));
  }
  return jobs;
}

// The content of a "## Core expertise" / "## Technical stack" section
// (heading line already stripped) — repeated "### <label>" headings each
// followed by a plain-text bullet list. Not the job-block parser: no
// role/company/meta/summary/clients/note, just a label and bullets.
function parseSkillGroups(sectionContent, filePath) {
  if (!sectionContent) return [];

  const groupHeadings = [...sectionContent.matchAll(HEADING3)];
  if (!groupHeadings.length) {
    throw new Error(`${filePath}: skill section has no "### " group entries`);
  }

  const groups = [];
  for (let i = 0; i < groupHeadings.length; i++) {
    const label = groupHeadings[i][1].trim();
    const start = groupHeadings[i].index + groupHeadings[i][0].length;
    const end = i + 1 < groupHeadings.length ? groupHeadings[i + 1].index : sectionContent.length;
    const items = bulletItems(sectionContent.slice(start, end));
    groups.push({ label, items });
  }
  return groups;
}

// The content of a "## Interests" section (heading line already
// stripped) — a flat plain-text bullet list, same shape as a job's plain
// highlights, no "### " grouping.
function parseInterests(sectionContent) {
  return bulletItems(sectionContent);
}

// The content of a "## Selected engineering work" / "## Leadership &
// community" section (heading line already stripped) — one paragraph per
// entry, blank-line separated: "**<label>.** <detail>", optionally (when
// `withLink` is set) ending with a trailing Markdown link whose visible
// text becomes `link` (and is stripped out of `detail`).
function parseLabelDetailEntries(sectionContent, filePath, sectionName, { withLink }) {
  return splitParagraphs(sectionContent).map((paragraph) => {
    const labelMatch = paragraph.match(BOLD_LABEL);
    if (!labelMatch) {
      throw new Error(`${filePath}: malformed "${sectionName}" entry, missing "**label.**" opener in "${paragraph}"`);
    }
    const entry = { label: labelMatch[1].trim() };
    let rest = paragraph.slice(labelMatch[0].length).trim();
    if (withLink) {
      const linkMatch = rest.match(TRAILING_LINK);
      if (linkMatch) {
        entry.link = linkMatch[1].trim();
        rest = rest.slice(0, linkMatch.index).trim();
      }
    }
    entry.detail = rest;
    checkSzTagPairing(entry.detail, filePath, `a "${sectionName}" entry's detail`);
    return entry;
  });
}

// The content of a "## Earlier roles" section (heading line already
// stripped) — flat "- <role> — <company> · <period>" bullets, plus an
// optional trailing "Representative clients: a, b, c" line.
function parseEarlier(sectionContent, filePath) {
  const lines = sectionContent
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);

  const earlier = [];
  let earlierClients;
  for (const line of lines) {
    if (isClientsBlock(line)) {
      earlierClients = parseClientsList(line);
      continue;
    }
    if (!line.startsWith('- ')) {
      throw new Error(`${filePath}: malformed "Earlier roles" entry "${line}" — expected "- role — company · period"`);
    }
    const text = line.slice(2).trim();
    const match = text.match(/^(.+?)\s+—\s+(.+?)\s+·\s+(.+)$/);
    if (!match) {
      throw new Error(`${filePath}: malformed "Earlier roles" bullet "${text}" — expected "role — company · period"`);
    }
    earlier.push({ role: match[1].trim(), company: match[2].trim(), period: match[3].trim() });
  }
  return { earlier, earlierClients };
}

// The content of a "## Education & training" section (heading line
// already stripped) — flat "- **<school>** — <detail>" bullets.
function parseEducation(sectionContent, filePath) {
  return bulletItems(sectionContent).map((item) => {
    const match = item.match(/^\*\*(.+?)\*\*\s+—\s+(.+)$/);
    if (!match) {
      throw new Error(`${filePath}: malformed "Education & training" bullet "${item}" — expected "**school** — detail"`);
    }
    return { school: match[1].trim(), detail: match[2].trim() };
  });
}

// The content of a "## Language skills" section (heading line already
// stripped) — flat "- **<name>** — <level>[ · <note>]" bullets.
function parseLanguages(sectionContent, filePath) {
  return bulletItems(sectionContent).map((item) => {
    const match = item.match(/^\*\*(.+?)\*\*\s+—\s+(.+)$/);
    if (!match) {
      throw new Error(`${filePath}: malformed "Language skills" bullet "${item}" — expected "**name** — level[ · note]"`);
    }
    const name = match[1].trim();
    const rest = match[2].trim();
    const sepIndex = rest.indexOf(' · ');
    if (sepIndex === -1) return { name, level: rest };
    return { name, level: rest.slice(0, sepIndex).trim(), note: rest.slice(sepIndex + 3).trim() };
  });
}

// Splits the Markdown body into the leading summary paragraphs plus every
// "##" section (parsed per the grammar documented next to each section
// parser above). "## Work experience" is also kept verbatim as
// experienceMarkdown for cv-md.njk to re-emit without re-deriving it.
function parseBody(body, filePath) {
  const headings = [...body.matchAll(HEADING2)];
  const firstHeadingIndex = headings.length ? headings[0].index : body.length;
  const summary = splitParagraphs(body.slice(0, firstHeadingIndex));
  for (const paragraph of summary) {
    checkSzTagPairing(paragraph, filePath, 'the CV summary');
  }

  let experience = [];
  let experienceMarkdown = '';
  let expertise;
  let skills;
  let interests;
  let evidence;
  let earlier;
  let earlierClients;
  let community;
  let education;
  let languages;

  for (let i = 0; i < headings.length; i++) {
    const title = headings[i][1].trim();
    const sectionStart = headings[i].index;
    const sectionEnd = i + 1 < headings.length ? headings[i + 1].index : body.length;
    const sectionText = body.slice(sectionStart, sectionEnd).trimEnd();
    const newlineIndex = sectionText.indexOf('\n');
    const sectionContent = (newlineIndex === -1 ? '' : sectionText.slice(newlineIndex + 1)).trim();

    switch (title.toLowerCase()) {
      case 'work experience':
        experienceMarkdown = sectionText;
        experience = parseJobs(sectionContent, filePath);
        break;
      case 'core expertise':
        expertise = parseSkillGroups(sectionContent, filePath);
        break;
      case 'technical stack':
        skills = parseSkillGroups(sectionContent, filePath);
        break;
      case 'interests':
        interests = parseInterests(sectionContent);
        break;
      case 'selected engineering work':
        evidence = parseLabelDetailEntries(sectionContent, filePath, 'Selected engineering work', { withLink: true });
        break;
      case 'earlier roles': {
        const parsed = parseEarlier(sectionContent, filePath);
        earlier = parsed.earlier;
        earlierClients = parsed.earlierClients;
        break;
      }
      case 'leadership & community':
        community = parseLabelDetailEntries(sectionContent, filePath, 'Leadership & community', { withLink: false });
        break;
      case 'education & training':
        education = parseEducation(sectionContent, filePath);
        break;
      case 'language skills':
        languages = parseLanguages(sectionContent, filePath);
        break;
    }
  }

  return {
    summary,
    experience,
    experienceMarkdown,
    expertise,
    skills,
    interests,
    evidence,
    earlier,
    earlierClients,
    community,
    education,
    languages,
  };
}

// Reads one content/cv/*.md file: front matter fields verbatim, plus
// (when a body is present) every body-derived field from the grammar above.
function parseCVFile(filePath) {
  const raw = readFileSync(filePath, 'utf8');
  const { data, content } = matter(raw);
  const body = content.trim();

  const parsed = { ...data };
  if (body) {
    const {
      summary,
      experience,
      experienceMarkdown,
      expertise,
      skills,
      interests,
      evidence,
      earlier,
      earlierClients,
      community,
      education,
      languages,
    } = parseBody(body, filePath);
    if (summary.length) parsed.summary = summary;
    if (experience.length) parsed.experience = experience;
    if (experienceMarkdown) parsed.experienceMarkdown = experienceMarkdown;
    if (expertise) parsed.expertise = expertise;
    if (skills) parsed.skills = skills;
    if (interests) parsed.interests = interests;
    if (evidence) parsed.evidence = evidence;
    if (earlier) parsed.earlier = earlier;
    if (earlierClients) parsed.earlierClients = earlierClients;
    if (community) parsed.community = community;
    if (education) parsed.education = education;
    if (languages) parsed.languages = languages;
  }
  return parsed;
}

// content/cv/index.md, assembled into the nested { basics, ... } shape the
// templates (cv-body.njk) expect.
function loadBaseCV() {
  const cv = assembleCV(parseCVFile(path.join(CV_DIR, 'index.md')));
  cv.basics.pdf = '/cv/print/';
  return cv;
}

// Every content/cv/*.md other than index.md — raw parsed {slug, label, ...}
// with nothing defaulted in and nothing forced.
function loadVariants() {
  return readdirSync(CV_DIR)
    .filter((file) => file.endsWith('.md') && file !== 'index.md')
    .sort()
    .map((file) => parseCVFile(path.join(CV_DIR, file)));
}

// Assembles a parseCVFile() result into the nested { basics, ... } shape
// cv-body.njk expects (BASICS_KEYS nested under `basics`, TOP_LEVEL_KEYS
// left at the top level; anything else — e.g. a variant's `slug`/`label`
// — is dropped, matching the source schema exactly). Shared by the base
// CV and every variant: there is no merge step, each file's own parse
// result is assembled the identical way and stands entirely on its own.
function assembleCV(parsed) {
  const cv = { basics: {} };
  for (const key of BASICS_KEYS) {
    if (parsed[key] !== undefined) cv.basics[key] = parsed[key];
  }
  for (const key of TOP_LEVEL_KEYS) {
    if (parsed[key] !== undefined) cv[key] = parsed[key];
  }
  return cv;
}

// index.md's own raw parse, kept around (not just its assembled cv object)
// so the base entry's label in cvVariants can come from content — an
// optional `label:` front-matter key, matching every variant — instead of
// a hardcoded string; falls back to "Default" only if index.md omits it.
const baseParsed = parseCVFile(path.join(CV_DIR, 'index.md'));
const baseCv = assembleCV(baseParsed);
baseCv.basics.pdf = '/cv/print/';
const cvVariants = [
  { slug: '', label: baseParsed.label || 'Default', cv: baseCv },
  ...loadVariants().map((variant) => {
    const cv = assembleCV(variant);
    cv.basics.pdf = `/cv/print/${variant.slug}/`;
    return { slug: variant.slug, label: variant.label, cv };
  }),
];

module.exports = {
  parseCVFile,
  loadBaseCV,
  loadVariants,
  cvVariants,
};
