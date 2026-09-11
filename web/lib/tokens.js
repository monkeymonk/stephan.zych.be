// Build-time read of the theme design tokens, so /styleguide/ can show every
// colour the site actually ships instead of a hand-kept list that goes stale
// the first time a token is added.
//
// Lives in lib/ rather than the data dir for the usual reason: dir.data is the
// shared content/data, which holds content only — never build code. Registered
// in .eleventy.js with addGlobalData.

const { readdirSync, readFileSync } = require('node:fs');
const path = require('node:path');

const THEMES_DIR = path.join(__dirname, '..', 'src', 'assets', 'themes');

// `--sz-name: value;` inside any rule block. Values never contain a semicolon
// in these files (they are colours and lengths), so this does not need a real
// CSS parser, and a token that ever does will fail loudly in review rather
// than silently truncate.
const TOKEN = /^\s*(--sz-[a-z0-9-]+)\s*:\s*([^;]+);/gm;

module.exports = function tokens() {
  const themes = readdirSync(THEMES_DIR)
    .filter(file => file.endsWith('.css'))
    .sort()
    .map(file => {
      const css = readFileSync(path.join(THEMES_DIR, file), 'utf8');
      const entries = [...css.matchAll(TOKEN)].map(([, name, value]) => ({
        name,
        value: value.trim(),
      }));
      return { slug: file.replace(/\.css$/, ''), tokens: entries };
    });

  return { themes };
};
