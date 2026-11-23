// Series metadata, parsed from content/series/*.md at build time — one
// file per series, front matter `name`, body = the description paragraph.
// Lives in lib/ rather than the data dir for the usual reason: dir.data is
// the shared content/data, which holds content only — never build code.
// Registered in .eleventy.js with addGlobalData, same as cvContent.js.
//
// Returns the same {slug: {name, description}} shape the old
// content/data/seriesData.json map had, so every consuming template
// (series-nav.njk, series-source.njk, blog-index.njk) stays unchanged.

const { readFileSync, readdirSync } = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');

const SERIES_DIR = path.join(__dirname, '..', '..', 'content', 'series');

function loadSeriesData() {
  const seriesData = {};
  for (const file of readdirSync(SERIES_DIR)) {
    if (!file.endsWith('.md')) continue;
    const slug = file.slice(0, -'.md'.length);
    const raw = readFileSync(path.join(SERIES_DIR, file), 'utf8');
    const { data, content } = matter(raw);
    seriesData[slug] = {
      name: data.name,
      description: content.trim(),
    };
  }
  return seriesData;
}

module.exports = loadSeriesData();
