// Capture the web front-end to WebP stills: a README hero (/) plus per-page
// shots for blog articles. Serves the already-built _site/ over a throwaway
// static server, drives headless Chromium via Playwright, and converts each
// PNG to WebP with ffmpeg (already a host dep for the TUI captures).
//
//   cd web && npm run build && npm run screenshot
//
// Outputs land in the repo's two asset buckets:
//   ../assets/                    — repo-documentation images (README)
//   ../content/assets/screenshots — content images (shared, served at
//                                   /assets/content/screenshots/…)

import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, unlink } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const execFileP = promisify(execFile);
const here = path.dirname(fileURLToPath(import.meta.url));
const siteDir = path.join(here, '_site');
const root = path.join(here, '..');

// 1280×800 @2× — a roomy laptop viewport at retina density.
const VIEWPORT = { width: 1280, height: 800 };
const SCALE = 2;

const SHOTS = [
  { url: '/', out: 'assets/web.webp' },
  { url: '/blog/', out: 'content/assets/screenshots/web-blog.webp' },
  { url: '/projects/', out: 'content/assets/screenshots/web-projects.webp' },
  { url: '/blog/terminal-over-ssh/', out: 'content/assets/screenshots/web-reader.webp' },
];

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'text/javascript',
  '.json': 'application/json', '.webp': 'image/webp', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon',
  '.xml': 'application/xml', '.txt': 'text/plain',
};

function serve(dir) {
  const server = createServer(async (req, res) => {
    try {
      let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      if (p.endsWith('/')) p += 'index.html';
      const file = path.join(dir, p);
      if (!file.startsWith(dir)) { res.writeHead(403).end(); return; }
      const body = await readFile(file);
      res.writeHead(200, { 'content-type': MIME[path.extname(file)] || 'application/octet-stream' });
      res.end(body);
    } catch {
      res.writeHead(404).end('not found');
    }
  });
  return new Promise(resolve => server.listen(0, '127.0.0.1', () => resolve(server)));
}

async function toWebp(png, webp) {
  await mkdir(path.dirname(webp), { recursive: true });
  await execFileP('ffmpeg', ['-y', '-loglevel', 'error', '-i', png,
    '-c:v', 'libwebp', '-quality', '90', webp]);
  await unlink(png);
}

const server = await serve(siteDir);
const { port } = server.address();
const base = `http://127.0.0.1:${port}`;

const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: VIEWPORT,
  deviceScaleFactor: SCALE,
  reducedMotion: 'reduce',
  colorScheme: 'dark',
});

for (const { url, out } of SHOTS) {
  await page.goto(base + url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500); // let web components hydrate / boot settle
  const png = path.join(root, out.replace(/\.webp$/, '.png'));
  await mkdir(path.dirname(png), { recursive: true });
  await page.screenshot({ path: png });
  await toWebp(png, path.join(root, out));
  console.log(`✓ ${url} → ${out}`);
}

// Social/OG card: the homepage at the 1200×630 Open Graph ratio, exported as JPG
// (broad platform support — unlike WebP). This is the default og:image/twitter:image
// for pages without their own poster (home, about, …).
{
  const jpg = path.join(here, 'src/assets/social-card.jpg');
  const png = jpg.replace(/\.jpg$/, '.png');
  const ogPage = await browser.newPage({
    viewport: { width: 1200, height: 630 },
    deviceScaleFactor: 2,
    reducedMotion: 'reduce',
    colorScheme: 'dark',
  });
  await ogPage.goto(base + '/', { waitUntil: 'networkidle' });
  await ogPage.waitForTimeout(1500);
  await ogPage.screenshot({ path: png });
  await execFileP('ffmpeg', ['-y', '-loglevel', 'error', '-i', png,
    '-vf', 'scale=1200:630', '-q:v', '4', jpg]);
  await unlink(png);
  console.log('✓ / → src/assets/social-card.jpg (OG card)');
}

await browser.close();
server.close();
