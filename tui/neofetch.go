package main

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// SZ monogram, same spirit as the web sz-neofetch logo.
var szLogo = []string{
	"███████╗███████╗",
	"╚══███╔╝╚══███╔╝",
	"  ███╔╝   ███╔╝ ",
	" ███╔╝   ███╔╝  ",
	"███████╗███████╗",
	"╚══════╝╚══════╝",
}

var fetchUser = "stephan@zych.be"

var fetchRows = [][2]string{
	{"OS", "Brussels, Belgium"},
	{"Role", "Lead Dev · Frontend Architect"},
	{"Uptime", "15 years"},
	{"Shell", "zsh · tmux · neovim"},
	{"Editor", "neovim (btw)"},
	{"Stack", "TS · React · Laravel · Docker"},
	{"Shipped", "200+ platforms · 1 exit"},
	{"Status", "available to talk"},
}

// neofetchCard renders the identity card shown on the home screen.
func neofetchCard(maxWidth int) string {
	// ── info column ──
	var info strings.Builder
	name, host, _ := strings.Cut(fetchUser, "@")
	info.WriteString(styleUser.Render(name) + styleUserHost.Render("@"+host) + "\n")
	info.WriteString(styleRule.Render(strings.Repeat("─", 28)) + "\n")
	for _, r := range fetchRows {
		key := styleKey.Render(padRight(r[0], 8))
		if r[0] == "Status" {
			info.WriteString(key + styleStatusOn.Render("● "+r[1]) + "\n")
			continue
		}
		info.WriteString(key + styleVal.Render(r[1]) + "\n")
	}
	info.WriteString("\n" + paletteSwatches())
	infoBlock := info.String()

	// ── logo column ──
	logo := styleLogo.Render(strings.Join(szLogo, "\n"))

	// Join side by side when wide enough, else stack the logo under the info.
	body := infoBlock
	if maxWidth >= 70 {
		body = lipgloss.JoinHorizontal(lipgloss.Top, infoBlock, "    ", logo)
	}

	header := styleCardCmdS.Render("❯ ") + styleCardCmd.Render("neofetch")
	card := lipgloss.JoinVertical(lipgloss.Left, header, "", body)

	// Let the border size to the content; only cap when the terminal is narrow.
	style := styleCard
	if maxWidth > 6 && lipgloss.Width(card)+6 > maxWidth {
		style = styleCard.MaxWidth(maxWidth)
	}
	return style.Render(card)
}

func paletteSwatches() string {
	var b strings.Builder
	for _, c := range paletteColors {
		b.WriteString(lipgloss.NewStyle().Background(lipgloss.Color(c)).Render("  "))
	}
	return b.String()
}

func padRight(s string, n int) string {
	if len(s) >= n {
		return s
	}
	return s + strings.Repeat(" ", n-len(s))
}
