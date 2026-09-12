package main

import (
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/charmbracelet/bubbles/textinput"
	"github.com/charmbracelet/bubbles/viewport"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/glamour"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/lipgloss/table"
	"github.com/charmbracelet/log"
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
	out     io.Writer       // client terminal (SSH session / dev stdout), see copyURL
	tracker *trackerSession // nil in dev / when analytics is unconfigured

	width, height int
	screen        screen
	hist          history // back stack: `q`/esc pop it, see navigation.go
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
	overlay       Overlay // the one surface that owns the keyboard, see overlay.go
	palettePrefix string
	palItems      []paletteItem
	palFrame      int

	readerLinks []pageLink
	linkCursor  int

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
	// The CV is data-driven (content/data/cv.json), not a markdown file, so
	// LoadContent doesn't pick it up. Register it as a page so it's reachable
	// exactly like about/whoami — via internal /cv/ links, `:cv`, and search —
	// without needing a nav tab.
	if content != nil && content.Pages != nil && data != nil {
		content.Pages["cv"] = m.cvArticle()
	}
	if width > 0 && height > 0 {
		m.resize(width, height)
	}
	return m
}

// withOutput attaches the client's terminal — the SSH session, or stdout in
// dev. It's the same writer bubbletea renders to, and copyURL writes clipboard
// escapes to it directly; without it a copy only echoes on the status line.
func (m Model) withOutput(w io.Writer) Model {
	m.out = w
	return m
}

func (m Model) Init() tea.Cmd {
	m.trackPath() // a session that never navigates still records its landing view
	return tea.Batch(tick(), animTick())
}

// withTracker attaches the session's analytics handle. It's a pointer, so it
// survives the by-value copying of Model all through the update path — which is
// also why the pageview dedupe lives on the tracker, not here.
func (m Model) withTracker(t *trackerSession) Model {
	m.tracker = t
	return m
}

// trackPath reports the current screen under the same canonical path the web
// build serves it at, so both surfaces aggregate on one URL row.
func (m Model) trackPath() {
	if m.tracker == nil {
		return
	}
	if path, title := m.canonicalPath(); path != "" {
		m.tracker.pageview(path, title)
	}
}

// canonicalPath maps the current screen onto its web permalink. An empty path
// means "don't report" (the effect overlay is transient, not a page).
func (m Model) canonicalPath() (path, title string) {
	switch m.screen {
	case screenHome:
		return "/", m.data.Site.Title
	case screenList:
		if m.listKind == "" {
			return "", ""
		}
		return "/" + m.listKind + "/", m.listTitle
	case screenReader:
		if m.readerArticle.Slug == "" {
			return "", ""
		}
		return articlePath(m.readerArticle), m.readerArticle.Title
	case screenHelp:
		return "/help/", "help"
	}
	return "", ""
}

func (m Model) needsAnim() bool {
	// The quit prompt is a single static box over a dotted backdrop, and it
	// covers everything: nothing under it is visible, so a frame ticker here
	// would repaint an unchanged screen 24 times a second — over SSH, for as
	// long as the question goes unanswered. Checked before the home clause,
	// because the prompt is usually raised from home.
	if m.overlay == overlayConfirmQuit {
		return false
	}
	return m.screen == screenHome || (m.overlay == overlayPalette && m.palFrame < paletteRevealLen) || m.screen == screenEffect
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

// applyRevisionMarkers inserts a `[n]` visual cue immediately after each
// update's verbatim mark snippet in a's body — the TUI's stand-in for the
// web build's superscript <sup> markers, since the reader has no anchor
// navigation to link one to. n is the marked update's 1-based file-order
// position, matching the number updatesMarkdown prefixes each entry with.
//
// Unlike the web build's preprocessor, this never fails the build — there is
// no build here, only a live SSH server. A snippet that no longer matches
// exactly once (the prose moved, or the snippet is ambiguous) is skipped and
// warned about on stderr, once per article open, with the slug and the
// snippet — a stale mark degrades gracefully instead of taking the server down.
func applyRevisionMarkers(body string, updates []Update, slug string) string {
	type insertion struct {
		offset int
		text   string
	}
	var insertions []insertion
	for i, u := range updates {
		n := i + 1
		for _, mark := range u.Marks {
			count := strings.Count(body, mark)
			if count != 1 {
				log.Warn("revision marker mismatch, skipping", "slug", slug, "snippet", mark, "count", count)
				continue
			}
			insertions = append(insertions, insertion{
				offset: strings.Index(body, mark) + len(mark),
				text:   fmt.Sprintf("[%d]", n),
			})
		}
	}
	if len(insertions) == 0 {
		return body
	}
	// Apply from the end of the string backwards so an earlier insertion
	// never shifts an offset computed for a later one.
	sort.SliceStable(insertions, func(i, j int) bool { return insertions[i].offset > insertions[j].offset })
	for _, ins := range insertions {
		body = body[:ins.offset] + ins.text + body[ins.offset:]
	}
	return body
}

func (m *Model) openReader(a Article) {
	// Every route into an article records the place it was reached from — a
	// list, the article that linked here, the palette — so `q` has somewhere
	// to go. It used to take that place as a parameter and keep it in a single
	// field, which is the bug navigation.go's header describes.
	m.leave()
	a.Body = m.resolveSiteVars(a.Body)
	a.Body = m.resolveConditionals(a.Body)
	a.Body = applyRevisionMarkers(a.Body, a.Updates, a.Slug)
	if nav := m.seriesNavMarkdown(a); nav != "" {
		a.Body = nav + "\n" + a.Body // sits after the title/description, before the body
	}
	if pm := m.projectMetaMarkdown(a); pm != "" {
		a.Body = pm + "\n" + a.Body // project metadata card, before the body
	}
	if upd := m.updatesMarkdown(a); upd != "" {
		a.Body = a.Body + "\n" + upd // sits after the body — the original prose stays untouched above it
	}
	m.readerArticle = a
	m.readerList, m.readerIndex = m.sectionSequence(a)
	m.readerTitle = a.Title
	m.listTitle = a.Section
	m.readerLinks = m.extractLinks(a.Body)
	m.linkCursor = 0
	m.reader.SetContent(m.renderMarkdown(a))
	m.reader.GotoTop()
	m.activeTab = a.Section
	if a.Section == "pages" {
		m.activeTab = a.Slug
	}
	m.screen = screenReader
}

// seriesParts returns the blog posts in a's series, ordered by their `order`
// front matter — the TUI mirror of the web `seriesPosts` filter.
func (m Model) seriesParts(series string) []Article {
	if series == "" {
		return nil
	}
	var parts []Article
	for _, p := range m.content.Blog {
		if p.Series == series {
			parts = append(parts, p)
		}
	}
	sort.SliceStable(parts, func(i, j int) bool { return parts[i].Order < parts[j].Order })
	return parts
}

// seriesNavMarkdown builds the in-article series block (Medium-style part list)
// that the web renders from series-nav.njk: a "Part N of <series>" lead, the
// series blurb, then every part — the current one marked, the rest as links to
// /blog/<slug>/ that the reader's link extraction makes navigable.
func (m Model) seriesNavMarkdown(a Article) string {
	parts := m.seriesParts(a.Series)
	if len(parts) == 0 {
		return ""
	}
	meta := m.data.Series[a.Series]
	name := meta.Name
	if name == "" {
		name = a.Series
	}
	order := a.Order
	if order < 1 {
		order = 1
	}
	var b strings.Builder
	fmt.Fprintf(&b, "**Part %d of %s**", order, name)
	if meta.Description != "" {
		b.WriteString(" — " + meta.Description)
	}
	b.WriteString("\n\n")
	for i, p := range parts {
		if p.Slug == a.Slug {
			fmt.Fprintf(&b, "%d. **%s** — you’re reading it\n", i+1, p.Title)
		} else {
			fmt.Fprintf(&b, "%d. [%s](/blog/%s/)\n", i+1, p.Title, p.Slug)
		}
	}
	b.WriteString("\n---\n")
	return b.String()
}

// numberedUpdate pairs an update with its stable file-order number — its
// 1-based position in a.Updates — so the number survives being explicitly
// re-sorted by date for display. It is what lets each rendered entry below
// carry the same `[n]` that applyRevisionMarkers left in the prose above.
type numberedUpdate struct {
	Update
	n int
}

// updatesMarkdown builds the in-article updates block that records how a's
// judgement changed since publication — the TUI mirror of the web `updates`
// block. Unlike the series nav it is appended after the body (the original
// prose stays untouched above it), so its leading rule separates it from what
// precedes it rather than trailing one like seriesNavMarkdown does. Entries
// are authored oldest-first in front matter and render in that same order —
// file order — so entry `[1]` prints before `[2]`, matching the superscript
// numbers in the prose above; the sort is by date rather than trusted file
// order, but each entry keeps its file-order number regardless.
func (m Model) updatesMarkdown(a Article) string {
	if len(a.Updates) == 0 {
		return ""
	}
	updates := make([]numberedUpdate, len(a.Updates))
	for i, u := range a.Updates {
		updates[i] = numberedUpdate{Update: u, n: i + 1}
	}
	sort.SliceStable(updates, func(i, j int) bool { return updates[i].Date < updates[j].Date })
	var b strings.Builder
	b.WriteString("---\n\n## Updates\n\n")
	for _, u := range updates {
		label := "Revised"
		if u.Kind == "correction" {
			label = "Corrected"
		}
		fmt.Fprintf(&b, "- **[%d] %s %s** — %s\n", u.n, label, u.Date, u.Summary)
	}
	return b.String()
}

// projectMetaMarkdown builds the project fact line the web renders as the
// metadata card — client · role · when, then a live link — injected before the
// body like the series nav. Empty when the article isn't a project or carries
// no facts.
func (m Model) projectMetaMarkdown(a Article) string {
	if a.Section != "projects" {
		return ""
	}
	var facts []string
	if a.Client != "" {
		facts = append(facts, "**Client** "+a.Client)
	}
	if a.Role != "" {
		facts = append(facts, "**Role** "+a.Role)
	}
	if a.Timeframe != "" {
		facts = append(facts, "**When** "+a.Timeframe)
	}
	if len(facts) == 0 && a.LiveURL == "" {
		return ""
	}
	var b strings.Builder
	if len(facts) > 0 {
		b.WriteString(strings.Join(facts, "  ·  "))
		b.WriteString("\n\n")
	}
	if a.LiveURL != "" {
		host := strings.TrimPrefix(strings.TrimPrefix(a.LiveURL, "https://"), "http://")
		fmt.Fprintf(&b, "[Live → %s](%s)\n\n", host, a.LiveURL)
	}
	b.WriteString("---\n")
	return b.String()
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

// articlePath is the article's path on the web site. It must match the Eleventy
// permalinks in content/blog/blog.json / content/projects/projects.json, or a
// copied URL won't resolve there.
func articlePath(a Article) string {
	if a.Section == "pages" {
		return "/" + a.Slug + "/"
	}
	return "/" + a.Section + "/" + a.Slug + "/"
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
		if m.overlay == overlayPalette && m.palFrame < paletteRevealLen {
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

	case tea.KeyMsg:
		if !m.overlay.open() && m.screen != screenEffect {
			// A transient status message survives until the next keystroke in
			// normal mode, as it always has: an overlay's own keys leave it up.
			m.message = ""
		}
		if b, ok := resolve(m, msg); ok {
			mm, cmd := b.run(m)
			return mm.afterKey(cmd)
		}
		// A key the table does not claim belongs to the widget on screen: the
		// palette's text input while it owns the keyboard, the reader's
		// viewport otherwise. Those are the intrinsic mechanics the keymap
		// deliberately does not register, and dropping the key here would
		// break typing and scrolling.
		switch {
		case m.overlay == overlayPalette:
			mm, cmd := m.paletteInput(msg)
			return mm.afterKey(cmd)
		case m.overlay == overlayNone && m.screen == screenReader:
			var cmd tea.Cmd
			m.reader, cmd = m.reader.Update(msg)
			return m.afterKey(cmd)
		}
		return m, nil
	}
	return m, nil
}

// afterKey ensures the animation loop is running when the resulting screen needs
// it (e.g. returning to the home screen, whose tagline cycles), and reports the
// resulting screen as a pageview. Every keystroke leaves through it; the
// tracker's own lastPath dedupe is what makes the repeats harmless, so no
// dedupe state belongs on Model (which is copied by value).
func (m Model) afterKey(cmd tea.Cmd) (tea.Model, tea.Cmd) {
	m.trackPath()
	if m.needsAnim() && !m.animating {
		m.animating = true
		return m, tea.Batch(cmd, animTick())
	}
	return m, cmd
}

// back is the one resolution order `q` and esc share: close the overlay that
// owns the keyboard, else pop the history stack, else — at the root, with
// nowhere left to go — ask before disconnecting. Every back key runs this, so
// there is no second order for a screen to get wrong.
func (m Model) back() (Model, tea.Cmd) {
	if m.overlay.open() {
		return m.closeOverlay(), nil
	}
	loc, ok := m.hist.pop()
	if !ok {
		m.overlay = overlayConfirmQuit
		return m, nil
	}
	rest := m.hist
	m.restore(loc)
	// Going back is not itself a navigation. restore replays through
	// enterList/openReader, which record history, so the stack as it stood
	// just after the pop is the one that survives.
	m.hist = rest
	return m, nil
}

// closeOverlay hands the keyboard back to the screen underneath. The palette
// is the only overlay holding focus of its own, so it is the only one with
// anything to give up.
func (m Model) closeOverlay() Model {
	if m.overlay == overlayPalette {
		m.input.Blur()
	}
	m.overlay = overlayNone
	return m
}

// leave is what every navigation does before it goes anywhere: record the
// place being left so `q` can return to it, and hand the keyboard back, so an
// overlay cannot outlive the screen it was opened over. The four entry points
// (goHome, enterList, openReader, openHelp) call it, which is why the palette
// and an in-article link record history the same way a nav key does.
func (m *Model) leave() {
	m.hist.push(m.capture())
	*m = m.closeOverlay()
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

// goHome navigates to the start screen. Three callers reach it (a nav tab, the
// palette's `:home`, an in-article link to /), and each is a navigation, so the
// step away from the current place is recorded exactly once, here.
func (m *Model) goHome() {
	m.leave()
	m.screen = screenHome
	m.cursor = 0
}

// openHelp enters the help screen, recording the place it was opened from.
// Both callers (`?` and the palette's `:help`) go through here; the help
// screen used to keep its own one-slot back target, which a second `?` then
// pointed at help itself.
func (m *Model) openHelp() {
	m.leave()
	m.screen = screenHelp
}

// gotoTab navigates to a nav tab by name.
func (m Model) gotoTab(name string) (tea.Model, tea.Cmd) {
	switch name {
	case "home":
		m.goHome()
	case "projects":
		m.enterList("projects", "projects", m.content.Projects)
	case "blog":
		m.enterList("blog", "blog", m.content.Blog)
	default: // about, contact, whoami, cv, … → page
		if a, ok := m.content.Pages[name]; ok {
			m.openReader(a)
		}
		// An unknown name navigates nowhere, so it records nothing: each
		// branch above pushes, rather than this function pushing up front.
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
	m.leave()
	m.listKind = kind
	m.listTitle = title
	m.listItems = items
	m.cursor = 0
	m.activeTab = kind
	m.screen = screenList
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
	switch m.overlay {
	case overlayPalette:
		out = m.viewPalette()
	case overlayLinks:
		out = m.viewLinks()
	case overlayConfirmQuit:
		out = m.viewConfirmQuit()
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
		if a.Series != "" {
			name := m.data.Series[a.Series].Name
			if name == "" {
				name = a.Series
			}
			badge := "◆ " + name
			if a.Order > 0 {
				badge += fmt.Sprintf(" · part %d", a.Order)
			}
			meta = append(meta, m.st.Series.Render(badge))
		}
		if len(a.Updates) > 0 {
			meta = append(meta, m.st.Updated.Render("✎ updated"))
		}
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

// viewConfirmQuit renders the disconnect prompt, in the same shape as the
// palette and the link picker: one centred box over the dotted backdrop. It is
// what back() reaches at the root, where the session is the only thing left to
// leave. "Disconnect" rather than "quit" because that is what happens — the
// SSH connection closes and the site is still there.
func (m Model) viewConfirmQuit() string {
	boxW := 44
	if mx := m.iw() - 8; boxW > mx {
		boxW = mx
	}
	if boxW < 24 {
		boxW = 24
	}
	innerW := boxW - 4 // border + padding, as the palette measures it

	var b strings.Builder
	b.WriteString(m.st.ConfTitle.Render("disconnect?") + "\n")
	b.WriteString(m.st.FrameBorder.Render(strings.Repeat("─", innerW)) + "\n")
	b.WriteString(m.st.ConfBody.Render("This ends the SSH session.") + "\n")
	b.WriteString(m.st.FrameBorder.Render(strings.Repeat("─", innerW)) + "\n")
	b.WriteString(m.st.ConfHint.Render("y / ⏎ disconnect · n / esc / q stay"))

	box := m.st.ConfBox.Width(boxW - 2).Render(b.String())
	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box,
		lipgloss.WithWhitespaceForeground(m.st.Backdrop), lipgloss.WithWhitespaceChars("·"))
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
