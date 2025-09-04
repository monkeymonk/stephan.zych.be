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

  eleventyConfig.addPassthroughCopy('src/assets');
  eleventyConfig.addPassthroughCopy('src/styles');
  eleventyConfig.addPassthroughCopy({ 'src/CNAME': 'CNAME' });

  eleventyConfig.addFilter('dateDisplay', date => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric', month: 'long', day: 'numeric'
    });
  });

  eleventyConfig.addFilter('htmlDateString', date => {
    return new Date(date).toISOString().split('T')[0];
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
