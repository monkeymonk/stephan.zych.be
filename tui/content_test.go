package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

// bilingualCorpus writes a blog with one post in both languages, one
// English-only and one French-only, plus the fr.json directory data the TUI
// must ignore.
func bilingualCorpus(t *testing.T) *Content {
	t.Helper()
	dir := t.TempDir()
	files := map[string]string{
		"blog/2026-01-01-both.md":       "---\ntitle: \"Both EN\"\ndate: 2026-01-01\n---\nEnglish body.\n",
		"blog/2026-01-02-en-only.md":    "---\ntitle: \"EN only\"\ndate: 2026-01-02\n---\nEnglish only.\n",
		"blog/fr/2026-01-01-both.md":    "---\ntitle: \"Both FR\"\ndate: 2026-01-01\n---\nCorps français.\n",
		"blog/fr/2026-01-03-fr-only.md": "---\ntitle: \"FR only\"\ndate: 2026-01-03\n---\nSeulement en français.\n",
		"blog/fr/fr.json":               "{\"lang\": \"fr\"}\n",
	}
	for _, d := range []string{"pages", "projects", "blog/fr"} {
		if err := os.MkdirAll(filepath.Join(dir, d), 0o755); err != nil {
			t.Fatal(err)
		}
	}
	for name, body := range files {
		if err := os.WriteFile(filepath.Join(dir, name), []byte(body), 0o644); err != nil {
			t.Fatal(err)
		}
	}
	c, err := LoadContent(dir)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func listed(items []Article) string {
	var out []string
	for _, a := range items {
		out = append(out, a.Slug+":"+a.Lang)
	}
	return strings.Join(out, ",")
}

func TestBlogListsOneEntryPerSlugPreferringTheLanguage(t *testing.T) {
	c := bilingualCorpus(t)
	if got, want := listed(c.BlogList("en")), "fr-only:fr,en-only:en,both:en"; got != want {
		t.Errorf("BlogList(en) = %s, want %s", got, want)
	}
	if got, want := listed(c.BlogList("fr")), "fr-only:fr,en-only:en,both:fr"; got != want {
		t.Errorf("BlogList(fr) = %s, want %s", got, want)
	}
}

func TestBlogLangsAndVersions(t *testing.T) {
	c := bilingualCorpus(t)
	for slug, want := range map[string][2]bool{
		"both": {true, true}, "en-only": {true, false}, "fr-only": {false, true},
	} {
		en, fr := c.BlogLangs(slug)
		if en != want[0] || fr != want[1] {
			t.Errorf("BlogLangs(%s) = %v,%v, want %v", slug, en, fr, want)
		}
	}
	if _, ok := c.BlogVersion("fr-only", "en"); ok {
		t.Error("BlogVersion(fr-only, en) found an English version that does not exist")
	}
	if a, ok := c.BlogVersion("both", "fr"); !ok || a.Title != "Both FR" {
		t.Errorf("BlogVersion(both, fr) = %q,%v", a.Title, ok)
	}
	if a, _ := c.BlogVersion("fr-only", "fr"); articlePath(a) != "/fr/blog/fr-only/" {
		t.Errorf("articlePath(fr-only) = %s", articlePath(a))
	}
	if a, _ := c.BlogVersion("both", "en"); articlePath(a) != "/blog/both/" {
		t.Errorf("articlePath(both en) = %s", articlePath(a))
	}
}

func TestReaderLanguageSwitch(t *testing.T) {
	c := bilingualCorpus(t)
	m := NewModel(c, &SiteData{Labels: loadLabels("../content")}, nil, 100, 40)

	if l := m.classifyLink("FR", "/fr/blog/both/"); !l.internal || l.kind != "article" || l.lang != "fr" {
		t.Fatalf("classifyLink(/fr/blog/both/) = %+v", l)
	}

	en, _ := c.BlogVersion("both", "en")
	m.openReader(en)
	if !strings.Contains(m.readerArticle.Body, "[FR](/fr/blog/both/)") {
		t.Errorf("English reader lacks the FR switcher link:\n%s", m.readerArticle.Body)
	}
	next, _ := m.Update(tea.KeyMsg{Type: tea.KeyRunes, Runes: []rune("L")})
	m = next.(Model)
	if m.readerArticle.Lang != "fr" || m.readerArticle.Title != "Both FR" {
		t.Fatalf("after L, reader shows %q (%s), want the French version", m.readerArticle.Title, m.readerArticle.Lang)
	}

	only, _ := c.BlogVersion("en-only", "en")
	m.openReader(only)
	if !strings.Contains(m.readerArticle.Body, "FR (not translated)") {
		t.Errorf("English-only reader does not say FR is missing:\n%s", m.readerArticle.Body)
	}
	if _, ok := m.otherBlogVersion(); ok {
		t.Error("L would switch an English-only post")
	}
}
