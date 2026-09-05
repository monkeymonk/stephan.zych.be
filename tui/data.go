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
	AnalyticsID string `json:"analyticsId"` // Umami website id, shared with the web build
	Socials     struct {
		Github   string `json:"github"`
		Linkedin string `json:"linkedin"`
		Twitter  string `json:"twitter"`
	} `json:"socials"`
}

// SeriesMeta is one entry of seriesData.json (display name + blurb), keyed by
// series slug. Shared with the web build's series-nav.
type SeriesMeta struct {
	Name        string `json:"name"`
	Description string `json:"description"`
}

// CVGroup is a labelled sub-list of bullet items within a CV experience entry
// (e.g. "Key achievements", "Responsibilities & impact").
type CVGroup struct {
	Label string   `json:"label"`
	Items []string `json:"items"`
}

// CVExperience is one role in the CV's experience timeline.
type CVExperience struct {
	Role       string    `json:"role"`
	Company    string    `json:"company"`
	Via        string    `json:"via"`
	Location   string    `json:"location"`
	Period     string    `json:"period"`
	Summary    string    `json:"summary"`
	Highlights []string  `json:"highlights"`
	Groups     []CVGroup `json:"groups"`
	Clients    []string  `json:"clients"`
	Note       string    `json:"note"`
}

// CVEarlier is one earlier (pre-experience) role, listed without a summary.
type CVEarlier struct {
	Role    string `json:"role"`
	Company string `json:"company"`
	Period  string `json:"period"`
}

// CVSkillGroup is a labelled skill category (e.g. "Frontend") with its items.
type CVSkillGroup struct {
	Label string   `json:"label"`
	Items []string `json:"items"`
}

// CVEvidence is one architecture/engineering evidence entry; Link is a bare
// host+path with no scheme.
type CVEvidence struct {
	Label  string `json:"label"`
	Detail string `json:"detail"`
	Link   string `json:"link"`
}

// CVCommunity is a talk/membership entry.
type CVCommunity struct {
	Label  string `json:"label"`
	Detail string `json:"detail"`
}

// CVEducation is one school/training entry.
type CVEducation struct {
	School string `json:"school"`
	Detail string `json:"detail"`
}

// CVLanguage is a spoken language and its proficiency level.
type CVLanguage struct {
	Name  string `json:"name"`
	Level string `json:"level"`
	Note  string `json:"note"`
}

// CVData mirrors cv.json — the CV reader page's structured source, shared
// with the web build.
type CVData struct {
	Basics struct {
		Name     string `json:"name"`
		Tagline  string `json:"tagline"`
		Location string `json:"location"`
		Email    string `json:"email"`
		Website  string `json:"website"`
		Linkedin string `json:"linkedin"`
		Github   string `json:"github"`
		Photo    string `json:"photo"`
		Pdf      string `json:"pdf"`
	} `json:"basics"`
	Summary    []string       `json:"summary"`
	Expertise  []CVSkillGroup `json:"expertise"`
	Experience []CVExperience `json:"experience"`
	Evidence   []CVEvidence   `json:"evidence"`
	Earlier    []CVEarlier    `json:"earlier"`
	Skills     []CVSkillGroup `json:"skills"`
	Interests  []string       `json:"interests"`
	Community  []CVCommunity  `json:"community"`
	Education  []CVEducation  `json:"education"`
	Languages  []CVLanguage   `json:"languages"`
}

// SiteData is the centralized config shared with the web build (content/data/*.json).
type SiteData struct {
	Nav         NavData
	Profile     ProfileData
	StartScreen StartScreenData
	Shortcuts   []Shortcut
	Site        SiteMeta
	Series      map[string]SeriesMeta
	CV          CVData
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
	readJSON(filepath.Join(dataDir, "seriesData.json"), &d.Series)
	readJSON(filepath.Join(dataDir, "cv.json"), &d.CV)
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
