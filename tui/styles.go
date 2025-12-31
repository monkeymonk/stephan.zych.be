package main

import "github.com/charmbracelet/lipgloss"

// Catppuccin Mocha — same palette as the website theme.
const (
	colBase     = "#1e1e2e"
	colText     = "#cdd6f4"
	colSubtext  = "#a6adc8"
	colOverlay  = "#6c7086"
	colSurface1 = "#45475a"
	colAccent   = "#89b4fa" // blue
	colGreen    = "#a6e3a1"
	colMauve    = "#cba6f7"
	colPeach    = "#fab387"
)

var (
	styleTitleBar = lipgloss.NewStyle().
			Foreground(lipgloss.Color(colAccent)).
			Bold(true)

	styleBrandDim = lipgloss.NewStyle().
			Foreground(lipgloss.Color(colOverlay))

	styleBreadcrumb = lipgloss.NewStyle().
			Foreground(lipgloss.Color(colSubtext))

	styleCrumbSep = lipgloss.NewStyle().
			Foreground(lipgloss.Color(colSurface1))

	styleItem = lipgloss.NewStyle().
			Foreground(lipgloss.Color(colText)).
			PaddingLeft(2)

	styleItemSelected = lipgloss.NewStyle().
				Foreground(lipgloss.Color(colAccent)).
				Bold(true).
				PaddingLeft(0)

	styleItemDesc = lipgloss.NewStyle().
			Foreground(lipgloss.Color(colOverlay)).
			PaddingLeft(4)

	styleSection = lipgloss.NewStyle().
			Foreground(lipgloss.Color(colMauve)).
			Bold(true)

	styleTag = lipgloss.NewStyle().
			Foreground(lipgloss.Color(colPeach))

	styleDate = lipgloss.NewStyle().
			Foreground(lipgloss.Color(colGreen))

	styleHelp = lipgloss.NewStyle().
			Foreground(lipgloss.Color(colOverlay))

	styleHelpKey = lipgloss.NewStyle().
			Foreground(lipgloss.Color(colSubtext)).
			Bold(true)

	styleError = lipgloss.NewStyle().
			Foreground(lipgloss.Color("#f38ba8")).
			Bold(true)
)
