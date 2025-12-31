package main

import (
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"

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
	Body        string // markdown, HTML pre-stripped for terminal rendering
	Section     string // "pages" | "projects" | "blog"
}

// Content is the whole loaded corpus, grouped by section.
type Content struct {
	Pages    map[string]Article // by slug (about, contact, whoami)
	Projects []Article
	Blog     []Article
}

var (
	reIframe   = regexp.MustCompile(`(?is)<iframe[^>]*\bsrc="([^"]+)"[^>]*>.*?</iframe>`)
	reSzTag    = regexp.MustCompile(`(?is)<sz-[a-z-]+[^>]*>.*?</sz-[a-z-]+>|<sz-[a-z-]+[^>]*/?>`)
	reAnyTag   = regexp.MustCompile(`(?s)<[^>]+>`)
	reBlankRun = regexp.MustCompile(`\n{3,}`)
)

// stripHTML turns embedded HTML (which Glamour can't render meaningfully) into
// terminal-friendly text: iframes become a video note, sz-* widgets are dropped,
// remaining tags are unwrapped but their text content is kept.
func stripHTML(body string) string {
	body = reIframe.ReplaceAllString(body, "\n> ▶ video: $1\n")
	body = reSzTag.ReplaceAllString(body, "")
	body = reAnyTag.ReplaceAllString(body, "")
	body = reBlankRun.ReplaceAllString(body, "\n\n")
	return strings.TrimSpace(body)
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

func readArticle(path, section string) (Article, error) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return Article{}, err
	}
	meta, body := parseFrontmatter(raw)
	slug := strings.TrimSuffix(filepath.Base(path), ".md")
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
		Body:        stripHTML(body),
		Section:     section,
	}, nil
}

func loadSection(dir, section string) ([]Article, error) {
	entries, err := os.ReadDir(filepath.Join(dir, section))
	if err != nil {
		return nil, err
	}
	var out []Article
	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".md") {
			continue
		}
		a, err := readArticle(filepath.Join(dir, section, e.Name()), section)
		if err != nil {
			return nil, err
		}
		out = append(out, a)
	}
	return out, nil
}

// LoadContent reads the markdown corpus from contentDir (the same src/content
// the website is built from).
func LoadContent(contentDir string) (*Content, error) {
	c := &Content{Pages: map[string]Article{}}

	pages, err := loadSection(contentDir, "pages")
	if err != nil {
		return nil, err
	}
	for _, p := range pages {
		c.Pages[p.Slug] = p
	}

	if c.Projects, err = loadSection(contentDir, "projects"); err != nil {
		return nil, err
	}
	if c.Blog, err = loadSection(contentDir, "blog"); err != nil {
		return nil, err
	}

	// Newest posts first.
	sort.Slice(c.Blog, func(i, j int) bool { return c.Blog[i].Date > c.Blog[j].Date })

	return c, nil
}
