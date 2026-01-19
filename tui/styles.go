package main

import (
	"time"

	"github.com/charmbracelet/lipgloss"
)

// Catppuccin Mocha — same palette as the website theme.
const (
	colBase     = "#1e1e2e"
	colMantle   = "#181825"
	colCrust    = "#11111b"
	colText     = "#cdd6f4"
	colSubtext1 = "#bac2de"
	colSubtext0 = "#a6adc8"
	colOverlay1 = "#7f849c"
	colOverlay0 = "#6c7086"
	colSurface2 = "#585b70"
	colSurface1 = "#45475a"
	colSurface0 = "#313244"
	colBlue     = "#89b4fa"
	colLavender = "#b4befe"
	colSky      = "#89dceb"
	colTeal     = "#94e2d5"
	colGreen    = "#a6e3a1"
	colYellow   = "#f9e2af"
	colPeach    = "#fab387"
	colMaroon   = "#eba0ac"
	colRed      = "#f38ba8"
	colMauve    = "#cba6f7"
	colPink     = "#f5c2e7"

	colAccent = colBlue
)

// paletteColors mirrors the neofetch swatch row on the web about page.
var paletteColors = []string{colRed, colPeach, colYellow, colGreen, colTeal, colBlue, colMauve, colLavender}

var (
	// ── chrome ──────────────────────────────────────────────
	styleTitleBar = lipgloss.NewStyle().Foreground(lipgloss.Color(colAccent)).Bold(true)
	styleBrandDim = lipgloss.NewStyle().Foreground(lipgloss.Color(colOverlay0))

	styleBreadcrumb = lipgloss.NewStyle().Foreground(lipgloss.Color(colSubtext0))
	styleCrumbSep   = lipgloss.NewStyle().Foreground(lipgloss.Color(colSurface1))
	styleCrumbHere  = lipgloss.NewStyle().Foreground(lipgloss.Color(colMauve)).Bold(true)

	// ── menu (home) ─────────────────────────────────────────
	styleMenuCursor   = lipgloss.NewStyle().Foreground(lipgloss.Color(colAccent)).Bold(true)
	styleMenuLabelSel = lipgloss.NewStyle().Foreground(lipgloss.Color(colAccent)).Bold(true)
	styleMenuLabel    = lipgloss.NewStyle().Foreground(lipgloss.Color(colText))
	styleMenuDesc     = lipgloss.NewStyle().Foreground(lipgloss.Color(colOverlay0))

	// ── list ────────────────────────────────────────────────
	styleListSel   = lipgloss.NewStyle().Foreground(lipgloss.Color(colAccent)).Bold(true)
	styleListTitle = lipgloss.NewStyle().Foreground(lipgloss.Color(colText))
	styleListBar   = lipgloss.NewStyle().Foreground(lipgloss.Color(colAccent))
	styleDate      = lipgloss.NewStyle().Foreground(lipgloss.Color(colGreen))
	styleTag       = lipgloss.NewStyle().Foreground(lipgloss.Color(colLavender))
	styleDescDim   = lipgloss.NewStyle().Foreground(lipgloss.Color(colOverlay0)).Italic(true)

	// ── neofetch card ───────────────────────────────────────
	styleCard = lipgloss.NewStyle().
			Border(lipgloss.RoundedBorder()).
			BorderForeground(lipgloss.Color(colSurface1)).
			Padding(0, 2)
	styleCardCmd  = lipgloss.NewStyle().Foreground(lipgloss.Color(colSubtext0))
	styleCardCmdS = lipgloss.NewStyle().Foreground(lipgloss.Color(colGreen)).Bold(true)
	styleUser     = lipgloss.NewStyle().Foreground(lipgloss.Color(colGreen)).Bold(true)
	styleUserHost = lipgloss.NewStyle().Foreground(lipgloss.Color(colText))
	styleRule     = lipgloss.NewStyle().Foreground(lipgloss.Color(colSurface1))
	styleKey      = lipgloss.NewStyle().Foreground(lipgloss.Color(colAccent)).Bold(true)
	styleVal      = lipgloss.NewStyle().Foreground(lipgloss.Color(colSubtext0))
	styleStatusOn = lipgloss.NewStyle().Foreground(lipgloss.Color(colGreen))
	styleLogo     = lipgloss.NewStyle().Foreground(lipgloss.Color(colAccent)).Bold(true)

	// ── statusline (vim/tmux style) ─────────────────────────
	styleStMode = lipgloss.NewStyle().Foreground(lipgloss.Color(colCrust)).Background(lipgloss.Color(colAccent)).Bold(true).Padding(0, 1)
	styleStPath = lipgloss.NewStyle().Foreground(lipgloss.Color(colText)).Background(lipgloss.Color(colSurface1)).Padding(0, 1)
	styleStInfo = lipgloss.NewStyle().Foreground(lipgloss.Color(colSubtext0)).Background(lipgloss.Color(colSurface0)).Padding(0, 1)
	styleStTime = lipgloss.NewStyle().Foreground(lipgloss.Color(colCrust)).Background(lipgloss.Color(colMauve)).Bold(true).Padding(0, 1)
	styleStFill = lipgloss.NewStyle().Background(lipgloss.Color(colMantle))
	styleCmdErr = lipgloss.NewStyle().Foreground(lipgloss.Color(colRed)).Background(lipgloss.Color(colMantle)).Bold(true)

	// ── help / misc ─────────────────────────────────────────
	styleHelp    = lipgloss.NewStyle().Foreground(lipgloss.Color(colOverlay0))
	styleHelpKey = lipgloss.NewStyle().Foreground(lipgloss.Color(colSubtext0)).Bold(true)
	styleError   = lipgloss.NewStyle().Foreground(lipgloss.Color(colRed)).Bold(true)
)

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
