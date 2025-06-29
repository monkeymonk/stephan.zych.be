const syntaxHighlight = require('@11ty/eleventy-plugin-syntaxhighlight');

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
