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

var keySpecs = []commandSpec{
	{"j / k  ·  ↑ / ↓", "move"},
	{"g / G", "jump to top / bottom"},
	{"enter / l", "open"},
	{"esc / h / q", "back"},
	{":", "command palette"},
	{"/", "search all content"},
	{"tab", "autocomplete the selection"},
	{"?", "toggle this help"},
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
func renderHelp() string {
	head := lipgloss.NewStyle().Foreground(lipgloss.Color(colMauve)).Bold(true)
	key := lipgloss.NewStyle().Foreground(lipgloss.Color(colAccent)).Bold(true)
	desc := lipgloss.NewStyle().Foreground(lipgloss.Color(colSubtext0))

	var b strings.Builder
	b.WriteString(head.Render("Keys") + "\n\n")
	for _, k := range keySpecs {
		b.WriteString("  " + key.Render(padRight(k.usage, 22)) + desc.Render(k.desc) + "\n")
	}
	b.WriteString("\n" + head.Render("Command palette  (:)") + "\n\n")
	for _, c := range paletteSpecs {
		b.WriteString("  " + key.Render(padRight(c.usage, 28)) + desc.Render(c.desc) + "\n")
	}
	b.WriteString("\n" + desc.Render("  Same content as ") +
		lipgloss.NewStyle().Foreground(lipgloss.Color(colBlue)).Render("https://stephan.zych.be") +
		desc.Render(" — just over SSH."))
	return b.String()
}
