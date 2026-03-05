package main

import (
	"fmt"
	"regexp"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/lipgloss/table"
	"github.com/charmbracelet/x/ansi"
)

type screen int

const (
	screenHome screen = iota
	screenList
	screenReader
	screenHelp
	screenEffect
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

// Model is the root Bubble Tea model.
type Model struct {
	content *Content
	data    *SiteData
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
	animating     bool
	homeFrame     int
	effect        string
	effectFrame   int
	effectPrev    screen
	activeTab     string
	paletteOpen   bool
	palettePrefix string
	palItems      []paletteItem
	palFrame      int

	readerLinks []pageLink
	linksOpen   bool
	linkCursor  int
	clip        string // OSC52 payload to emit on the next frame

	themeName     string
	theme         Theme
	st            *Styles
	readerArticle Article
	readerList    []Article // the section sequence, for prev/next navigation
	readerIndex   int       // readerArticle's position within readerList
}

// NewModel builds the initial model from already-loaded content.
func NewModel(content *Content, data *SiteData, loadErr error, width, height int) Model {
	ti := textinput.New()
	ti.Prompt = ":"
	ti.CharLimit = 80
	ti.Cursor.Style = lipgloss.NewStyle().Foreground(lipgloss.Color(catppuccinMocha.Accent))
	ti.PromptStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(catppuccinMocha.Accent))
	ti.TextStyle = lipgloss.NewStyle().Foreground(lipgloss.Color(catppuccinMocha.Text))

	m := Model{
		content: content, data: data, loadErr: loadErr,
		width: width, height: height, screen: screenHome,
		clock:     clockString(time.Now()),
		input:     ti,
		animating: true,
	}
	m.themeName = themeOrder[0]
	m.theme = themes[m.themeName]
	s := buildStyles(m.theme)
	m.st = &s
	if width > 0 && height > 0 {
		m.resize(width, height)
	}
	return m
}

func (m Model) Init() tea.Cmd { return tea.Batch(tick(), animTick()) }

func (m Model) needsAnim() bool {
	return m.screen == screenHome || (m.paletteOpen && m.palFrame < paletteRevealLen) || m.screen == screenEffect
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
	vpHeight := h - 3 // header + blank + statusline
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

var reWidgetMarker = regexp.MustCompile("\x00WIDGET:([a-z-]+)\x00")
var reHeading = regexp.MustCompile(`^(#{1,6})\s+(.*\S)\s*$`)

var (
	reIfWakapi  = regexp.MustCompile(`(?s)\{%-?\s*if wakapi\s*-?%\}(.*?)\{%-?\s*endif\s*-?%\}`)
	reNjkTag    = regexp.MustCompile(`\{%-?.*?-?%\}`)
	reBlankRun3 = regexp.MustCompile(`\n{3,}`)
)

// resolveConditionals evaluates the `{% if wakapi %}…{% endif %}` block (kept
// only when wakapi data is present, like the web build) and strips any other
// stray njk tags. The TUI renders raw markdown, so these would otherwise leak.
func (m Model) resolveConditionals(s string) string {
	s = reIfWakapi.ReplaceAllStringFunc(s, func(block string) string {
		if m.data.Wakapi != nil {
			sub := reIfWakapi.FindStringSubmatch(block)
			return sub[1]
		}
		return ""
	})
	s = reNjkTag.ReplaceAllString(s, "")
	return reBlankRun3.ReplaceAllString(s, "\n\n")
}

// resolveSiteVars substitutes the known {{ site.* }} template tokens that leak
// from the raw markdown (the web resolves these at build time; the TUI doesn't).
func (m Model) resolveSiteVars(s string) string {
	return strings.NewReplacer(
		"{{ site.email }}", m.data.Site.Email,
		"{{ site.url }}", m.data.Site.URL,
		"{{ site.repoUrl }}", m.data.Site.RepoURL,
		"{{ site.coffeeUrl }}", m.data.Site.CoffeeURL,
		"{{ site.socials.github }}", m.data.Site.Socials.Github,
		"{{ site.socials.linkedin }}", m.data.Site.Socials.Linkedin,
		"{{ site.socials.twitter }}", m.data.Site.Socials.Twitter,
	).Replace(s)
}

// headingStyle returns the foreground hue and tinted background for a heading
// level — web render-markdown.nvim parity.
func (m Model) headingStyle(level int) (fg, bg string) {
	t := m.theme
	switch level {
	case 1:
		return t.Accent, tintBase(t.Accent, t.Base, 0.20)
	case 2:
		return t.Lavender, tintBase(t.Lavender, t.Base, 0.18)
	case 3:
		return t.Mauve, tintBase(t.Mauve, t.Base, 0.16)
	case 4:
		return t.Green, tintBase(t.Green, t.Base, 0.14)
	case 5:
		return t.Teal, tintBase(t.Teal, t.Base, 0.12)
	default:
		return t.Flamingo, tintBase(t.Flamingo, t.Base, 0.12)
	}
}

// headingBar renders a markdown heading as a full-width coloured bar (lipgloss
// Width pads the background across the line), with a blank line under it.
func (m Model) headingBar(level int, text string, width int) string {
	fg, bg := m.headingStyle(level)
	content := " " + strings.Repeat("#", level) + " " + text
	bar := lipgloss.NewStyle().
		Foreground(lipgloss.Color(fg)).
		Background(lipgloss.Color(bg)).
		Bold(true).
		Width(width).
		Render(content)
	return bar
}

func (m *Model) renderMarkdown(a Article) string {
	r, err := glamour.NewTermRenderer(
		glamour.WithStyles(m.glamourStyle()),
		glamour.WithWordWrap(m.contentWidth()),
	)
	if err != nil {
		return a.Body
	}
	width := m.contentWidth()

	// codeRenderer wraps code a little narrower so the box (border + padding)
	// still fits the content width.
	codeRenderer := r
	cw := width - 6
	if cw < 20 {
		cw = 20
	}
	if rc, err := glamour.NewTermRenderer(glamour.WithStyles(m.glamourStyle()), glamour.WithWordWrap(cw)); err == nil {
		codeRenderer = rc
	}

	var blocks []string
	addBlock := func(s string) {
		s = trimBlankLines(s)
		if strings.TrimSpace(ansi.Strip(s)) != "" {
			blocks = append(blocks, s)
		}
	}

	// codeBlock renders a fenced block via glamour (keeps chroma highlighting),
	// then wraps it in the widget card box, labelled with its language.
	codeBlock := func(lang, code string) string {
		rendered := code
		if out, err := codeRenderer.Render("```" + lang + "\n" + code + "\n```"); err == nil {
			rendered = trimBlankLines(out)
		}
		label := lang
		if label == "" {
			label = "code"
		}
		return m.panel(label, rendered)
	}

	// prose walks a markdown chunk, lifting headings (full-width bars), fenced
	// code blocks (boxed) and tables (lipgloss) out of glamour; the remaining
	// text runs go through glamour.
	prose := func(s string) {
		s = strings.TrimSpace(s)
		if s == "" {
			return
		}
		lines := strings.Split(s, "\n")
		var buf []string
		flush := func() {
			chunk := strings.TrimSpace(strings.Join(buf, "\n"))
			buf = buf[:0]
			if chunk == "" {
				return
			}
			if rendered, err := r.Render(chunk); err == nil {
				addBlock(rendered)
			} else {
				addBlock(chunk)
			}
		}
		for i := 0; i < len(lines); i++ {
			line := lines[i]
			t := strings.TrimSpace(line)

			// fenced code block
			if strings.HasPrefix(t, "```") || strings.HasPrefix(t, "~~~") {
				fence := t[:3]
				lang := strings.TrimSpace(strings.TrimLeft(t, "`~"))
				var code []string
				i++
				for i < len(lines) && !strings.HasPrefix(strings.TrimSpace(lines[i]), fence) {
					code = append(code, lines[i])
					i++
				}
				flush()
				if lang == "mermaid" {
					addBlock(m.renderMermaid(strings.Join(code, "\n"), width))
				} else {
					addBlock(codeBlock(lang, strings.Join(code, "\n")))
				}
				continue // i is on the closing fence; the for-loop i++ moves past it
			}

			// markdown table (header row followed by a |---| separator)
			if strings.HasPrefix(t, "|") && i+1 < len(lines) && isTableSep(strings.TrimSpace(lines[i+1])) {
				var rows []string
				for i < len(lines) && strings.HasPrefix(strings.TrimSpace(lines[i]), "|") {
					rows = append(rows, lines[i])
					i++
				}
				i-- // step back so the for-loop i++ lands on the first non-table line
				flush()
				addBlock(m.renderTable(rows, width))
				continue
			}

			// heading
			if hm := reHeading.FindStringSubmatch(line); hm != nil {
				flush()
				addBlock(m.headingBar(len(hm[1]), hm[2], width))
				continue
			}

			buf = append(buf, line)
		}
		flush()
	}

	prose("# " + a.Title)
	if a.Description != "" {
		prose("> " + a.Description)
	}

	body := a.Body
	idx := reWidgetMarker.FindAllStringSubmatchIndex(body, -1)
	last := 0
	for _, loc := range idx {
		prose(body[last:loc[0]])
		kind := body[loc[2]:loc[3]]
		if w := m.renderWidget(kind, width); w != "" {
			addBlock(w)
		}
		last = loc[1]
	}
	prose(body[last:])

	if footer := m.readerPagerFooter(width); footer != "" {
		addBlock(footer)
	}

	return linkifyOSC8(strings.Join(blocks, "\n\n"))
}

// trimBlankLines removes leading/trailing blank or whitespace-only lines
// (including ANSI-coloured spaces from glamour padding).
func trimBlankLines(s string) string {
	lines := strings.Split(s, "\n")
	isBlank := func(l string) bool { return strings.TrimSpace(ansi.Strip(l)) == "" }
	for len(lines) > 0 && isBlank(lines[0]) {
		lines = lines[1:]
	}
	for len(lines) > 0 && isBlank(lines[len(lines)-1]) {
		lines = lines[:len(lines)-1]
	}
	return strings.Join(lines, "\n")
}

var reTableSep = regexp.MustCompile(`^\|?[\s:|-]+\|?$`)

func isTableSep(t string) bool {
	return strings.Contains(t, "|") && strings.Contains(t, "-") && reTableSep.MatchString(t)
}

// renderTable renders a markdown table with lipgloss: rounded border, bold
// mauve header, padded Catppuccin cells.
func (m Model) renderTable(mdRows []string, width int) string {
	if len(mdRows) < 2 {
		return strings.Join(mdRows, "\n")
	}
	cells := func(line string) []string {
		line = strings.TrimSpace(line)
		line = strings.TrimPrefix(line, "|")
		line = strings.TrimSuffix(line, "|")
		parts := strings.Split(line, "|")
		for i := range parts {
			parts[i] = strings.TrimSpace(parts[i])
		}
		return parts
	}
	headers := cells(mdRows[0])
	var body [][]string
	for _, row := range mdRows[2:] {
		if strings.TrimSpace(row) == "" {
			continue
		}
		body = append(body, cells(row))
	}
	t := m.theme
	return table.New().
		Border(lipgloss.RoundedBorder()).
		BorderStyle(lipgloss.NewStyle().Foreground(lipgloss.Color(t.Surface1))).
		Headers(headers...).
		Rows(body...).
		StyleFunc(func(row, col int) lipgloss.Style {
			st := lipgloss.NewStyle().Padding(0, 1)
			if row == table.HeaderRow {
				return st.Foreground(lipgloss.Color(t.Mauve)).Bold(true)
			}
			return st.Foreground(lipgloss.Color(t.Text))
		}).
		Render()
}

var (
	// node definition: id followed by a bracketed (and optionally quoted) label,
	// e.g. spec["OpenAPI spec"], orval(["npx orval"]), n{decision}.
	reMmNode = regexp.MustCompile(`([A-Za-z0-9_]+)\s*[\[({]+\s*"?(.*?)"?\s*[\])}]+`)
	// edge: id <arrow> id, with the bracketed labels already stripped to ids.
	reMmEdge = regexp.MustCompile(`([A-Za-z0-9_]+)\s*(?:-{2,3}>|-\.->|={2,3}>|--[ox]|-{2,3}|={2,3})\s*(?:\|[^|]*\|\s*)?([A-Za-z0-9_]+)`)
	reMmBr   = regexp.MustCompile(`(?i)<br\s*/?>`)
)

// renderMermaid turns a ```mermaid block into terminal output. A real SVG can't
// be drawn over SSH, so flowcharts/graphs are rendered as a node → node edge
// list (the web shows the same relationships visually); other diagram types
// fall back to their labelled source.
func (m Model) renderMermaid(code string, width int) string {
	src := strings.TrimSpace(code)
	lines := strings.Split(src, "\n")
	head := strings.ToLower(strings.TrimSpace(lines[0]))
	if !strings.HasPrefix(head, "flowchart") && !strings.HasPrefix(head, "graph") {
		return m.panel("mermaid", src)
	}

	clean := func(s string) string {
		s = reMmBr.ReplaceAllString(s, " · ")
		return strings.Join(strings.Fields(strings.Trim(s, `"' `)), " ")
	}
	labels := map[string]string{}
	for _, mt := range reMmNode.FindAllStringSubmatch(src, -1) {
		if lbl := clean(mt[2]); lbl != "" {
			labels[mt[1]] = lbl
		}
	}
	label := func(id string) string {
		if l, ok := labels[id]; ok {
			return l
		}
		return id
	}

	arrowSt := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Overlay0))
	fromSt := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Text))
	toSt := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Accent)).Bold(true)

	var rows []string
	for _, ln := range lines[1:] {
		stripped := reMmNode.ReplaceAllString(ln, "$1")
		em := reMmEdge.FindStringSubmatch(stripped)
		if em == nil {
			continue
		}
		rows = append(rows, fromSt.Render(label(em[1]))+"  "+arrowSt.Render("──▶")+"  "+toSt.Render(label(em[2])))
	}
	if len(rows) == 0 {
		return m.panel("mermaid", src) // couldn't parse edges — show the source
	}
	return m.panel("diagram", strings.Join(rows, "\n"))
}

// startEffect enters a full-screen easter-egg effect, remembering where to
// return on the next keypress.
func (m *Model) startEffect(kind string) tea.Cmd {
	m.effect = kind
	m.effectFrame = 0
	m.effectPrev = m.screen
	m.screen = screenEffect
	if !m.animating {
		m.animating = true
		return animTick()
	}
	return nil
}

func (m *Model) openReader(a Article, from screen) {
	a.Body = m.resolveSiteVars(a.Body)
	a.Body = m.resolveConditionals(a.Body)
	m.readerArticle = a
	m.readerList, m.readerIndex = m.sectionSequence(a)
	m.readerTitle = a.Title
	m.listTitle = a.Section
	m.readerLinks = m.extractLinks(a.Body)
	m.linksOpen = false
	m.linkCursor = 0
	m.reader.SetContent(m.renderMarkdown(a))
	m.reader.GotoTop()
	m.prev = from
	m.activeTab = a.Section
	if a.Section == "pages" {
		m.activeTab = a.Slug
	}
	m.screen = screenReader
}

// sectionSequence returns the ordered list the article belongs to (for prev/
// next) and its index within it. Pages aren't a sequence, so they get (nil, -1).
func (m Model) sectionSequence(a Article) ([]Article, int) {
	var list []Article
	switch a.Section {
	case "projects":
		list = m.content.Projects
	case "blog":
		list = m.content.Blog
	default:
		return nil, -1
	}
	for i, it := range list {
		if it.Slug == a.Slug {
			return list, i
		}
	}
	return nil, -1
}

// readerNeighbors returns the previous/next articles around the open reader,
// matching the web pager: blog is newest-first, so prev = older (later in the
// slice) and next = newer (earlier). Projects follow plain list order.
func (m Model) readerNeighbors() (prev, next *Article) {
	if m.readerList == nil || m.readerIndex < 0 || m.readerIndex >= len(m.readerList) {
		return nil, nil
	}
	prevIdx, nextIdx := m.readerIndex-1, m.readerIndex+1
	if m.readerArticle.Section == "blog" {
		prevIdx, nextIdx = m.readerIndex+1, m.readerIndex-1
	}
	if prevIdx >= 0 && prevIdx < len(m.readerList) {
		prev = &m.readerList[prevIdx]
	}
	if nextIdx >= 0 && nextIdx < len(m.readerList) {
		next = &m.readerList[nextIdx]
	}
	return prev, next
}

// readerPagerFooter renders the prev/next links at the foot of an article,
// mirroring the web pager — the [ and ] keys do the navigating.
func (m Model) readerPagerFooter(width int) string {
	prev, next := m.readerNeighbors()
	if prev == nil && next == nil {
		return ""
	}
	keySt := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Accent)).Bold(true)
	titleSt := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Text)).Bold(true)
	tw := width - 14
	if tw < 8 {
		tw = 8
	}
	lines := []string{m.st.Rule.Render(strings.Repeat("─", width))}
	if prev != nil {
		lines = append(lines, keySt.Render("[")+m.st.Help.Render(" ← prev  ")+titleSt.Render(truncate(prev.Title, tw)))
	}
	if next != nil {
		lines = append(lines, keySt.Render("]")+m.st.Help.Render(" → next  ")+titleSt.Render(truncate(next.Title, tw)))
	}
	return strings.Join(lines, "\n")
}

// setTheme switches the session palette and rebuilds its styles. If a reader is
// open, its (statically rendered) content is re-rendered with the new theme.
func (m *Model) setTheme(name string) {
	t, ok := themes[name]
	if !ok {
		return
	}
	m.themeName = name
	m.theme = t
	s := buildStyles(t)
	m.st = &s
	if m.screen == screenReader {
		m.reader.SetContent(m.renderMarkdown(m.readerArticle))
	}
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
		if m.screen == screenHome {
			m.homeFrame++
		}
		if m.paletteOpen && m.palFrame < paletteRevealLen {
			m.palFrame++
		}
		if m.screen == screenEffect {
			m.effectFrame++
		}
		if m.needsAnim() {
			return m, animTick()
		}
		m.animating = false
		return m, nil

	case clipDoneMsg:
		m.clip = ""
		return m, nil

	case tea.KeyMsg:
		if m.paletteOpen {
			return m.updatePalette(msg)
		}
		if m.linksOpen {
			return m.updateLinks(msg)
		}
		if m.screen == screenEffect {
			m.screen = m.effectPrev
			m.effect = ""
			return m, nil
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
		// global tab shortcuts — every nav key (a/p/b/c…) works from any screen
		for _, lk := range m.homeLinks() {
			if msg.String() == lk.key {
				return m.afterKey(m.gotoTab(lk.name))
			}
		}
		switch m.screen {
		case screenHome:
			return m.afterKey(m.updateHome(msg))
		case screenList:
			return m.afterKey(m.updateList(msg))
		case screenReader:
			return m.afterKey(m.updateReader(msg))
		case screenHelp:
			if k := msg.String(); k == "esc" || k == "q" || k == "h" {
				m.screen = m.returnTo
			}
			return m.afterKey(m, nil)
		}
	}
	return m, nil
}

// afterKey ensures the animation loop is running when the resulting screen needs
// it (e.g. returning to the home screen, whose tagline cycles).
func (m Model) afterKey(model tea.Model, cmd tea.Cmd) (tea.Model, tea.Cmd) {
	mm, ok := model.(Model)
	if !ok {
		return model, cmd
	}
	if mm.needsAnim() && !mm.animating {
		mm.animating = true
		return mm, tea.Batch(cmd, animTick())
	}
	return mm, cmd
}

func (m Model) updateHome(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	links := m.homeLinks()
	switch msg.String() {
	case "up", "k":
		if m.cursor > 0 {
			m.cursor--
		}
	case "down", "j":
		if m.cursor < len(links)-1 {
			m.cursor++
		}
	case "g":
		m.cursor = 0
	case "G":
		m.cursor = len(links) - 1
	case "q":
		return m, tea.Quit
	case "enter", "l", "right":
		if m.cursor >= 0 && m.cursor < len(links) {
			return m.gotoTab(links[m.cursor].name)
		}
	}
	return m, nil
}

type homeLink struct {
	key  string
	name string
}

// homeLinks are the web-dashboard nav links: every nav tab except home.
func (m Model) homeLinks() []homeLink {
	out := make([]homeLink, 0, len(m.data.Nav.Tabs))
	for _, t := range m.data.Nav.Tabs {
		if t.Name == "home" {
			continue
		}
		out = append(out, homeLink{t.Key, t.Name})
	}
	return out
}

// gotoTab navigates to a nav tab by name.
func (m Model) gotoTab(name string) (tea.Model, tea.Cmd) {
	switch name {
	case "home":
		m.screen = screenHome
		m.cursor = 0
	case "projects":
		m.enterList("projects", "projects", m.content.Projects)
	case "blog":
		m.enterList("blog", "blog", m.content.Blog)
	default: // about, contact, whoami, … → page
		if a, ok := m.content.Pages[name]; ok {
			m.openReader(a, screenHome)
		}
	}
	return m, nil
}

// homeHint renders the bottom hint line from the shared shortcuts data,
// showing the palette/search/help keys.
func (m Model) homeHint() string {
	want := map[string]bool{":": true, "/": true, "?": true}
	parts := []string{}
	for _, s := range m.data.Shortcuts {
		if want[s.Keys] {
			parts = append(parts, m.st.HelpKey.Render(s.Keys)+m.st.Help.Render(" "+strings.ToLower(s.Description)))
		}
	}
	if len(parts) == 0 {
		return ""
	}
	return m.st.Help.Render("\n  ") + strings.Join(parts, m.st.Help.Render(" · "))
}

func (m *Model) enterList(kind, title string, items []Article) {
	m.listKind = kind
	m.listTitle = title
	m.listItems = items
	m.cursor = 0
	m.activeTab = kind
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
	case "l":
		if len(m.readerLinks) > 0 {
			m.linksOpen = true
			m.linkCursor = 0
			return m, nil
		}
	case "]":
		if _, next := m.readerNeighbors(); next != nil {
			m.openReader(*next, m.prev)
		}
		return m, nil
	case "[":
		if prev, _ := m.readerNeighbors(); prev != nil {
			m.openReader(*prev, m.prev)
		}
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
		return m.st.Error.Render("content error: "+m.loadErr.Error()) + "\n"
	}
	if m.screen == screenEffect {
		return m.viewEffect()
	}
	var out string
	switch {
	case m.paletteOpen:
		out = m.viewPalette()
	case m.linksOpen:
		out = m.viewLinks()
	default:
		switch m.screen {
		case screenList:
			out = m.viewList()
		case screenReader:
			out = m.viewReader()
		case screenHelp:
			out = m.viewHelp()
		default:
			out = m.viewHome()
		}
	}
	if m.clip != "" {
		out = osc52Seq(m.clip) + out
	}
	return out
}

// header renders the top row: site title on the left, nav tabs on the right.
func (m Model) header() string {
	title := m.st.FrameTitle.Render("stephan.zych.be")
	active := m.activeTab
	if m.screen == screenHome {
		active = "home"
	}
	parts := make([]string, 0, len(m.data.Nav.Tabs))
	for _, t := range m.data.Nav.Tabs {
		st := m.st.Tab
		if t.Name == active {
			st = m.st.TabActive
		}
		parts = append(parts, st.Render(t.Name))
	}
	left := " " + title
	right := strings.Join(parts, " ")
	gap := m.width - lipgloss.Width(left) - lipgloss.Width(right)
	if gap < 0 {
		gap = 0
	}
	return left + strings.Repeat(" ", gap) + right
}

// statusline renders the bottom bar: breadcrumb on the left, contextual info
// and the clock on the right. `crumb` is already styled by the caller.
func (m Model) statusline(crumb string, info ...string) string {
	left := " " + crumb
	right := ""
	for _, s := range info {
		right += m.st.StInfo.Render(s)
	}
	right += m.st.StTime.Render("󰥔 " + m.clock)
	gap := m.width - lipgloss.Width(left) - lipgloss.Width(right)
	if gap < 0 {
		gap = 0
	}
	return left + m.st.StFill.Render(strings.Repeat(" ", gap)) + right
}

// bottomBar swaps the statusline for a transient error/info message.
func (m Model) bottomBar(status string) string {
	if m.message != "" {
		return m.st.CmdErr.Width(m.iw()).Render(m.message)
	}
	return status
}

// shell composes the borderless screen: header, a blank line, the height-filled
// body (1-col left inset), and the bottom status bar. Each body row is fit to
// the width so long lines can't overflow.
func (m Model) shell(body, status string) string {
	W := m.width
	bodyH := m.height - 3 // header + blank + status
	if bodyH < 1 {
		bodyH = 1
	}
	rows := strings.Split(body, "\n")
	var b strings.Builder
	b.WriteString(m.header() + "\n\n")
	for i := 0; i < bodyH; i++ {
		line := ""
		if i < len(rows) {
			line = rows[i]
		}
		b.WriteString(" " + fitLine(line, W-1) + "\n")
	}
	b.WriteString(status)
	return b.String()
}

func (m Model) viewHome() string {
	logo := m.wordmarkView(m.data.StartScreen.Wordmark, m.homeFrame)

	cursor := " "
	if (m.homeFrame/8)%2 == 0 {
		cursor = "▌"
	}
	tagline := m.st.HomeTagline.Render(splashTaglineText(m.data.StartScreen.Taglines, m.homeFrame) + cursor)

	var menu strings.Builder
	links := m.homeLinks()
	for i, lk := range links {
		key := m.st.HomeKey.Render(lk.key)
		if i == m.cursor {
			menu.WriteString(m.st.MenuCursor.Render("❯ ") + key + "  " + m.st.HomeLinkSel.Render(lk.name) + "\n")
		} else {
			menu.WriteString("  " + key + "  " + m.st.HomeLink.Render(lk.name) + "\n")
		}
	}

	body := lipgloss.JoinVertical(lipgloss.Left, logo, "", tagline, "", menu.String(), m.homeHint())
	body = lipgloss.NewStyle().Padding(0, 0, 0, 2).Render(body)
	status := m.statusline(m.st.Breadcrumb.Render("~"), m.themeName, "utf-8")
	return m.shell(body, m.bottomBar(status))
}

func (m Model) viewList() string {
	crumb := m.st.Breadcrumb.Render("~") + m.st.CrumbSep.Render(" / ") + m.st.CrumbHere.Render(m.listTitle)
	bodyStr := lipgloss.NewStyle().Padding(0, 0, 0, 2).Render(m.renderItems(m.listItems, m.cursor))
	status := m.statusline(crumb, fmt.Sprintf("%d entries", len(m.listItems)))
	return m.shell(bodyStr, m.bottomBar(status))
}

// renderItems renders a list of articles with the selected one highlighted.
func (m Model) renderItems(items []Article, cursor int) string {
	var body strings.Builder
	if len(items) == 0 {
		return m.st.Help.Render("  (nothing here yet)")
	}
	for i, a := range items {
		sel := i == cursor
		bar := "  "
		title := m.st.ListTitle.Render(a.Title)
		if sel {
			bar = m.st.ListBar.Render("▌ ")
			title = m.st.ListSel.Render(a.Title)
		}
		body.WriteString(bar + title + "\n")

		meta := []string{}
		if a.Date != "" {
			meta = append(meta, m.st.Date.Render(a.Date))
		}
		for _, t := range a.Tags {
			if t == "blog" || t == "projects" {
				continue
			}
			meta = append(meta, m.st.Tag.Render("#"+t))
		}
		if len(meta) > 0 {
			body.WriteString("    " + strings.Join(meta, " ") + "\n")
		}
		if sel && a.Description != "" {
			body.WriteString("    " + m.st.DescDim.Render(truncate(a.Description, m.iw()-8)) + "\n")
		}
		body.WriteString("\n")
	}
	return body.String()
}

func (m Model) viewReader() string {
	section := m.listTitle
	crumb := m.st.Breadcrumb.Render("~")
	if section != "" {
		crumb += m.st.CrumbSep.Render(" / ") + m.st.Breadcrumb.Render(section)
	}
	crumb += m.st.CrumbSep.Render(" / ") + m.st.CrumbHere.Render(m.readerTitle)

	info := []string{"j/k scroll"}
	if prev, next := m.readerNeighbors(); prev != nil || next != nil {
		info = append(info, "[ ] prev/next")
	}
	if n := len(m.readerLinks); n > 0 {
		info = append(info, fmt.Sprintf("%d links · l", n))
	}
	info = append(info, "esc back")
	status := m.statusline(crumb, info...)
	return m.shell(m.reader.View(), m.bottomBar(status))
}

func (m Model) viewHelp() string {
	crumb := m.st.Breadcrumb.Render("~") + m.st.CrumbSep.Render(" / ") + m.st.CrumbHere.Render("help")
	body := lipgloss.NewStyle().Padding(0, 0, 0, 2).Render(m.renderHelp())
	status := m.statusline(crumb, "esc to close")
	return m.shell(body, m.bottomBar(status))
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
