package main

import (
	"time"

	"github.com/charmbracelet/lipgloss"
)

// Styles holds one lipgloss.Style (or lipgloss.Color) per named style.
// Construct with buildStyles; the zero value is not useful.
type Styles struct {
	// chrome
	TitleBar  lipgloss.Style
	BrandDim  lipgloss.Style
	Breadcrumb lipgloss.Style
	CrumbSep  lipgloss.Style
	CrumbHere lipgloss.Style
	// menu (home)
	MenuCursor   lipgloss.Style
	MenuLabelSel lipgloss.Style
	MenuLabel    lipgloss.Style
	MenuDesc     lipgloss.Style
	// list
	ListSel   lipgloss.Style
	ListTitle lipgloss.Style
	ListBar   lipgloss.Style
	Date      lipgloss.Style
	Tag       lipgloss.Style
	DescDim   lipgloss.Style
	// neofetch card
	Card      lipgloss.Style
	CardCmd   lipgloss.Style
	CardCmdS  lipgloss.Style
	User      lipgloss.Style
	UserHost  lipgloss.Style
	Rule      lipgloss.Style
	Key       lipgloss.Style
	Val       lipgloss.Style
	StatusOn  lipgloss.Style
	Logo      lipgloss.Style
	// statusline
	StInfo  lipgloss.Style
	StTime  lipgloss.Style
	StFill  lipgloss.Style
	CmdErr  lipgloss.Style
	// help / misc
	Help    lipgloss.Style
	HelpKey lipgloss.Style
	Error   lipgloss.Style
	// window frame
	FrameBorder lipgloss.Style
	FrameTitle  lipgloss.Style
	// home dashboard
	HomeWordmark lipgloss.Style
	HomeTagline  lipgloss.Style
	HomeKey      lipgloss.Style
	HomeLink     lipgloss.Style
	HomeLinkSel  lipgloss.Style
	// tab strip
	Tab       lipgloss.Style
	TabActive lipgloss.Style
	// splash
	SplashBase lipgloss.Style
	SplashHot  lipgloss.Style
	SplashGlow lipgloss.Style
	// command palette
	PalBox     lipgloss.Style
	PalTitle   lipgloss.Style
	PalPrompt  lipgloss.Style
	PalItem    lipgloss.Style
	PalItemSel lipgloss.Style
	PalIcon    lipgloss.Style
	PalIconSel lipgloss.Style
	PalSection lipgloss.Style
	PalHint    lipgloss.Style
	Backdrop   lipgloss.Color
}

// buildStyles constructs a Styles from the given Theme. buildStyles(catppuccinMocha)
// produces styles identical to the global styleX vars.
func buildStyles(t Theme) Styles {
	return Styles{
		// chrome
		TitleBar:  lipgloss.NewStyle().Foreground(lipgloss.Color(t.Accent)).Bold(true),
		BrandDim:  lipgloss.NewStyle().Foreground(lipgloss.Color(t.Overlay0)),
		Breadcrumb: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Subtext0)),
		CrumbSep:  lipgloss.NewStyle().Foreground(lipgloss.Color(t.Surface1)),
		CrumbHere: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Mauve)).Bold(true),
		// menu (home)
		MenuCursor:   lipgloss.NewStyle().Foreground(lipgloss.Color(t.Accent)).Bold(true),
		MenuLabelSel: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Accent)).Bold(true),
		MenuLabel:    lipgloss.NewStyle().Foreground(lipgloss.Color(t.Text)),
		MenuDesc:     lipgloss.NewStyle().Foreground(lipgloss.Color(t.Overlay0)),
		// list
		ListSel:   lipgloss.NewStyle().Foreground(lipgloss.Color(t.Accent)).Bold(true),
		ListTitle: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Text)),
		ListBar:   lipgloss.NewStyle().Foreground(lipgloss.Color(t.Accent)),
		Date:      lipgloss.NewStyle().Foreground(lipgloss.Color(t.Green)),
		Tag:       lipgloss.NewStyle().Foreground(lipgloss.Color(t.Lavender)),
		DescDim:   lipgloss.NewStyle().Foreground(lipgloss.Color(t.Overlay0)).Italic(true),
		// neofetch card
		Card: lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color(t.Surface1)).
			Padding(0, 2),
		CardCmd:  lipgloss.NewStyle().Foreground(lipgloss.Color(t.Subtext0)),
		CardCmdS: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Green)).Bold(true),
		User:     lipgloss.NewStyle().Foreground(lipgloss.Color(t.Green)).Bold(true),
		UserHost: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Text)),
		Rule:     lipgloss.NewStyle().Foreground(lipgloss.Color(t.Surface1)),
		Key:      lipgloss.NewStyle().Foreground(lipgloss.Color(t.Accent)).Bold(true),
		Val:      lipgloss.NewStyle().Foreground(lipgloss.Color(t.Subtext0)),
		StatusOn: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Green)),
		Logo:     lipgloss.NewStyle().Foreground(lipgloss.Color(t.Accent)).Bold(true),
		// statusline
		StInfo: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Subtext0)).Background(lipgloss.Color(t.Surface0)).Padding(0, 1),
		StTime: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Crust)).Background(lipgloss.Color(t.Mauve)).Bold(true).Padding(0, 1),
		StFill: lipgloss.NewStyle().Background(lipgloss.Color(t.Mantle)),
		CmdErr: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Red)).Background(lipgloss.Color(t.Mantle)).Bold(true),
		// help / misc
		Help:    lipgloss.NewStyle().Foreground(lipgloss.Color(t.Overlay0)),
		HelpKey: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Subtext0)).Bold(true),
		Error:   lipgloss.NewStyle().Foreground(lipgloss.Color(t.Red)).Bold(true),
		// window frame
		FrameBorder: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Surface1)),
		FrameTitle:  lipgloss.NewStyle().Foreground(lipgloss.Color(t.Accent)).Bold(true),
		// home dashboard
		HomeWordmark: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Blue)).Bold(true),
		HomeTagline:  lipgloss.NewStyle().Foreground(lipgloss.Color(t.Subtext0)).Italic(true),
		HomeKey:      lipgloss.NewStyle().Foreground(lipgloss.Color(t.Accent)).Bold(true),
		HomeLink:     lipgloss.NewStyle().Foreground(lipgloss.Color(t.Text)),
		HomeLinkSel:  lipgloss.NewStyle().Foreground(lipgloss.Color(t.Accent)).Bold(true),
		// tab strip
		Tab:       lipgloss.NewStyle().Foreground(lipgloss.Color(t.Subtext0)).Background(lipgloss.Color(t.Surface0)).Padding(0, 1),
		TabActive: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Crust)).Background(lipgloss.Color(t.Accent)).Bold(true).Padding(0, 1),
		// splash
		SplashBase: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Blue)).Bold(true),
		SplashHot:  lipgloss.NewStyle().Foreground(lipgloss.Color("#ffffff")).Bold(true),
		SplashGlow: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Lavender)).Bold(true),
		// command palette
		PalBox:     lipgloss.NewStyle().Border(lipgloss.RoundedBorder()).BorderForeground(lipgloss.Color(t.Accent)).Padding(0, 1),
		PalTitle:   lipgloss.NewStyle().Foreground(lipgloss.Color(t.Mauve)).Bold(true),
		PalPrompt:  lipgloss.NewStyle().Foreground(lipgloss.Color(t.Green)).Bold(true),
		PalItem:    lipgloss.NewStyle().Foreground(lipgloss.Color(t.Text)),
		PalItemSel: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Crust)).Background(lipgloss.Color(t.Accent)).Bold(true),
		PalIcon:    lipgloss.NewStyle().Foreground(lipgloss.Color(t.Blue)),
		PalIconSel: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Crust)).Background(lipgloss.Color(t.Accent)),
		PalSection: lipgloss.NewStyle().Foreground(lipgloss.Color(t.Overlay0)),
		PalHint:    lipgloss.NewStyle().Foreground(lipgloss.Color(t.Overlay0)),
		Backdrop:   lipgloss.Color(t.Surface0),
	}
}

// brusselsTZ is resolved once; falls back to local time when tzdata is absent.
var brusselsTZ = func() *time.Location {
	if loc, err := time.LoadLocation("Europe/Brussels"); err == nil {
		return loc
	}
	return time.Local
}()

func clockString(t time.Time) string {
	return t.In(brusselsTZ).Format("15:04")
}
