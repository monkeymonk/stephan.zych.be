package main

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"

	"github.com/charmbracelet/log"
	"gopkg.in/yaml.v3"
)

// Article is one piece of content (a page, project, or blog post), parsed from
// the same markdown files the web build consumes.
type Article struct {
	Slug        string
	Title       string
	Description string
	Date        string
	Tags        []string
	Series      string   // series slug (blog posts only); "" when not part of a series
	Order       int      // 1-based position within the series
	Updates     []Update // recorded evolutions of the article, file order (oldest first)
	Body        string   // markdown, HTML pre-stripped for terminal rendering
	Section     string   // "pages" | "projects" | "blog"
	Client      string   // project metadata-card facts (projects section only)
	Role        string
	Timeframe   string
	LiveURL     string
	Lang        string // "en" | "fr"; blog posts only — pages/projects are always "en"
}

// Update is one recorded evolution of a published article: a `revision` when
// the article was right when published and the subject moved, a `correction`
// when it was wrong. Authored oldest-first in front matter; renderers reverse
// it for display.
type Update struct {
	Date    string
	Kind    string // "revision" | "correction"; empty means revision
	Summary string
	Marks   []string // verbatim Markdown snippets copied from the article body; each gets a `[n]` marker inserted right after it
}

// blogVersions records a blog post's per-language versions, as found during
// LoadContent, so BlogVersion/BlogLangs can answer in O(1) instead of
// re-scanning the corpus.
type blogVersions struct {
	en, fr *Article
}

// Content is the whole loaded corpus, grouped by section.
type Content struct {
	Pages    map[string]Article // by slug (about, contact, whoami)
	Projects []Article
	BlogEN   []Article // English blog posts, newest first
	BlogFr   []Article // French blog posts, loaded from content/blog/fr, newest first

	blogIndex map[string]blogVersions // by slug, for BlogVersion/BlogLangs
	blogLists map[string][]Article    // by lang ("en"/"fr"), precomputed BlogList results
}

// BlogVersion returns the article for slug in the requested lang, if that
// translation exists.
func (c *Content) BlogVersion(slug, lang string) (Article, bool) {
	v, ok := c.blogIndex[slug]
	if !ok {
		return Article{}, false
	}
	if lang == "fr" {
		if v.fr == nil {
			return Article{}, false
		}
		return *v.fr, true
	}
	if v.en == nil {
		return Article{}, false
	}
	return *v.en, true
}

// BlogList returns one entry per slug, preferring lang and falling back to
// the other language when lang has no version, newest first. Precomputed by
// LoadContent; callers must not mutate the returned slice.
func (c *Content) BlogList(lang string) []Article {
	if lang != "fr" {
		lang = "en"
	}
	return c.blogLists[lang]
}

// BlogLangs reports which translations exist for slug.
func (c *Content) BlogLangs(slug string) (en, fr bool) {
	v, ok := c.blogIndex[slug]
	if !ok {
		return false, false
	}
	return v.en != nil, v.fr != nil
}

// widgetMarker brackets a native-widget placeholder left in article bodies; the
// reader splits on these to render TUI widgets between prose segments.
const (
	widgetPrefix = "\x00WIDGET:"
	widgetSuffix = "\x00"
)

var (
	reIframe     = regexp.MustCompile(`(?is)<iframe[^>]*\bsrc="([^"]+)"[^>]*>.*?</iframe>`)
	reVideo      = regexp.MustCompile(`(?is)<video[^>]*\bsrc="([^"]+)"[^>]*>.*?</video>`)
	reWidgetOpen = regexp.MustCompile(`(?is)<sz-(neofetch|gitlog|stats|wakapi|contact-card)\b[^>]*>`)
	// reSzTagPair matches a well-formed <sz-tag>text</sz-tag> span, so its
	// text content can be preserved (as backtick-wrapped inline code)
	// instead of being deleted by the generic reSzTag rule below — shared
	// between stripHTML (general markdown bodies) and resolveSzTag
	// (tui/cv.go's free-text CV fields, which bypass stripHTML entirely
	// since cvArticle assembles Article.Body directly rather than reading
	// it from a content/*.md file).
	reSzTagPair = regexp.MustCompile(`(?is)<sz-tag>(.*?)</sz-tag>`)
	// reStraySzTag matches a lone (unpaired) <sz-tag>/</sz-tag> marker left
	// after reSzTagPair has resolved every well-formed pair — used by
	// resolveSzTag to warn about malformed CV markup without crashing.
	reStraySzTag = regexp.MustCompile(`(?i)</?sz-tag\b[^>]*>`)
	reSzTag      = regexp.MustCompile(`(?is)<sz-[a-z-]+[^>]*>.*?</sz-[a-z-]+>|<sz-[a-z-]+[^>]*/?>`)
	reAnyTag     = regexp.MustCompile(`(?s)<[^>]+>`)
	reBlankRun   = regexp.MustCompile(`\n{3,}`)
	reDatePrefix = regexp.MustCompile(`^\d{4}-\d{2}-\d{2}-`)
)

// stripHTML turns embedded HTML (which Glamour can't render meaningfully) into
// terminal-friendly text: iframes become a video note, sz-* widgets are dropped,
// <sz-tag>text</sz-tag> spans (checked before the generic sz-* rule, which would
// otherwise delete them) become backtick-wrapped inline code, remaining tags
// are unwrapped but their text content is kept. Fenced code blocks are left
// verbatim — HTML-like tokens inside them (e.g. <br/> in a mermaid diagram)
// are content, not markup. All HTML in the markdown corpus is single-line,
// so the per-line stripping below is equivalent to the old whole-body pass
// for prose.
func stripHTML(body string) string {
	lines := strings.Split(body, "\n")
	inFence := false
	for i, ln := range lines {
		t := strings.TrimSpace(ln)
		if strings.HasPrefix(t, "```") || strings.HasPrefix(t, "~~~") {
			inFence = !inFence
			continue
		}
		if inFence {
			continue
		}
		s := ln
		s = reIframe.ReplaceAllString(s, "\n> ▶ video: $1\n")
		s = reVideo.ReplaceAllString(s, "\n> ▶ video: $1\n")
		s = reWidgetOpen.ReplaceAllString(s, "\n"+widgetPrefix+"$1"+widgetSuffix+"\n")
		s = reSzTagPair.ReplaceAllString(s, "`$1`")
		s = reSzTag.ReplaceAllString(s, "")
		s = reAnyTag.ReplaceAllString(s, "") // removes leftover </sz-…> closings and other tags
		lines[i] = s
	}
	body = reBlankRun.ReplaceAllString(strings.Join(lines, "\n"), "\n\n")
	return strings.TrimSpace(body)
}

// resolveSzTag replaces every well-formed "<sz-tag>text</sz-tag>" span in
// text with backtick-wrapped "`text`" so Glamour renders it distinctly —
// the TUI's mirror of the web build's <sz-tag> Lit component (which
// renders it as a styled chip, see cvGlamourStyle in glamour_theme.go for
// the matching Code-style treatment on the CV page). Used directly by
// tui/cv.go's free-text field construction (summary, job.summary,
// job.note, evidence.detail, community.detail), which bypasses stripHTML
// entirely since cvArticle assembles Article.Body directly. An unmatched
// <sz-tag>/</sz-tag> (no pair) is left as the raw literal text and logged
// rather than dropped or crashed on — the same never-take-the-server-down
// tolerance the rest of this parser applies to malformed input.
func resolveSzTag(text, path string) string {
	if !strings.Contains(text, "<sz-tag") && !strings.Contains(text, "</sz-tag") {
		return text
	}
	resolved := reSzTagPair.ReplaceAllString(text, "`$1`")
	if reStraySzTag.MatchString(resolved) {
		log.Warn("malformed CV <sz-tag> marker, leaving raw", "path", path, "text", text)
	}
	return resolved
}

// parseFrontmatter splits a `---`-delimited YAML header from the markdown body.
func parseFrontmatter(raw []byte) (map[string]any, string) {
	s := strings.ReplaceAll(string(raw), "\r\n", "\n")
	if !strings.HasPrefix(s, "---\n") {
		return map[string]any{}, s
	}
	rest := s[4:]
	end := strings.Index(rest, "\n---")
	if end < 0 {
		return map[string]any{}, s
	}
	meta := map[string]any{}
	_ = yaml.Unmarshal([]byte(rest[:end]), &meta)
	body := strings.TrimLeft(rest[end+4:], "\n")
	return meta, body
}

func metaString(m map[string]any, key string) string {
	if v, ok := m[key]; ok {
		switch t := v.(type) {
		case string:
			return t
		default:
			return strings.TrimSpace(yamlScalar(t))
		}
	}
	return ""
}

func yamlScalar(v any) string {
	out, _ := yaml.Marshal(v)
	return strings.TrimSpace(string(out))
}

// normalizeDate trims an ISO timestamp ("2026-03-19T00:00:00Z") down to its
// date part so listings read cleanly.
func normalizeDate(d string) string {
	if i := strings.IndexByte(d, 'T'); i == 10 {
		return d[:10]
	}
	return d
}

func metaInt(m map[string]any, key string) int {
	switch t := m[key].(type) {
	case int:
		return t
	case int64:
		return int(t)
	case float64:
		return int(t)
	case string:
		n, _ := strconv.Atoi(strings.TrimSpace(t))
		return n
	}
	return 0
}

func metaTags(m map[string]any) []string {
	v, ok := m["tags"]
	if !ok {
		return nil
	}
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	tags := make([]string, 0, len(list))
	for _, t := range list {
		if s, ok := t.(string); ok {
			tags = append(tags, s)
		}
	}
	return tags
}

// metaUpdates parses the `updates` front-matter list: each recorded revision
// or correction to a published article. An entry is a map with optional date/
// kind/summary keys; one missing its summary is dropped. File order (authored
// oldest-first) is preserved — callers reverse it for newest-first display.
func metaUpdates(m map[string]any) []Update {
	v, ok := m["updates"]
	if !ok {
		return nil
	}
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	updates := make([]Update, 0, len(list))
	for _, e := range list {
		entry, ok := e.(map[string]any)
		if !ok {
			continue
		}
		summary := metaString(entry, "summary")
		if summary == "" {
			continue
		}
		updates = append(updates, Update{
			Date:    normalizeDate(metaString(entry, "date")),
			Kind:    metaString(entry, "kind"),
			Summary: summary,
			Marks:   metaMarks(entry),
		})
	}
	return updates
}

// metaMarks parses an update entry's `marks` list: verbatim Markdown
// substrings copied from the article body, each of which gets a revision
// marker inserted after it. Same defensive shape as metaTags — non-string
// and empty entries are skipped, order preserved.
func metaMarks(entry map[string]any) []string {
	v, ok := entry["marks"]
	if !ok {
		return nil
	}
	list, ok := v.([]any)
	if !ok {
		return nil
	}
	marks := make([]string, 0, len(list))
	for _, mk := range list {
		if s, ok := mk.(string); ok && s != "" {
			marks = append(marks, s)
		}
	}
	return marks
}

func readArticle(path, section, lang string) (Article, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Article{}, err
	}
	meta, body := parseFrontmatter(raw)
	// Blog posts are filed as `YYYY-MM-DD-<slug>.md` so the corpus reads in
	// publication order; the date prefix is not part of the URL. Eleventy drops
	// it from `page.fileSlug` — strip it here so both renderers agree.
	slug := reDatePrefix.ReplaceAllString(strings.TrimSuffix(filepath.Base(path), ".md"), "")
	title := metaString(meta, "title")
	if title == "" {
		title = slug
	}
	return Article{
		Slug:        slug,
		Title:       title,
		Description: metaString(meta, "description"),
		Date:        normalizeDate(metaString(meta, "date")),
		Tags:        metaTags(meta),
		Series:      metaString(meta, "series"),
		Order:       metaInt(meta, "order"),
		Updates:     metaUpdates(meta),
		Body:        stripHTML(body),
		Section:     section,
		Client:      metaString(meta, "client"),
		Role:        metaString(meta, "role"),
		Timeframe:   metaString(meta, "timeframe"),
		LiveURL:     metaString(meta, "liveUrl"),
		Lang:        lang,
	}, nil
}

func loadSection(dir, section, lang string) ([]Article, error) {
	return loadSectionDir(filepath.Join(dir, section), section, lang)
}

// loadSectionDir reads every *.md file in srcDir, tagging each Article with
// section (the logical bucket, e.g. "blog") regardless of the actual source
// directory — this lets French posts under content/blog/fr still carry
// Section "blog" like their English counterparts.
func loadSectionDir(srcDir, section, lang string) ([]Article, error) {
	entries, err := os.ReadDir(srcDir)
	if err != nil {
		return nil, err
	}
	var out []Article
	for _, e := range entries {
		// "_"-prefixed files (_index.md) describe the folder, not an article.
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") || strings.HasPrefix(e.Name(), "_") {
			continue
		}
		a, err := readArticle(filepath.Join(srcDir, e.Name()), section, lang)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

// LoadContent reads the markdown corpus from contentDir (the same content/
// the website is built from).
func LoadContent(contentDir string) (*Content, error) {
	c := &Content{Pages: map[string]Article{}}

	pages, err := loadSection(contentDir, "pages", "en")
	if err != nil {
		return nil, err
	}
	for _, p := range pages {
		c.Pages[p.Slug] = p
	}

	if c.Projects, err = loadSection(contentDir, "projects", "en"); err != nil {
		return nil, err
	}

	if c.BlogEN, err = loadSection(contentDir, "blog", "en"); err != nil {
		return nil, err
	}

	// content/blog/fr holds French translations; missing the directory just
	// means no French posts exist yet, not an error.
	frDir := filepath.Join(contentDir, "blog", "fr")
	if _, statErr := os.Stat(frDir); statErr == nil {
		if c.BlogFr, err = loadSectionDir(frDir, "blog", "fr"); err != nil {
			return nil, err
		}
	}

	// Newest posts first.
	sort.Slice(c.BlogEN, func(i, j int) bool { return c.BlogEN[i].Date > c.BlogEN[j].Date })
	sort.Slice(c.BlogFr, func(i, j int) bool { return c.BlogFr[i].Date > c.BlogFr[j].Date })

	// Index both versions of each slug, so BlogVersion/BlogLangs answer in
	// O(1) instead of re-scanning the corpus on every call.
	c.blogIndex = make(map[string]blogVersions, len(c.BlogEN)+len(c.BlogFr))
	for i := range c.BlogEN {
		a := &c.BlogEN[i]
		v := c.blogIndex[a.Slug]
		v.en = a
		c.blogIndex[a.Slug] = v
	}
	for i := range c.BlogFr {
		a := &c.BlogFr[i]
		v := c.blogIndex[a.Slug]
		v.fr = a
		c.blogIndex[a.Slug] = v
	}

	// blogLists[lang] is one entry per slug, preferring lang and falling back
	// to the other language when lang has no version, newest first.
	buildList := func(primary, fallback []Article) []Article {
		out := make([]Article, 0, len(primary)+len(fallback))
		out = append(out, primary...)
		seen := make(map[string]bool, len(primary))
		for _, a := range primary {
			seen[a.Slug] = true
		}
		for _, a := range fallback {
			if !seen[a.Slug] {
				out = append(out, a)
			}
		}
		sort.Slice(out, func(i, j int) bool { return out[i].Date > out[j].Date })
		return out
	}
	c.blogLists = map[string][]Article{
		"en": buildList(c.BlogEN, c.BlogFr),
		"fr": buildList(c.BlogFr, c.BlogEN),
	}

	return c, nil
}
