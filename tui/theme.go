package main

import (
	"encoding/json"
	"fmt"
	"os"
)

// Theme is a full colour palette. Switching themes rebuilds a session's Styles.
type Theme struct {
	Label                                     string
	Base, Mantle, Crust                       string
	Text, Subtext1, Subtext0                  string
	Overlay1, Overlay0                        string
	Surface2, Surface1, Surface0              string
	Blue, Lavender, Sky, Teal, Green, Yellow  string
	Peach, Maroon, Red, Mauve, Pink, Flamingo string
	Accent                                    string
	Swatches                                  []string // neofetch/bar swatch row
}

// themesFile mirrors the content/data/themes.json schema. Only the fields the
// TUI needs are decoded; "roles" and "notes" are the web build's concern.
type themesFile struct {
	Default string           `json:"default"`
	Themes  []themeFileEntry `json:"themes"`
}

type themeFileEntry struct {
	Name     string            `json:"name"`
	Label    string            `json:"label"`
	Colors   map[string]string `json:"colors"`
	Swatches []string          `json:"swatches"`
}

// themeColorKeys maps the JSON "colors" key to the Theme field it fills.
// Keys absent here (muted, subtext, overlay2, rosewater, sapphire) are
// web-only and ignored by the TUI.
var themeColorKeys = map[string]func(t *Theme, v string){
	"base":     func(t *Theme, v string) { t.Base = v },
	"mantle":   func(t *Theme, v string) { t.Mantle = v },
	"crust":    func(t *Theme, v string) { t.Crust = v },
	"surface0": func(t *Theme, v string) { t.Surface0 = v },
	"surface1": func(t *Theme, v string) { t.Surface1 = v },
	"surface2": func(t *Theme, v string) { t.Surface2 = v },
	"overlay0": func(t *Theme, v string) { t.Overlay0 = v },
	"overlay1": func(t *Theme, v string) { t.Overlay1 = v },
	"text":     func(t *Theme, v string) { t.Text = v },
	"subtext0": func(t *Theme, v string) { t.Subtext0 = v },
	"subtext1": func(t *Theme, v string) { t.Subtext1 = v },
	"accent":   func(t *Theme, v string) { t.Accent = v },
	"blue":     func(t *Theme, v string) { t.Blue = v },
	"green":    func(t *Theme, v string) { t.Green = v },
	"red":      func(t *Theme, v string) { t.Red = v },
	"yellow":   func(t *Theme, v string) { t.Yellow = v },
	"mauve":    func(t *Theme, v string) { t.Mauve = v },
	"pink":     func(t *Theme, v string) { t.Pink = v },
	"peach":    func(t *Theme, v string) { t.Peach = v },
	"teal":     func(t *Theme, v string) { t.Teal = v },
	"lavender": func(t *Theme, v string) { t.Lavender = v },
	"flamingo": func(t *Theme, v string) { t.Flamingo = v },
	"sky":      func(t *Theme, v string) { t.Sky = v },
	"maroon":   func(t *Theme, v string) { t.Maroon = v },
}

// themes holds every colour theme, keyed by its JSON "name". themeOrder
// preserves the JSON array order for the :colorscheme cycle. defaultTheme is
// the JSON "default" field. All three are populated once by loadThemes at
// startup; there is no hard-coded fallback by design — content is the source.
var (
	themes       map[string]Theme
	themeOrder   []string
	defaultTheme string
)

// loadThemes decodes path (content/data/themes.json) into the package-level
// themes, themeOrder and defaultTheme vars. It fails on any missing required
// colour key or a default theme that doesn't exist, since there is no
// hard-coded fallback palette to fall back to.
func loadThemes(path string) error {
	raw, err := os.ReadFile(path)
	if err != nil {
		return fmt.Errorf("loadThemes: read %s: %w", path, err)
	}
	var tf themesFile
	if err := json.Unmarshal(raw, &tf); err != nil {
		return fmt.Errorf("loadThemes: parse %s: %w", path, err)
	}
	if len(tf.Themes) == 0 {
		return fmt.Errorf("loadThemes: %s defines no themes", path)
	}

	newThemes := make(map[string]Theme, len(tf.Themes))
	newOrder := make([]string, 0, len(tf.Themes))
	for _, entry := range tf.Themes {
		if entry.Name == "" {
			return fmt.Errorf("loadThemes: %s has a theme with no name", path)
		}
		t := Theme{Label: entry.Label, Swatches: entry.Swatches}
		for key, assign := range themeColorKeys {
			v, ok := entry.Colors[key]
			if !ok || v == "" {
				return fmt.Errorf("loadThemes: theme %q is missing colour %q", entry.Name, key)
			}
			assign(&t, v)
		}
		newThemes[entry.Name] = t
		newOrder = append(newOrder, entry.Name)
	}

	if tf.Default == "" {
		return fmt.Errorf("loadThemes: %s has no default theme", path)
	}
	if _, ok := newThemes[tf.Default]; !ok {
		return fmt.Errorf("loadThemes: default theme %q is not defined in %s", tf.Default, path)
	}

	themes = newThemes
	themeOrder = newOrder
	defaultTheme = tf.Default
	return nil
}
