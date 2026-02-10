const syntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight');

// Minimal .env loader (no dependency) for local builds. CI provides env vars
// directly via GitHub Actions secrets, so .env is only used in development.
(() => {
  const fs = require('fs');
  try {
    if (!fs.existsSync('.env')) return;
    for (const line of fs.readFileSync('.env', 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
      if (m && process.env[m[1]] === undefined) {
        process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
      }
    }
  } catch { /* ignore — env vars may be provided another way */ }
})();

module.exports = function(eleventyConfig) {
  eleventyConfig.addPlugin(syntaxHighlight);

  // Emit ```mermaid fences as raw <pre class="mermaid"> so the client-side
  // renderer can turn them into diagrams; all other fences keep Prism
  // highlighting. Runs after the syntaxhighlight plugin, wrapping its fence rule.
  eleventyConfig.amendLibrary('md', (md) => {
    const fallback =
      md.renderer.rules.fence ||
      ((tokens, idx, options, env, self) => self.renderToken(tokens, idx, options));
    md.renderer.rules.fence = (tokens, idx, options, env, self) => {
      const token = tokens[idx];
      const lang = (token.info || '').trim().split(/\s+/)[0];
      if (lang === 'mermaid') {
        return `<sz-diagram><pre class="mermaid">${md.utils.escapeHtml(token.content)}</pre></sz-diagram>`;
      }
      return fallback(tokens, idx, options, env, self);
    };
  });

  eleventyConfig.addPassthroughCopy('src/assets');
  eleventyConfig.addPassthroughCopy('src/styles');
  // Content images live in the shared root content/assets (owned by both
  // front-ends, like the markdown corpus); serve them under /assets/content.
  eleventyConfig.addPassthroughCopy({ '../content/assets': 'assets/content' });
  eleventyConfig.addPassthroughCopy({ 'src/CNAME': 'CNAME' });

  eleventyConfig.addFilter('dateDisplay', date => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  });

  eleventyConfig.addFilter('htmlDateString', date => {
    return new Date(date).toISOString().split('T')[0];
  });

  // Group an (already date-sorted) post collection into consecutive month
  // buckets for the blog archive: [{ key: 'YYYY-MM', label: 'Month YYYY', posts }].
  eleventyConfig.addFilter('groupByMonth', posts => {
    const keyOf = d => {
      const x = new Date(d);
      return `${x.getUTCFullYear()}-${String(x.getUTCMonth() + 1).padStart(2, '0')}`;
    };
    const labelOf = d => new Date(d).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', timeZone: 'UTC'
    });
    const groups = [];
    let cur = null;
    for (const post of posts || []) {
      const key = keyOf(post.date);
      if (!cur || cur.key !== key) {
        cur = { key, label: labelOf(post.date), posts: [] };
        groups.push(cur);
      }
      cur.posts.push(post);
    }
    return groups;
  });

  eleventyConfig.addCollection('blog', collection => {
    return collection.getFilteredByGlob('src/content/blog/**/*.md')
      .sort((a, b) => b.date - a.date);
  });

  eleventyConfig.addCollection('projects', collection => {
    return collection.getFilteredByGlob('src/content/projects/**/*.md');
  });

  // Estimate reading time in minutes from rendered content
  eleventyConfig.addFilter('readingTime', content => {
    const words = (content || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  });

  // Strip HTML helper for search index
  eleventyConfig.addFilter('stripHtml', content => {
    return (content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  });

  // Read a local WebP's intrinsic dimensions (no dependency, CI-safe) so poster
  // <img>s can carry width/height and reserve layout space — no content shift
  // as the image loads. Returns "" on any failure so it never breaks a build.
  const path = require('path');
  const webpSize = file => {
    const fs = require('fs');
    const buf = fs.readFileSync(file);
    if (buf.length < 30 || buf.toString('ascii', 0, 4) !== 'RIFF' ||
        buf.toString('ascii', 8, 12) !== 'WEBP') return null;
    const fourcc = buf.toString('ascii', 12, 16);
    if (fourcc === 'VP8 ') {
      return { w: buf.readUInt16LE(26) & 0x3fff, h: buf.readUInt16LE(28) & 0x3fff };
    }
    if (fourcc === 'VP8L') {
      const b = buf.readUInt32LE(21);
      return { w: (b & 0x3fff) + 1, h: ((b >> 14) & 0x3fff) + 1 };
    }
    if (fourcc === 'VP8X') {
      return {
        w: ((buf[24] | (buf[25] << 8) | (buf[26] << 16)) & 0xffffff) + 1,
        h: ((buf[27] | (buf[28] << 8) | (buf[29] << 16)) & 0xffffff) + 1,
      };
    }
    return null;
  };
  eleventyConfig.addFilter('imgDimAttrs', poster => {
    if (!poster || typeof poster !== 'string') return '';
    try {
      const rel = poster.replace(/^\//, '');
      // Content images resolve to the shared root content/assets (served at
      // /assets/content); everything else is a web-local asset under src/.
      const file = rel.startsWith('assets/content/')
        ? path.join(__dirname, '..', 'content', 'assets', rel.slice('assets/content/'.length))
        : path.join(__dirname, 'src', rel);
      const size = webpSize(file);
      return size ? ` width="${size.w}" height="${size.h}"` : '';
    } catch { return ''; }
  });

  // Give every article heading a stable slug id, so the outline rail (sz-toc)
  // can link to it and readers get shareable #deep-links. Build-time, so the
  // ids live in the crawlable light DOM and work without JS.
  eleventyConfig.addTransform('headingAnchors', function (content) {
    const outputPath = (this.page && this.page.outputPath) || this.outputPath;
    if (!outputPath || !outputPath.endsWith('.html')) return content;
    const used = new Set();
    const slugify = (s) =>
      (s.replace(/<[^>]+>/g, '').replace(/&[^;]+;/g, ' ').toLowerCase().trim()
        .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')) || 'section';
    return content.replace(/<h([2-4])\b([^>]*)>([\s\S]*?)<\/h\1>/gi, (match, lvl, attrs, inner) => {
      if (/\bid=/i.test(attrs)) return match;
      const base = slugify(inner);
      let slug = base, n = 2;
      while (used.has(slug)) slug = `${base}-${n++}`;
      used.add(slug);
      return `<h${lvl}${attrs} id="${slug}">${inner}</h${lvl}>`;
    });
  });

  // Open external links in a new tab, site-wide. Runs on every rendered HTML
  // page, so it covers markdown content, Nunjucks templates, nav, and footer
  // alike — links to our own host and ones that already set target are left
  // untouched.
  eleventyConfig.addTransform('externalLinks', function (content) {
    const outputPath = (this.page && this.page.outputPath) || this.outputPath;
    if (!outputPath || !outputPath.endsWith('.html')) return content;
    return content.replace(
      /<a\b([^>]*?)href=("|')(https?:\/\/[^"']+)\2([^>]*)>/gi,
      (match, pre, quote, href, post) => {
        if (/^https?:\/\/(www\.)?stephan\.zych\.be(\/|$)/i.test(href)) return match;
        if (/\btarget=/i.test(pre + post)) return match;
        const rel = /\brel=/i.test(pre + post) ? '' : ' rel="noopener noreferrer"';
        return `<a${pre}href=${quote}${href}${quote}${post} target="_blank"${rel}>`;
      }
    );
  });

  return {
    dir: {
      input: 'src',
      output: '_site',
      includes: '_includes',
      layouts: 'layouts',
      data: 'data'
    },
    templateFormats: ['njk', 'md', 'html'],
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk'
  };
};
