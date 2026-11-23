package main

import (
	"fmt"
	"os"
	"path/filepath"
	"testing"
)

// TestMain ensures the real theme palette (the single source of truth for
// both the web build and this TUI) loads cleanly before any test runs.
func TestMain(m *testing.M) {
	if err := loadThemes("../content/data/themes.json"); err != nil {
		fmt.Fprintln(os.Stderr, "loadThemes: ../content/data/themes.json:", err)
		os.Exit(1)
	}
	os.Exit(m.Run())
}

// TestLoadThemesRejectsMissingColor verifies a theme missing a required
// colour key fails loudly, naming the theme and the key, instead of
// silently loading a partial palette.
func TestLoadThemesRejectsMissingColor(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "themes.json")
	// "accent" is deliberately omitted from an otherwise complete palette.
	const broken = `{
		"default": "broken",
		"themes": [
			{
				"name": "broken",
				"label": "Broken",
				"colors": {
					"base": "#000000", "mantle": "#000000", "crust": "#000000",
					"surface0": "#000000", "surface1": "#000000", "surface2": "#000000",
					"overlay0": "#000000", "overlay1": "#000000",
					"text": "#ffffff", "subtext0": "#ffffff", "subtext1": "#ffffff",
					"blue": "#0000ff", "green": "#00ff00", "red": "#ff0000",
					"yellow": "#ffff00", "mauve": "#ff00ff", "pink": "#ff00ff",
					"peach": "#ffa500", "teal": "#008080", "lavender": "#e6e6fa",
					"flamingo": "#fc8eac", "sky": "#87ceeb", "maroon": "#800000"
				},
				"swatches": []
			}
		]
	}`
	if err := os.WriteFile(path, []byte(broken), 0o644); err != nil {
		t.Fatalf("write temp themes.json: %v", err)
	}

	err := loadThemes(path)
	if err == nil {
		t.Fatal("loadThemes: want error for theme missing \"accent\", got nil")
	}
	if !contains(err.Error(), "broken") || !contains(err.Error(), "accent") {
		t.Errorf("loadThemes error = %q, want it to name theme %q and key %q", err, "broken", "accent")
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (func() bool {
		for i := 0; i+len(sub) <= len(s); i++ {
			if s[i:i+len(sub)] == sub {
				return true
			}
		}
		return false
	})()
}
