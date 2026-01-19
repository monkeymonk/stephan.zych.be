package main

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// Big SZ wordmark for the boot splash.
var splashLogo = []string{
	"███████╗███████╗",
	"╚══███╔╝╚══███╔╝",
	"  ███╔╝   ███╔╝ ",
	" ███╔╝   ███╔╝  ",
	"███████╗███████╗",
	"╚══════╝╚══════╝",
}

const splashTagline = "a portfolio you can ssh into"

// renderSplash draws the full-screen boot animation. splashFrame drives a
// light sweep across the logo, a typed-out tagline, and a blinking prompt.
func renderSplash(m Model) string {
	logoW := lipgloss.Width(splashLogo[0])
	sweep := m.splashFrame - 6 // start just left of the logo

	var logo strings.Builder
	for i, line := range splashLogo {
		col := 0
		for _, r := range line {
			st := styleSplashBase
			if r != ' ' {
				switch d := sweep - col; {
				case d == 0:
					st = styleSplashHot
				case d == 1 || d == -1:
					st = styleSplashGlow
				}
			}
			logo.WriteString(st.Render(string(r)))
			col++
		}
		if i < len(splashLogo)-1 {
			logo.WriteString("\n")
		}
	}

	// Domain + tagline appear once the sweep has crossed the logo.
	revealAt := logoW + 8
	domain := ""
	tag := ""
	if m.splashFrame > revealAt {
		domain = styleSplashDomain.Render("stephan.zych.be")
		n := m.splashFrame - revealAt
		if n > len(splashTagline) {
			n = len(splashTagline)
		}
		tag = styleSplashTag.Render(splashTagline[:n])
	}

	// Blinking enter prompt after everything is in.
	hint := " "
	if m.splashFrame > revealAt+len(splashTagline)+4 && (m.splashFrame/12)%2 == 0 {
		hint = styleSplashHint.Render("press any key to enter")
	}

	block := lipgloss.JoinVertical(lipgloss.Center,
		logo.String(), "", domain, tag, "", hint)

	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, block)
}
