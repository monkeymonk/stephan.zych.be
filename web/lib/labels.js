// UI labels for the bilingual blog, parsed from content/labels/*.md at build
// time — one file per language, front matter is a flat key -> string map
// (snake_case keys), body is a human sentence for GitHub browsing (ignored
// here). Shape mirrors series.js: lib/ rather than the data dir, since
// dir.data is the shared content/data, which holds content only.
//
// Registered in .eleventy.js as the `labels` global plus the `t` filter.

const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');

const LABELS_DIR = path.join(__dirname, '..', '..', 'content', 'labels');

function loadLabels() {
  const labels = {};
  for (const file of readdirSync(LABELS_DIR)) {
    if (!file.endsWith('.md')) continue;
    const lang = file.slice(0, -'.md'.length);
    const raw = readFileSync(path.join(LABELS_DIR, file), 'utf8');
    const { data } = matter(raw);
    labels[lang] = data;
  }
  return labels;
}

const labels = loadLabels();

// t(key, lang, vars) — looks up `key` in labels[lang], falling back to
// labels.en when the language has no entry for it, then substitutes any
// {name}-style placeholders from `vars`. Throws at build time on an unknown
// key (missing from both the requested language and en) so a typo'd key
// fails the build instead of silently rendering as itself.
function t(key, lang, vars) {
  const l = lang || 'en';
  const table = labels[l] || labels.en;
  let value = (table && table[key] !== undefined) ? table[key] : labels.en[key];
  if (value === undefined) {
    throw new Error(`labels: unknown key "${key}"`);
  }
  if (vars) {
    for (const [name, val] of Object.entries(vars)) {
      value = value.split(`{${name}}`).join(String(val));
    }
  }
  return value;
}

module.exports = { labels, t };
