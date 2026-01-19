package main

import (
	"sort"
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// commandSpec documents one ex-style command for the help screen.
type commandSpec struct {
	usage string
	desc  string
}

var commandSpecs = []commandSpec{
	{":about / :contact / :whoami", "open a page"},
	{":projects / :blog", "open a section listing"},
	{":open <query>  (or just :<query>)", "find and open an article"},
	{":help  ·  :q / :quit", "this screen  ·  disconnect"},
}

var keySpecs = []commandSpec{
	{"j / k  ·  ↑ / ↓", "move"},
	{"g / G", "jump to top / bottom"},
	{"enter / l", "open"},
	{"esc / h / q", "back"},
	{":", "command mode"},
	{"/", "search all content"},
	{"?", "toggle this help"},
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

// refilter recomputes search results from the current query.
func (m *Model) refilter() {
	q := strings.ToLower(strings.TrimSpace(m.input.Value()))
	all := m.allArticles()
	if q == "" {
		m.filtered = all
	} else {
		m.filtered = m.filtered[:0]
		for _, a := range all {
			if articleMatches(a, q) {
				m.filtered = append(m.filtered, a)
			}
		}
	}
	if m.cursor >= len(m.filtered) {
		m.cursor = max(0, len(m.filtered)-1)
	}
}

func articleMatches(a Article, q string) bool {
	hay := strings.ToLower(a.Title + " " + a.Slug + " " + a.Section + " " + a.Description + " " + strings.Join(a.Tags, " "))
	return strings.Contains(hay, q)
}

// executeCommand runs an ex-style `:` command and returns any resulting Cmd.
func (m *Model) executeCommand(raw string) tea.Cmd {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}
	fields := strings.Fields(raw)
	name := strings.ToLower(fields[0])
	arg := strings.TrimSpace(strings.TrimPrefix(raw, fields[0]))

	switch name {
	case "q", "quit", "exit", "wq", "x":
		return tea.Quit
	case "home", "~":
		m.screen = screenHome
		m.cursor = 0
	case "projects":
		m.enterList("projects", "projects", m.content.Projects)
	case "blog":
		m.enterList("blog", "blog", m.content.Blog)
	case "help", "h":
		m.returnTo = m.screen
		m.screen = screenHelp
	case "about", "contact", "whoami", "styleguide":
		if a, ok := m.content.Pages[name]; ok {
			m.openReader(a, screenHome)
		} else {
			m.message = "E486: page not found: " + name
		}
	case "e", "edit", "open":
		if !m.openByQuery(arg) {
			m.message = "E486: nothing matches: " + arg
		}
	default:
		// bare `:<query>` → treat the whole thing as a find
		if !m.openByQuery(raw) {
			m.message = "E492: not a command: " + raw
		}
	}
	return nil
}

// openByQuery opens the first article matching the query (slug, then title).
func (m *Model) openByQuery(q string) bool {
	q = strings.ToLower(strings.TrimSpace(q))
	if q == "" {
		return false
	}
	all := m.allArticles()
	// exact slug first
	for _, a := range all {
		if strings.ToLower(a.Slug) == q {
			m.openReader(a, screenHome)
			return true
		}
	}
	// then fuzzy on title/slug/tags
	for _, a := range all {
		if articleMatches(a, q) {
			m.openReader(a, screenHome)
			return true
		}
	}
	return false
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
	b.WriteString("\n" + head.Render("Commands") + "\n\n")
	for _, c := range commandSpecs {
		b.WriteString("  " + key.Render(padRight(c.usage, 36)) + desc.Render(c.desc) + "\n")
	}
	b.WriteString("\n" + desc.Render("  Same content as ") +
		lipgloss.NewStyle().Foreground(lipgloss.Color(colBlue)).Render("https://stephan.zych.be") +
		desc.Render(" — just over SSH."))
	return b.String()
}
