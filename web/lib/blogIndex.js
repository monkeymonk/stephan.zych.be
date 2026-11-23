// Blog index metadata (title, description) per language, parsed from
// content/blog/_index.md and content/blog/fr/_index.md. Those files are the
// browsable index of the content folder; here they only feed the listing
// pages' <title> and meta description (web/src/pages/blog.njk, blog-fr.njk).

const { readFileSync } = require('node:fs');
const path = require('node:path');
const matter = require('gray-matter');

const BLOG_DIR = path.join(__dirname, '..', '..', 'content', 'blog');
const read = rel => matter(readFileSync(path.join(BLOG_DIR, rel), 'utf8')).data;

module.exports = { en: read('_index.md'), fr: read('fr/_index.md') };
