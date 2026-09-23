const syntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight');
const { eleventyImageTransformPlugin } = require('@11ty/eleventy-img');

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
  // Build-time coding stats. Lives in lib/ rather than the data dir: dir.data
  // is the shared content/data, which holds content only — never build code.
  eleventyConfig.addGlobalData('wakapi', require('./lib/wakapi.js'));

  // Styleguide source of truth: the component roster and the theme tokens are
  // read from the source tree at build time, so /styleguide/ cannot drift from
  // what ships. Same reason wakapi lives in lib/ rather than the data dir.
  eleventyConfig.addGlobalData('components', require('./lib/components.js'));
  eleventyConfig.addGlobalData('tokens', require('./lib/tokens.js'));

  eleventyConfig.addPlugin(syntaxHighlight);

  // Emit ```mermaid fences as raw <pre class="mermaid"> so the client-side
  // renderer can turn them into diagrams; all other fences keep Prism
  // highlighting. Runs after the syntaxhighlight plugin, wrapping its fence rule.
  // Captured below so `mdInline` can reuse the exact configured instance.
  let mdInstance;
  eleventyConfig.amendLibrary('md', (md) => {
    mdInstance = md;
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

    // markdown-it builds an image's alt from its children as plain text but
    // drops `code_inline` tokens, so ![the `:` palette](…) shipped as
    // alt="the  palette". Keep the code's text; everything else is unchanged.
    const renderInlineAsText = md.renderer.renderInlineAsText;
    md.renderer.renderInlineAsText = function (tokens, options, env) {
      return (tokens || []).map(t => t.type === 'code_inline'
        ? t.content
        : renderInlineAsText.call(this, [t], options, env)).join('');
    };
  });

  // Render a short Markdown string inline (no wrapping <p>) — for values that
  // live in front matter/data rather than the article body, e.g. an update's
  // `summary`. Reuses the exact md instance amended above, so it stays in
  // step with anything configured on it.
  eleventyConfig.addFilter('mdInline', str => mdInstance.renderInline(String(str || '')));

  eleventyConfig.addPassthroughCopy('src/assets');
  eleventyConfig.addPassthroughCopy('src/styles');
  // Content images live in the shared root content/assets (owned by both
  // front-ends, like the markdown corpus); serve them under /assets/content.
  eleventyConfig.addPassthroughCopy({ '../content/assets': 'assets/content' });
  eleventyConfig.addPassthroughCopy({ 'src/CNAME': 'CNAME' });

  // The image transform below resolves an absolute <img src> against the
  // input dir (src/), so `/assets/content/x.webp` would look for
  // `src/assets/content/x.webp`. The real file only exists via the
  // `src/content` symlink, at `src/content/assets/x.webp`. Rewrite just the
  // img src before the transform runs (priority 0 beats its -1 — Eleventy
  // sorts priorities descending) so it resolves there instead. Web-local
  // images (e.g. the styleguide's /assets/wallpapers/...) don't start with
  // /assets/content/ and pass through untouched.
  eleventyConfig.htmlTransformer.addPosthtmlPlugin('html', function contentAssetSrcPlugin() {
    return (tree) => {
      tree.match({ tag: 'img' }, (node) => {
        if (node.attrs && typeof node.attrs.src === 'string' && node.attrs.src.startsWith('/assets/content/')) {
          node.attrs.src = '/content/assets/' + node.attrs.src.slice('/assets/content/'.length);
        }
        return node;
      });
      return tree;
    };
  }, { priority: 0 });

  // Resize every <img> to responsive WebP at build time. Single format means
  // plain <img srcset>, not a <picture> wrapper — no CSS selector changes.
  // Widths never upscale, so a smaller source just emits fewer of them.
  eleventyConfig.addPlugin(eleventyImageTransformPlugin, {
    formats: ['webp'],
    widths: [400, 800, 1200, 1600],
    htmlOptions: {
      imgAttributes: {
        loading: 'lazy',
        decoding: 'async',
        // 736px = the widest prose column: 800px max-width minus 2×32px padding.
        sizes: '(max-width: 768px) 100vw, 736px',
      },
    },
  });

  const dateDisplay = date => new Date(date).toLocaleDateString('en-US', {
    year: 'numeric', month: 'long', day: 'numeric'
  });
  eleventyConfig.addFilter('dateDisplay', dateDisplay);

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

  // Collect the unique tags across a collection (order preserved), skipping any
  // in `exclude`. Used by the blog and projects index filter bars.
  eleventyConfig.addFilter('collectTags', (collection, exclude) => {
    const skip = new Set(exclude || []);
    const tags = [];
    for (const item of collection || []) {
      for (const tag of item.data.tags || []) {
        if (!skip.has(tag) && !tags.includes(tag)) tags.push(tag);
      }
    }
    return tags;
  });

  // Posts belonging to a series (by slug), ordered by their `order` front matter.
  // Used by the in-article series nav to list sibling parts.
  eleventyConfig.addFilter('seriesPosts', (posts, slug) => {
    return (posts || [])
      .filter(p => p.data.series === slug)
      .sort((a, b) => (a.data.order || 0) - (b.data.order || 0));
  });

  // An update entry's date, normalized: js-yaml parses an unquoted
  // `YYYY-MM-DD` into a JS Date, but a string slips through just as easily
  // (e.g. if the value were ever quoted), so coerce either into a Date.
  const updateDate = u => new Date(u && u.date);

  // Newest date across an article's `updates` list — the top-of-article
  // notice and the dateModified/lastmod fallback both need this. Falsy for
  // an absent/empty list. Entries are authored oldest-first but not trusted
  // to stay that way, so this takes the max rather than the first/last item.
  eleventyConfig.addFilter('latestUpdate', updates => {
    if (!updates || !updates.length) return null;
    return updates.reduce((latest, u) => {
      const d = updateDate(u);
      return !latest || d > latest ? d : latest;
    }, null);
  });

  // Same list, oldest-first (file order), for the in-article Updates block.
  // File order already reads oldest-first (new entries are appended at the
  // bottom), but that's authoring convention, not something this trusts —
  // it sorts explicitly by date. Each item is still annotated with `n`, its
  // 1-based file-order position, computed before the sort so a misfiled
  // (out-of-date-order) entry can never renumber the markers already
  // injected in the prose, which point at `#update-<n>` by that position.
  eleventyConfig.addFilter('updatesOldestFirst', updates => {
    return (updates || [])
      .map((u, i) => Object.assign({}, u, { n: i + 1 }))
      .sort((a, b) => updateDate(a) - updateDate(b));
  });

  // "Revised YYYY-MM-DD" / "Corrected YYYY-MM-DD" — the one place that
  // decides the marker's kind label, reused by the marker's aria-label
  // below. article-updates.njk repeats the same wording independently for
  // the canonical Updates entry and the drawer mirrors it again for its own
  // visible label — three call sites, one source of the wording.
  const revisionPrefix = (kind, dateStr) => `${kind === 'correction' ? 'Corrected' : 'Revised'} ${dateStr}`;

  // Escape a string for use inside a double-quoted HTML attribute. The
  // revisionMarkers preprocessor below builds `<sup>`/`<label>`/`<input>`/
  // `<aside>` markup by hand (it runs before markdown-it, on raw source —
  // see the comment on that preprocessor), so nothing else stands between
  // an update's authored text and the page; summaries routinely carry
  // backticks, quotes and apostrophes, all of which must not be able to
  // break out of the attribute they're placed in.
  const escapeAttr = str => String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

  // Estimate reading time in minutes from rendered content
  eleventyConfig.addFilter('readingTime', content => {
    const words = (content || '').replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length;
    return Math.max(1, Math.round(words / 200));
  });

  // Strip HTML helper for search index
  eleventyConfig.addFilter('stripHtml', content => {
    return (content || '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  });

  // Host of the canonical site URL, for the analytics tracker's `data-domains`
  // guard. Without it the tracker reports from every hostname it is served on:
  // a local `npm run dev`, a headless CI run against the built site, anything.
  // That is not hypothetical — it put /styleguide/ and /404.html into the real
  // dashboard, from verification runs on 127.0.0.1.
  eleventyConfig.addFilter('hostname', url => {
    try {
      return new URL(url).hostname;
    } catch {
      return String(url || '').replace(/^https?:\/\//, '').replace(/[/:].*$/, '');
    }
  });

  // Superscript revision markers. `marks` on an `updates` entry are verbatim
  // Markdown substrings copied from the article body; this preprocessor finds
  // each one in the raw Markdown source and splices a `<sup>` marker in right
  // after it, linking to that entry in the #updates block. It has to run here
  // — before markdown-it — because a mark snippet is authored Markdown
  // (`**bold**`, `` `code` ``), so it can only be found verbatim in the
  // source, not in the HTML markdown-it renders from it. This is also what
  // keeps the published body byte-identical: the marker is data attached to
  // the update entry, never text the author added to the prose.
  //
  // The match is strict on purpose: a mark must occur in the body exactly
  // once. Zero occurrences means the prose moved out from under a stale
  // snippet; more than one means the snippet is ambiguous about which
  // occurrence it marks. Either throws and fails the build, naming the file,
  // the snippet, and the count — the same loud-failure posture as the
  // check-content-assets poster check.
  eleventyConfig.addPreprocessor('revisionMarkers', 'md', (data, content) => {
    const updates = data.updates;
    if (!Array.isArray(updates) || !updates.length) return content;

    const markers = [];
    updates.forEach((u, uIndex) => {
      const marks = Array.isArray(u.marks) ? u.marks : [];
      marks.forEach((mark, mIndex) => {
        const n = uIndex + 1;
        const i = mIndex + 1;
        const snippet = String(mark);
        let count = 0;
        let firstIndex = -1;
        for (let from = 0; ;) {
          const idx = content.indexOf(snippet, from);
          if (idx === -1) break;
          count++;
          if (firstIndex === -1) firstIndex = idx;
          from = idx + 1;
        }
        if (count !== 1) {
          const inputPath = (data.page && data.page.inputPath) || '(unknown input)';
          const advice = count === 0
            ? 'the prose no longer contains it — update the `marks` snippet to match the current wording'
            : 'lengthen the snippet until it identifies a single occurrence';
          throw new Error(
            `Revision marker mismatch in ${inputPath}: the mark ${JSON.stringify(snippet)} ` +
            `was found ${count} time(s) in the body (expected exactly 1) — ${advice}.`
          );
        }
        const kind = u.kind === 'correction' ? 'correction' : 'revision';
        const dateStr = u.date instanceof Date ? u.date.toISOString().split('T')[0] : String(u.date || '');
        markers.push({ n, i, kind, dateStr, snippetEnd: firstIndex + snippet.length, summary: u.summary });
      });
    });

    // Document order: a mark belonging to a later `updates` entry can still
    // occur earlier in the prose than one from an earlier entry.
    markers.sort((a, b) => a.snippetEnd - b.snippetEnd);

    // Apply from the end of the string backwards so an earlier insertion never
    // shifts the offset a later (in string order) one was computed against.
    // Two marks can share an offset when one covers the last words of a block,
    // so markers are grouped per offset and their `<sup>`s concatenate there.
    const buckets = new Map();
    for (const m of markers) {
      const isCorrection = m.kind === 'correction';
      // The marker is a plain in-page link to its entry in the #updates
      // block, and the native `title` is the whole hover affordance: no
      // custom bubble, no in-place drawer. The number alone says nothing, so
      // the tooltip names the kind and the date and then says what the mark
      // means in one phrase.
      const hint = `${revisionPrefix(m.kind, m.dateStr)} · there is a change here`;
      const sup =
        `<sup class="sz-revmark${isCorrection ? ' sz-revmark--correction' : ''}" id="revmark-${m.n}-${m.i}">` +
        `<a href="#update-${m.n}" title="${escapeAttr(hint)}" aria-label="${escapeAttr(hint)}">${m.n}</a></sup>`;
      buckets.set(m.snippetEnd, (buckets.get(m.snippetEnd) || '') + sup);
    }

    const offsets = [...buckets.keys()].sort((a, b) => b - a);
    let out = content;
    for (const offset of offsets) {
      out = out.slice(0, offset) + buckets.get(offset) + out.slice(offset);
    }
    return out;
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
