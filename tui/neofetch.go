package main

import (
	"html"
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

// neofetchCard renders the identity card, embedded in an article via
// widgets.go's "neofetch" case (e.g. content/pages/about.md carries the
// marker). A row whose value is a pipe-separated list — authored once in
// content/data/profile.json, e.g. the Role row's "Application & Web
// Architect | Technical Lead | ..." — cycles one item at a time, picked by
// m.rotateIndex and wrapping around, the same split web build's
// web/src/components/ui/sz-rotate.ts cycles on a row rendered that way.
// Any row can rotate, not just Role; a value with no "|" renders statically
// exactly as before.
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
		val := r[1]
		if items := splitRotateItems(val); len(items) > 1 {
			val = rotateItemAt(items, m.rotateIndex)
		}
		if r[0] == "Status" {
			info.WriteString(key + m.st.StatusOn.Render("● "+val) + "\n")
			continue
		}
		info.WriteString(key + m.st.Val.Render(val) + "\n")
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

// splitRotateItems splits a neofetch row's value on "|" into its rotating
// items, trimming surrounding whitespace and HTML-decoding any entities the
// author wrote (e.g. "&amp;" -> "&"), dropping empty items. A blank or empty
// value yields a nil slice; a value with no "|" at all yields that one item
// unchanged (len 1) — the TUI's mirror of the "|" split
// web/src/components/ui/sz-rotate.ts does over a row's own value, authored
// once in content/data/profile.json (e.g. the Role row's "Application & Web
// Architect | Technical Lead | ..."), not in article prose.
func splitRotateItems(value string) []string {
	var items []string
	for _, p := range strings.Split(value, "|") {
		p = strings.TrimSpace(html.UnescapeString(p))
		if p != "" {
			items = append(items, p)
		}
	}
	return items
}

// rotateItemAt returns items[index % len(items)], padded to the width of the
// widest item, so swapping items on a rotateMsg tick never changes the
// card's rendered width — len(items) is always >= 2 by the time
// neofetchCard calls this, since it only rotates a row whose value split
// into more than one item.
func rotateItemAt(items []string, index int) string {
	return padRotateItem(items[index%len(items)], items)
}

// padRotateItem right-pads item with spaces to the width of the widest entry
// in items, so swapping to a shorter/longer phrase on the next rotateMsg
// tick never shifts the card's border geometry.
func padRotateItem(item string, items []string) string {
	width := 0
	for _, it := range items {
		if w := lipgloss.Width(it); w > width {
			width = w
		}
	}
	if w := lipgloss.Width(item); w < width {
		item += strings.Repeat(" ", width-w)
	}
	return item
}

// identityHasRotatingRow reports whether any identity row's value is a
// pipe-separated list with more than one item — the same splitRotateItems
// split neofetchCard uses to pick the displayed item, reused by needsRotate
// (model.go) just to answer "is there anything to tick for" without
// rendering a row.
func identityHasRotatingRow(rows [][]string) bool {
	for _, r := range rows {
		if len(r) >= 2 && len(splitRotateItems(r[1])) > 1 {
			return true
		}
	}
	return false
}
