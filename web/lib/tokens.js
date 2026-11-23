// Build-time read of the theme design tokens, so /styleguide/ can show every
// colour the site actually ships instead of a hand-kept list that goes stale
// the first time a token is added.
//
// Lives in lib/ rather than the data dir for the usual reason: dir.data is the
// shared content/data, which holds content only — never build code. Registered
// in .eleventy.js with addGlobalData.

// The theme stylesheets are generated from content/data/themes.json by
// lib/themes.js, so the tokens are read from that same generated CSS.
const { themes: themesData, themeCss } = require('./themes.js');

// `--sz-name: value;` inside any rule block. Values never contain a semicolon
// in these files (they are colours and lengths), so this does not need a real
// CSS parser, and a token that ever does will fail loudly in review rather
// than silently truncate.
const TOKEN = /^\s*(--sz-[a-z0-9-]+)\s*:\s*([^;]+);/gm;

module.exports = function tokens() {
  const themes = [...themesData.themes]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(theme => {
      const css = themeCss(theme, themesData.roles);
      const entries = [...css.matchAll(TOKEN)].map(([, name, value]) => ({
        name,
        value: value.trim(),
      }));
      return { slug: theme.name, tokens: entries };
    });

  return { themes };
};
