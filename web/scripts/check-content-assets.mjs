// Guards against a content page shipping without its social-preview art.
// Every blog post needs two images: a `.webp` poster the site itself renders,
// and a `.jpg` twin used as the `ogImage` — LinkedIn's crawler renders WebP
// link previews unreliably, so a post whose only image is WebP silently goes
// out with no preview at all. Project pages only need the `.webp` poster.
// Deliberately NOT part of `npm run build`: a writer drafting locally must
// still be able to build the site before the art exists. Runs as its own CI
// job gating deploy instead. Pure node, no dependencies.
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..', '..');

// Eleventy serves `content/assets/` at `/assets/content/`, so a front-matter
// value of `/assets/content/<name>` lives at `content/assets/<name>` on disk.
const urlPrefix = '/assets/content/';
const assetDir = 'content/assets';

const collections = [
  { dir: 'content/blog', keys: [{ key: 'poster', ext: '.webp' }, { key: 'ogImage', ext: '.jpg' }] },
  { dir: 'content/projects', keys: [{ key: 'poster', ext: '.webp' }] },
];

const failures = [];

// Returns the text between the leading `---` and the next `---`, so a
// `poster:` mention inside the article body can never satisfy the check.
function frontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return match ? match[1] : null;
}

// Reads a single scalar key out of a front-matter block, unquoted.
function readKey(block, key) {
  const match = block.match(new RegExp(`^${key}:[ \\t]*(.*)$`, 'm'));
  if (!match) return null;
  const value = match[1].trim().replace(/^['"]|['"]$/g, '').trim();
  return value === '' ? null : value;
}

// Suggests the `magick` invocation that derives the missing `.jpg` twin from
// the poster, using the real poster name whenever we managed to read one.
function magickHint(posterValue) {
  const name = posterValue && posterValue.startsWith(urlPrefix)
    ? posterValue.slice(urlPrefix.length).replace(/\.webp$/, '')
    : '<name>';
  return `generate it with: magick ${assetDir}/${name}.webp -quality 85 ${assetDir}/${name}.jpg`;
}

function checkImage(label, key, ext, value, posterValue) {
  const hint = ext === '.jpg' ? ` — ${magickHint(posterValue)}` : '';

  if (value === null) {
    failures.push(
      `✗ ${label} is missing a "${key}:" front-matter key — expected ${key}: ${urlPrefix}<name>${ext}${hint}`,
    );
    return;
  }
  if (!value.startsWith(urlPrefix)) {
    failures.push(
      `✗ ${label} has ${key}: ${value} — must start with ${urlPrefix} (Eleventy serves ${assetDir}/ there)`,
    );
    return;
  }
  if (!value.endsWith(ext)) {
    failures.push(`✗ ${label} has ${key}: ${value} — must end with ${ext}`);
    return;
  }

  const relative = path.posix.join(assetDir, value.slice(urlPrefix.length));
  if (!existsSync(path.join(repoRoot, relative))) {
    failures.push(`✗ ${label} has ${key}: ${value} but ${relative} does not exist${hint}`);
  }
}

let checked = 0;

for (const { dir, keys } of collections) {
  const entries = readdirSync(path.join(repoRoot, dir))
    .filter((name) => name.endsWith('.md'))
    .sort();

  for (const name of entries) {
    const label = path.posix.join(dir, name);
    const block = frontMatter(readFileSync(path.join(repoRoot, dir, name), 'utf8'));
    checked += 1;

    if (block === null) {
      failures.push(`✗ ${label} has no front-matter block (expected a leading --- ... --- section)`);
      continue;
    }

    const posterValue = readKey(block, 'poster');
    for (const { key, ext } of keys) {
      checkImage(label, key, ext, key === 'poster' ? posterValue : readKey(block, key), posterValue);
    }
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exit(1);
}

console.log(`✓ ${checked} content pages declare social-preview images that resolve on disk (posts: .webp poster + .jpg ogImage, projects: .webp poster)`);
process.exit(0);
