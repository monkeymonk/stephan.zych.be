package main

import (
	"fmt"
	"strings"
	"time"

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

const maxContentWidth = 88

type tickMsg time.Time

func tick() tea.Cmd {
	return tea.Every(time.Second, func(t time.Time) tea.Msg { return tickMsg(t) })
}

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
	prev          screen
	clock         string

	cursor    int
	listKind  string
	listTitle string
	listItems []Article

	reader      viewport.Model
	readerTitle string
	ready       bool
}

// NewModel builds the initial model from already-loaded content.
func NewModel(content *Content, loadErr error, width, height int) Model {
	m := Model{
		content: content, loadErr: loadErr,
		width: width, height: height, screen: screenHome,
		clock: clockString(time.Now()),
	}
	if width > 0 && height > 0 {
		m.resize(width, height)
	}
	return m
}

func (m Model) Init() tea.Cmd { return tick() }

// --- layout ---------------------------------------------------------------

func (m *Model) contentWidth() int {
	w := m.width - 6
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
	vpHeight := h - 4 // 3-line header + 1-line statusline
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

func (m *Model) renderMarkdown(a Article) string {
	r, err := glamour.NewTermRenderer(
		glamour.WithStyles(catppuccinStyle()),
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

	case tickMsg:
		m.clock = clockString(time.Time(msg))
		return m, tick()

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
			m.enterList("projects", "projects", m.content.Projects)
		case item.kind == "list:blog":
			m.enterList("blog", "blog", m.content.Blog)
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

// header is the fixed 3-line top: brand bar, breadcrumb, blank.
func (m Model) header(crumb string) string {
	title := styleTitleBar.Render("stephan.zych.be") + styleBrandDim.Render("  ·  a portfolio you can ssh into")
	return lipgloss.JoinVertical(lipgloss.Left, title, crumb, "")
}

// statusline renders the bottom vim/tmux-style bar across the full width.
func (m Model) statusline(mode, path string, info ...string) string {
	left := styleStMode.Render(mode) + styleStPath.Render(path)
	right := ""
	for _, s := range info {
		right += styleStInfo.Render(s)
	}
	right += styleStTime.Render("󰥔 " + m.clock)
	gap := m.width - lipgloss.Width(left) - lipgloss.Width(right)
	if gap < 0 {
		gap = 0
	}
	return left + styleStFill.Render(strings.Repeat(" ", gap)) + right
}

// shell stacks the fixed header, a height-filled body, and the statusline.
func (m Model) shell(top, body, status string) string {
	bodyH := m.height - lipgloss.Height(top) - lipgloss.Height(status)
	if bodyH < 1 {
		bodyH = 1
	}
	bodyBox := lipgloss.NewStyle().Width(m.width).Height(bodyH).MaxHeight(bodyH).Render(body)
	return lipgloss.JoinVertical(lipgloss.Left, top, bodyBox, status)
}

func (m Model) viewHome() string {
	card := neofetchCard(m.width - 4)

	var menu strings.Builder
	for i, item := range homeMenu {
		if i == m.cursor {
			menu.WriteString(styleMenuCursor.Render("❯ ") + styleMenuLabelSel.Render(padRight(item.label, 12)) +
				styleMenuDesc.Render("  "+item.desc) + "\n")
		} else {
			menu.WriteString("  " + styleMenuLabel.Render(item.label) + "\n")
		}
	}

	body := lipgloss.JoinVertical(lipgloss.Left, card, "", menu.String())
	body = lipgloss.NewStyle().Padding(1, 0, 0, 2).Render(body)

	top := m.header(styleBreadcrumb.Render("~"))
	status := m.statusline("HOME", "~", "catppuccin-mocha", "utf-8")
	return m.shell(top, body, status)
}

func (m Model) viewList() string {
	crumb := styleBreadcrumb.Render("~") + styleCrumbSep.Render(" / ") + styleCrumbHere.Render(m.listTitle)

	var body strings.Builder
	if len(m.listItems) == 0 {
		body.WriteString(styleHelp.Render("  (nothing here yet)\n"))
	}
	for i, a := range m.listItems {
		sel := i == m.cursor
		bar := "  "
		title := styleListTitle.Render(a.Title)
		if sel {
			bar = styleListBar.Render("▌ ")
			title = styleListSel.Render(a.Title)
		}
		body.WriteString(bar + title + "\n")

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
		if sel && a.Description != "" {
			body.WriteString("    " + styleDescDim.Render(truncate(a.Description, m.width-8)) + "\n")
		}
		body.WriteString("\n")
	}

	bodyStr := lipgloss.NewStyle().Padding(0, 0, 0, 2).Render(body.String())
	top := m.header(crumb)
	status := m.statusline("LIST", "~/"+m.listTitle, fmt.Sprintf("%d entries", len(m.listItems)))
	return m.shell(top, bodyStr, status)
}

func (m Model) viewReader() string {
	section := m.listTitle
	crumb := styleBreadcrumb.Render("~")
	path := "~"
	if m.prev == screenList {
		crumb += styleCrumbSep.Render(" / ") + styleBreadcrumb.Render(section)
		path += "/" + section
	}
	crumb += styleCrumbSep.Render(" / ") + styleCrumbHere.Render(m.readerTitle)

	top := m.header(crumb)
	scroll := fmt.Sprintf("%3.0f%%", m.reader.ScrollPercent()*100)
	status := m.statusline("READ", path, scroll, "j/k scroll", "esc back")
	return m.shell(top, m.reader.View(), status)
}

func truncate(s string, max int) string {
	if max < 4 || len(s) <= max {
		return s
	}
	return s[:max-1] + "…"
}
