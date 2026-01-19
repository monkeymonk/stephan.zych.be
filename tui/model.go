package main

import (
	"fmt"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
)

type screen int

const (
	screenSplash screen = iota
	screenHome
	screenList
	screenReader
	screenHelp
)

const maxContentWidth = 88

type tickMsg time.Time // clock, once a second
type animMsg time.Time // animation frames, ~24fps

func tick() tea.Cmd {
	return tea.Every(time.Second, func(t time.Time) tea.Msg { return tickMsg(t) })
}
func animTick() tea.Cmd {
	return tea.Tick(time.Second/24, func(t time.Time) tea.Msg { return animMsg(t) })
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
	prev          screen // reader's back target
	returnTo      screen // help back target
	clock         string

	input   textinput.Model
	message string

	cursor    int
	listKind  string
	listTitle string
	listItems []Article

	reader      viewport.Model
	readerTitle string
	ready       bool

	// animation / overlays
	animating   bool
	splashFrame int
	paletteOpen   bool
	palettePrefix string
	palItems      []paletteItem
	palFrame      int
}

// NewModel builds the initial model from already-loaded content.
func NewModel(content *Content, loadErr error, width, height int) Model {
	ti := textinput.New()
	ti.Prompt = ":"
	ti.CharLimit = 80
	ti.Cursor.Style = lipgloss.NewStyle().Foreground(lipgloss.Color(colAccent))
	ti.PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(colAccent))
	ti.TextStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(colText))

	m := Model{
		content: content, loadErr: loadErr,
		width: width, height: height, screen: screenSplash,
		clock:     clockString(time.Now()),
		input:     ti,
		animating: true,
	}
	if width > 0 && height > 0 {
		m.resize(width, height)
	}
	return m
}

func (m Model) Init() tea.Cmd { return tea.Batch(tick(), animTick()) }

func (m Model) needsAnim() bool {
	return m.screen == screenSplash || (m.paletteOpen && m.palFrame < paletteRevealLen)
}

// --- layout ---------------------------------------------------------------

// iw is the usable width inside the window border.
func (m Model) iw() int {
	if m.width < 4 {
		return 1
	}
	return m.width - 2
}

func (m *Model) contentWidth() int {
	w := m.iw() - 4
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
	m.input.Width = m.iw() - 4
	vpHeight := h - 5 // border(2) + crumb + blank + statusline
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
	m.listTitle = a.Section
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

	case animMsg:
		if m.screen == screenSplash {
			m.splashFrame++
		}
		if m.paletteOpen && m.palFrame < paletteRevealLen {
			m.palFrame++
		}
		if m.needsAnim() {
			return m, animTick()
		}
		m.animating = false
		return m, nil

	case tea.KeyMsg:
		// boot splash: any key enters
		if m.screen == screenSplash {
			m.screen = screenHome
			return m, nil
		}
		if m.paletteOpen {
			return m.updatePalette(msg)
		}
		// normal mode
		m.message = ""
		switch msg.String() {
		case "ctrl+c":
			return m, tea.Quit
		case ":":
			return m.openPalette(":")
		case "/":
			return m.openPalette("/")
		case "?":
			m.returnTo = m.screen
			m.screen = screenHelp
			return m, nil
		}
		switch m.screen {
		case screenHome:
			return m.updateHome(msg)
		case screenList:
			return m.updateList(msg)
		case screenReader:
			return m.updateReader(msg)
		case screenHelp:
			if k := msg.String(); k == "esc" || k == "q" || k == "h" {
				m.screen = m.returnTo
			}
			return m, nil
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
	if m.screen == screenSplash {
		return renderSplash(m)
	}
	if m.loadErr != nil {
		return styleError.Render("content error: "+m.loadErr.Error()) + "\n"
	}
	if m.paletteOpen {
		return m.viewPalette()
	}
	switch m.screen {
	case screenList:
		return m.viewList()
	case screenReader:
		return m.viewReader()
	case screenHelp:
		return m.viewHelp()
	default:
		return m.viewHome()
	}
}

// frame wraps inner content in the full-window rounded border, with traffic
// dots, the site title, and the clock embedded in the top edge.
func (m Model) frame(inner string) string {
	innerW := m.iw()
	innerH := m.height - 2
	bc := styleFrameBorder

	dots := styleDotR.Render("●") + " " + styleDotY.Render("●") + " " + styleDotG.Render("●")
	title := styleFrameTitle.Render("stephan.zych.be")
	clock := styleFrameClock.Render("󰥔 " + m.clock)
	left := bc.Render("╭─ ") + dots + bc.Render(" ─ ") + title + bc.Render(" ")
	right := bc.Render(" ") + clock + bc.Render(" ─╮")
	fillN := m.width - lipgloss.Width(left) - lipgloss.Width(right)
	if fillN < 0 {
		fillN = 0
	}
	top := left + bc.Render(strings.Repeat("─", fillN)) + right
	bottom := bc.Render("╰" + strings.Repeat("─", innerW) + "╯")

	rows := strings.Split(inner, "\n")
	var b strings.Builder
	b.WriteString(top + "\n")
	for i := 0; i < innerH; i++ {
		line := ""
		if i < len(rows) {
			line = rows[i]
		}
		b.WriteString(bc.Render("│") + fitLine(line, innerW) + bc.Render("│") + "\n")
	}
	b.WriteString(bottom)
	return b.String()
}

// statusline renders the bottom vim/tmux-style bar across the inner width.
func (m Model) statusline(mode, path string, info ...string) string {
	left := styleStMode.Render(mode) + styleStPath.Render(path)
	right := ""
	for _, s := range info {
		right += styleStInfo.Render(s)
	}
	gap := m.iw() - lipgloss.Width(left) - lipgloss.Width(right)
	if gap < 0 {
		gap = 0
	}
	return left + styleStFill.Render(strings.Repeat(" ", gap)) + right
}

// bottomBar swaps the statusline for a transient error/info message.
func (m Model) bottomBar(status string) string {
	if m.message != "" {
		return styleCmdErr.Width(m.iw()).Render(m.message)
	}
	return status
}

// shell stacks breadcrumb, body (height-filled) and the bottom bar, then frames it.
func (m Model) shell(crumb, body, status string) string {
	W := m.iw()
	bodyH := (m.height - 2) - 3
	if bodyH < 1 {
		bodyH = 1
	}
	bodyBox := lipgloss.NewStyle().Width(W).Height(bodyH).MaxHeight(bodyH).Render(body)
	inner := lipgloss.JoinVertical(lipgloss.Left, crumb, "", bodyBox, status)
	return m.frame(inner)
}

func (m Model) viewHome() string {
	card := neofetchCard(m.iw() - 4)

	var menu strings.Builder
	for i, item := range homeMenu {
		if i == m.cursor {
			menu.WriteString(styleMenuCursor.Render("❯ ") + styleMenuLabelSel.Render(padRight(item.label, 12)) +
				styleMenuDesc.Render("  "+item.desc) + "\n")
		} else {
			menu.WriteString("  " + styleMenuLabel.Render(item.label) + "\n")
		}
	}
	hint := styleHelp.Render("\n  ") + styleHelpKey.Render(":") + styleHelp.Render(" command palette · ") +
		styleHelpKey.Render("/") + styleHelp.Render(" search · ") + styleHelpKey.Render("?") + styleHelp.Render(" help")

	body := lipgloss.JoinVertical(lipgloss.Left, card, "", menu.String(), hint)
	body = lipgloss.NewStyle().Padding(1, 0, 0, 2).Render(body)

	status := m.statusline("HOME", "~", "catppuccin-mocha", "utf-8")
	return m.shell(styleBreadcrumb.Render("~"), body, m.bottomBar(status))
}

func (m Model) viewList() string {
	crumb := styleBreadcrumb.Render("~") + styleCrumbSep.Render(" / ") + styleCrumbHere.Render(m.listTitle)
	bodyStr := lipgloss.NewStyle().Padding(0, 0, 0, 2).Render(m.renderItems(m.listItems, m.cursor))
	status := m.statusline("LIST", "~/"+m.listTitle, fmt.Sprintf("%d entries", len(m.listItems)))
	return m.shell(crumb, bodyStr, m.bottomBar(status))
}

// renderItems renders a list of articles with the selected one highlighted.
func (m Model) renderItems(items []Article, cursor int) string {
	var body strings.Builder
	if len(items) == 0 {
		return styleHelp.Render("  (nothing here yet)")
	}
	for i, a := range items {
		sel := i == cursor
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
			body.WriteString("    " + styleDescDim.Render(truncate(a.Description, m.iw()-8)) + "\n")
		}
		body.WriteString("\n")
	}
	return body.String()
}

func (m Model) viewReader() string {
	section := m.listTitle
	crumb := styleBreadcrumb.Render("~")
	path := "~"
	if section != "" {
		crumb += styleCrumbSep.Render(" / ") + styleBreadcrumb.Render(section)
		path += "/" + section
	}
	crumb += styleCrumbSep.Render(" / ") + styleCrumbHere.Render(m.readerTitle)

	scroll := fmt.Sprintf("%3.0f%%", m.reader.ScrollPercent()*100)
	status := m.statusline("READ", path, scroll, "j/k scroll", "esc back")
	return m.shell(crumb, m.reader.View(), m.bottomBar(status))
}

func (m Model) viewHelp() string {
	crumb := styleBreadcrumb.Render("~") + styleCrumbSep.Render(" / ") + styleCrumbHere.Render("help")
	body := lipgloss.NewStyle().Padding(1, 0, 0, 2).Render(renderHelp())
	status := m.statusline("HELP", "~/help", "esc to close")
	return m.shell(crumb, body, m.bottomBar(status))
}

// fitLine truncates/pads a (possibly styled) line to exactly n columns.
func fitLine(s string, n int) string {
	if n < 0 {
		n = 0
	}
	s = ansi.Truncate(s, n, "")
	if w := lipgloss.Width(s); w < n {
		s += strings.Repeat(" ", n-w)
	}
	return s
}

func truncate(s string, max int) string {
	if max < 4 || len(s) <= max {
		return s
	}
	return s[:max-1] + "…"
}
