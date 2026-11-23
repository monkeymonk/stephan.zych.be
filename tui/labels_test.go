package main

import (
	"sort"
	"strings"
	"testing"
)

// en.md and fr.md are read by both renderers; a key present in one language
// only would fall back silently in the TUI and render English on a French page.
func TestLabelFilesShareKeys(t *testing.T) {
	labels := loadLabels("../content")
	keys := func(lang string) string {
		var out []string
		for k := range labels[lang] {
			out = append(out, k)
		}
		sort.Strings(out)
		return strings.Join(out, ",")
	}
	if len(labels["en"]) == 0 {
		t.Fatal("no English labels loaded from ../content/labels/en.md")
	}
	if keys("en") != keys("fr") {
		t.Errorf("label key sets differ:\n en: %s\n fr: %s", keys("en"), keys("fr"))
	}
}

func TestLabelFallbackAndPlaceholders(t *testing.T) {
	d := &SiteData{Labels: map[string]map[string]string{
		"en": {"part": "Part {n} of", "only_en": "English"},
		"fr": {"part": "Partie {n} de"},
	}}
	if got := d.label("fr", "part", "n", "2"); got != "Partie 2 de" {
		t.Errorf("fr part = %q", got)
	}
	if got := d.label("fr", "only_en"); got != "English" {
		t.Errorf("fr fallback to en = %q", got)
	}
	if got := d.label("fr", "missing"); got != "missing" {
		t.Errorf("unknown key = %q, want the key itself", got)
	}
}
