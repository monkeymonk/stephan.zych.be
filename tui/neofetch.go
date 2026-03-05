package main

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// SZ monogram, same spirit as the web sz-neofetch logo.
var szLogo = []string{
	"███████╗███████╗",
	"██╔════╝╚══███╔╝",
	"███████╗  ███╔╝ ",
	"╚════██║ ███╔╝  ",
	"███████║███████╗",
	"╚══════╝╚══════╝",
}

// neofetchCard renders the identity card shown on the home screen.
func (m Model) neofetchCard(maxWidth int) string {
	user := m.data.Profile.Identity.User
	rows := m.data.Profile.Identity.Rows

	// ── info column ──
	var info strings.Builder
	name, host, _ := strings.Cut(user, "@")
	info.WriteString(m.st.User.Render(name) + m.st.UserHost.Render("@"+host) + "\n")
	info.WriteString(m.st.Rule.Render(strings.Repeat("─", 28)) + "\n")
	for _, r := range rows {
		if len(r) < 2 {
			continue
		}
		key := m.st.Key.Render(padRight(r[0], 8))
		if r[0] == "Status" {
			info.WriteString(key + m.st.StatusOn.Render("● "+r[1]) + "\n")
			continue
		}
		info.WriteString(key + m.st.Val.Render(r[1]) + "\n")
	}
	info.WriteString("\n" + m.paletteSwatches())
	infoBlock := info.String()

	// ── logo column ──
	logo := m.st.Logo.Render(strings.Join(szLogo, "\n"))

	// Join side by side when wide enough, else stack the logo under the info.
	body := infoBlock
	if maxWidth >= 70 {
		body = lipgloss.JoinHorizontal(lipgloss.Top, infoBlock, "    ", logo)
	}

	header := m.st.CardCmdS.Render("❯ ") + m.st.CardCmd.Render("neofetch")
	card := lipgloss.JoinVertical(lipgloss.Left, header, "", body)

	// Let the border size to the content; only cap when the terminal is narrow.
	style := m.st.Card
	if maxWidth > 6 && lipgloss.Width(card)+6 > maxWidth {
		style = m.st.Card.MaxWidth(maxWidth)
	}
	return style.Render(card)
}

func (m Model) paletteSwatches() string {
	var b strings.Builder
	for _, c := range m.theme.Swatches {
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
