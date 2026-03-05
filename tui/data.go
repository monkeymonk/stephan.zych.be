package main

import (
	"encoding/json"
	"os"
	"path/filepath"
)

type NavTab struct {
	Index int    `json:"index"`
	Name  string `json:"name"`
	Path  string `json:"path"`
	Icon  string `json:"icon"`
	Key   string `json:"key"`
}

type NavData struct {
	Tabs        []NavTab `json:"tabs"`
	SessionName string   `json:"sessionName"`
}

type TimelineEntry struct {
	Hash    string `json:"hash"`
	Ref     string `json:"ref"`
	Message string `json:"message"`
	Date    string `json:"date"`
}

type StatCounter struct {
	Value  int    `json:"value"`
	Suffix string `json:"suffix"`
	Label  string `json:"label"`
}

type Skill struct {
	Name  string `json:"name"`
	Level int    `json:"level"`
}

type ProfileData struct {
	Identity struct {
		User string     `json:"user"`
		Rows [][]string `json:"rows"`
	} `json:"identity"`
	Timeline []TimelineEntry `json:"timeline"`
	Stats    []StatCounter   `json:"stats"`
	Skills   []Skill         `json:"skills"`
}

type StartItem struct {
	ID     string `json:"id"`
	Label  string `json:"label"`
	Icon   string `json:"icon"`
	Action string `json:"action"`
	Target string `json:"target"`
	Desc   string `json:"desc"`
}

type StartScreenData struct {
	Wordmark []string    `json:"wordmark"`
	Taglines []string    `json:"taglines"`
	Items    []StartItem `json:"items"`
}

type Shortcut struct {
	Keys        string `json:"keys"`
	Description string `json:"description"`
}

type SiteMeta struct {
	Title       string `json:"title"`
	Description string `json:"description"`
	URL         string `json:"url"`
	Author      string `json:"author"`
	Email       string `json:"email"`
	RepoURL     string `json:"repoUrl"`
	CoffeeURL   string `json:"coffeeUrl"`
	Socials     struct {
		Github   string `json:"github"`
		Linkedin string `json:"linkedin"`
		Twitter  string `json:"twitter"`
	} `json:"socials"`
}

// SiteData is the centralized config shared with the web build (content/data/*.json).
type SiteData struct {
	Nav         NavData
	Profile     ProfileData
	StartScreen StartScreenData
	Shortcuts   []Shortcut
	Site        SiteMeta
	Wakapi      *WakapiStats
}

// LoadData reads the shared JSON config from dataDir. Missing files are
// tolerated (that section stays zero-valued) so the TUI still runs.
func LoadData(dataDir string) *SiteData {
	d := &SiteData{}
	readJSON(filepath.Join(dataDir, "nav.json"), &d.Nav)
	readJSON(filepath.Join(dataDir, "profile.json"), &d.Profile)
	readJSON(filepath.Join(dataDir, "startScreen.json"), &d.StartScreen)
	readJSON(filepath.Join(dataDir, "shortcuts.json"), &d.Shortcuts)
	readJSON(filepath.Join(dataDir, "site.json"), &d.Site)
	return d
}

func readJSON(path string, v any) {
	raw, err := os.ReadFile(path)
	if err != nil {
		return
	}
	_ = json.Unmarshal(raw, v)
}

// iconGlyph maps a data icon name to a nerdfont glyph for the palette.
func iconGlyph(name string) string {
	switch name {
	case "terminal":
		return "󰋜"
	case "folder":
		return "󰉋"
	case "file":
		return "󰈙"
	case "mail":
		return "󰇮"
	default:
		return "󰈙"
	}
}
