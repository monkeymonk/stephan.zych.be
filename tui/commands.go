package main

import (
	"sort"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// commandSpec documents one entry for the help screen.
type commandSpec struct {
	usage string
	desc  string
}

var paletteSpecs = []commandSpec{
	{": home / projects / blog", "jump around"},
	{": about / contact / whoami", "open a page"},
	{": <anything>", "fuzzy-filter every page & post"},
	{": quit", "disconnect"},
}

// allArticles flattens every readable article for global search.
func (m Model) allArticles() []Article {
	out := make([]Article, 0, len(m.content.Projects)+len(m.content.Blog)+len(m.content.Pages))
	out = append(out, m.content.Projects...)
	out = append(out, m.content.Blog...)
	// pages in a stable order
	slugs := make([]string, 0, len(m.content.Pages))
	for s := range m.content.Pages {
		slugs = append(slugs, s)
	}
	sort.Strings(slugs)
	for _, s := range slugs {
		out = append(out, m.content.Pages[s])
	}
	return out
}

// renderHelp builds the help screen body.
func (m Model) renderHelp() string {
	head := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Mauve)).Bold(true)
	key := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Accent)).Bold(true)
	desc := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Subtext0))

	var b strings.Builder
	b.WriteString(head.Render("Keys") + "\n\n")
	// Straight off the keymap. The hand-written table that used to sit above
	// this said "esc / h / q → back" while `q` on the home screen
	// disconnected without asking. A row can now only describe the binding it
	// names, or vanish.
	for _, kb := range helpBindings() {
		h := kb.keys.Help()
		b.WriteString("  " + key.Render(padRight(h.Key, 22)) + desc.Render(h.Desc) + "\n")
	}
	b.WriteString("\n" + head.Render("Command palette  (:)") + "\n\n")
	for _, c := range paletteSpecs {
		b.WriteString("  " + key.Render(padRight(c.usage, 28)) + desc.Render(c.desc) + "\n")
	}
	b.WriteString("\n" + desc.Render("  Same content as ") +
		lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Blue)).Render("https://stephan.zych.be") +
		desc.Render(" — just over SSH."))
	return b.String()
}
