package main

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/lipgloss"
)

type screen int

const (
	screenHome screen = iota
	screenList
	screenReader
)

const maxContentWidth = 90

// menuItem is a row on the home screen.
type menuItem struct {
	label string
	desc  string
	kind  string // "page:<slug>" | "list:projects" | "list:blog" | "quit"
}

var homeMenu = []menuItem{
	{"~/about", "who I am, the short version", "page:about"},
	{"~/projects", "selected work and case studies", "list:projects"},
	{"~/blog", "writing, notes, experiments", "list:blog"},
	{"~/contact", "how to reach me", "page:contact"},
	{"~/whoami", "the one-liner", "page:whoami"},
	{"exit", "close the connection", "quit"},
}

// Model is the root Bubble Tea model.
type Model struct {
	content *Content
	loadErr error

	width, height int
	screen        screen
	prev          screen // where Esc returns to from the reader

	cursor    int       // home + list selection
	listKind  string    // "projects" | "blog"
	listTitle string    // breadcrumb label
	listItems []Article // current list contents

	reader      viewport.Model
	readerTitle string
	ready       bool
}

// NewModel builds the initial model from already-loaded content.
func NewModel(content *Content, loadErr error, width, height int) Model {
	m := Model{content: content, loadErr: loadErr, width: width, height: height, screen: screenHome}
	if width > 0 && height > 0 {
		m.resize(width, height)
	}
	return m
}

func (m Model) Init() tea.Cmd { return nil }

// --- layout ---------------------------------------------------------------

func (m *Model) contentWidth() int {
	w := m.width - 4
	if w > maxContentWidth {
		w = maxContentWidth
	}
	if w < 20 {
		w = 20
	}
	return w
}

func (m *Model) resize(w, h int) {
	m.width, m.height = w, h
	vpHeight := h - 4 // title + breadcrumb + footer
	if vpHeight < 3 {
		vpHeight = 3
	}
	if !m.ready {
		m.reader = viewport.New(m.contentWidth(), vpHeight)
		m.ready = true
	} else {
		m.reader.Width = m.contentWidth()
		m.reader.Height = vpHeight
	}
}

// renderMarkdown turns an article body into ANSI for the viewport.
func (m *Model) renderMarkdown(a Article) string {
	r, err := glamour.NewTermRenderer(
		glamour.WithStandardStyle("dark"),
		glamour.WithWordWrap(m.contentWidth()),
	)
	if err != nil {
		return a.Body
	}
	doc := "# " + a.Title + "\n\n"
	if a.Description != "" {
		doc += "> " + a.Description + "\n\n"
	}
	doc += a.Body
	out, err := r.Render(doc)
	if err != nil {
		return a.Body
	}
	return out
}

func (m *Model) openReader(a Article, from screen) {
	m.readerTitle = a.Title
	m.reader.SetContent(m.renderMarkdown(a))
	m.reader.GotoTop()
	m.prev = from
	m.screen = screenReader
}

// --- update ---------------------------------------------------------------

func (m Model) Update(msg tea.Msg) (tea.Model, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.WindowSizeMsg:
		m.resize(msg.Width, msg.Height)
		return m, nil

	case tea.KeyMsg:
		switch msg.String() {
		case "ctrl+c", "Q":
			return m, tea.Quit
		}
		switch m.screen {
		case screenHome:
			return m.updateHome(msg)
		case screenList:
			return m.updateList(msg)
		case screenReader:
			return m.updateReader(msg)
		}
	}
	return m, nil
}

func (m Model) updateHome(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}
	case "down", "j":
		if m.cursor < len(homeMenu)-1 {
			m.cursor++
		}
	case "g":
		m.cursor = 0
	case "G":
		m.cursor = len(homeMenu) - 1
	case "q":
		return m, tea.Quit
	case "enter", "l", "right":
		item := homeMenu[m.cursor]
		switch {
		case item.kind == "quit":
			return m, tea.Quit
		case strings.HasPrefix(item.kind, "page:"):
			slug := strings.TrimPrefix(item.kind, "page:")
			if a, ok := m.content.Pages[slug]; ok {
				m.openReader(a, screenHome)
			}
		case item.kind == "list:projects":
			m.enterList("projects", "~/projects", m.content.Projects)
		case item.kind == "list:blog":
			m.enterList("blog", "~/blog", m.content.Blog)
		}
	}
	return m, nil
}

func (m *Model) enterList(kind, title string, items []Article) {
	m.listKind = kind
	m.listTitle = title
	m.listItems = items
	m.cursor = 0
	m.screen = screenList
}

func (m Model) updateList(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}
	case "down", "j":
		if m.cursor < len(m.listItems)-1 {
			m.cursor++
		}
	case "g":
		m.cursor = 0
	case "G":
		m.cursor = len(m.listItems) - 1
	case "esc", "backspace", "h", "left", "q":
		m.screen = screenHome
		m.cursor = 0
	case "enter", "l", "right":
		if len(m.listItems) > 0 {
			m.openReader(m.listItems[m.cursor], screenList)
		}
	}
	return m, nil
}

func (m Model) updateReader(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "backspace", "h", "left", "q":
		m.screen = m.prev
		return m, nil
	}
	var cmd tea.Cmd
	m.reader, cmd = m.reader.Update(msg)
	return m, cmd
}

// --- view -----------------------------------------------------------------

func (m Model) View() string {
	if !m.ready {
		return "loading…"
	}
	if m.loadErr != nil {
		return styleError.Render("content error: "+m.loadErr.Error()) + "\n"
	}
	switch m.screen {
	case screenList:
		return m.viewList()
	case screenReader:
		return m.viewReader()
	default:
		return m.viewHome()
	}
}

func (m Model) titleBar() string {
	brand := styleTitleBar.Render("stephan.zych.be")
	tag := styleBrandDim.Render("  ·  lead dev · Brussels")
	return brand + tag
}

func (m Model) footer(hints [][2]string) string {
	parts := make([]string, 0, len(hints))
	for _, h := range hints {
		parts = append(parts, styleHelpKey.Render(h[0])+" "+styleHelp.Render(h[1]))
	}
	return styleHelp.Render(strings.Join(parts, styleHelp.Render("  ·  ")))
}

func (m Model) frame(breadcrumb, body, footer string) string {
	var b strings.Builder
	b.WriteString(m.titleBar() + "\n")
	b.WriteString(breadcrumb + "\n\n")
	b.WriteString(body)
	// pad body to push footer to the bottom
	lines := strings.Count(b.String(), "\n")
	for i := lines; i < m.height-1; i++ {
		b.WriteString("\n")
	}
	b.WriteString(footer)
	return b.String()
}

func (m Model) viewHome() string {
	crumb := styleBreadcrumb.Render("~")
	var body strings.Builder
	for i, item := range homeMenu {
		if i == m.cursor {
			body.WriteString(styleItemSelected.Render("❯ "+item.label) + "  " + styleItemDesc.Render(item.desc) + "\n")
		} else {
			body.WriteString(styleItem.Render(item.label) + "\n")
		}
	}
	foot := m.footer([][2]string{{"↑/↓", "move"}, {"enter", "open"}, {"q", "quit"}})
	return m.frame(crumb, body.String(), foot)
}

func (m Model) viewList() string {
	crumb := styleBreadcrumb.Render("~") + styleCrumbSep.Render(" / ") + styleBreadcrumb.Render(strings.TrimPrefix(m.listTitle, "~/"))
	var body strings.Builder
	if len(m.listItems) == 0 {
		body.WriteString(styleHelp.Render("  (nothing here yet)\n"))
	}
	for i, a := range m.listItems {
		marker := "  "
		label := styleItem.Render(a.Title)
		if i == m.cursor {
			marker = styleItemSelected.Render("❯ ")
			label = styleItemSelected.Render(a.Title)
		}
		body.WriteString(marker + label + "\n")
		meta := []string{}
		if a.Date != "" {
			meta = append(meta, styleDate.Render(a.Date))
		}
		for _, t := range a.Tags {
			if t == "blog" || t == "projects" {
				continue
			}
			meta = append(meta, styleTag.Render("#"+t))
		}
		if len(meta) > 0 {
			body.WriteString("    " + strings.Join(meta, " ") + "\n")
		}
	}
	foot := m.footer([][2]string{{"↑/↓", "move"}, {"enter", "read"}, {"esc", "back"}})
	return m.frame(crumb, body.String(), foot)
}

func (m Model) viewReader() string {
	section := strings.TrimPrefix(m.listTitle, "~/")
	crumb := styleBreadcrumb.Render("~")
	if m.prev == screenList {
		crumb += styleCrumbSep.Render(" / ") + styleBreadcrumb.Render(section)
	}
	crumb += styleCrumbSep.Render(" / ") + styleSection.Render(m.readerTitle)

	scroll := fmt.Sprintf("%3.0f%%", m.reader.ScrollPercent()*100)
	foot := lipgloss.JoinHorizontal(lipgloss.Left,
		m.footer([][2]string{{"↑/↓", "scroll"}, {"esc", "back"}, {"q", "back"}}),
		styleHelp.Render("   "+scroll),
	)

	var b strings.Builder
	b.WriteString(m.titleBar() + "\n")
	b.WriteString(crumb + "\n")
	b.WriteString(m.reader.View() + "\n")
	b.WriteString(foot)
	return b.String()
}
