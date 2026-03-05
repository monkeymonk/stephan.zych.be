package main

import (
	"regexp"
	"strings"

	"github.com/aymanbagabas/go-osc52/v2"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

// pageLink is a hyperlink found in an article body.
type pageLink struct {
	text     string
	url      string
	internal bool
	kind     string // "home" | "page" | "list" | "article"
	target   string // page slug / list kind / article slug
	section  string // for "article": "projects" | "blog"
}

type clipDoneMsg struct{}

var (
	reMdLink  = regexp.MustCompile(`\[([^\]]+)\]\(([^)\s]+)[^)]*\)`)
	reBareURL = regexp.MustCompile(`(?:^|[\s(])(https?://[^\s)]+)`)
	reAbsURL  = regexp.MustCompile(`https?://[^\s\x1b\\\]]+`)
)

// extractLinks pulls markdown + bare links from a body, classifying each.
func (m Model) extractLinks(body string) []pageLink {
	seen := map[string]bool{}
	var out []pageLink
	add := func(text, url string) {
		url = strings.TrimSpace(url)
		if url == "" || strings.HasPrefix(url, "#") || strings.Contains(url, "{{") || seen[url] {
			return
		}
		seen[url] = true
		if text == "" {
			text = url
		}
		out = append(out, m.classifyLink(text, url))
	}
	for _, mm := range reMdLink.FindAllStringSubmatch(body, -1) {
		add(mm[1], mm[2])
	}
	for _, mm := range reBareURL.FindAllStringSubmatch(body, -1) {
		add(mm[1], mm[1])
	}
	return out
}

// classifyLink resolves an internal site path to an in-TUI navigation target.
func (m Model) classifyLink(text, url string) pageLink {
	l := pageLink{text: text, url: url}
	path := url
	for _, pre := range []string{"https://stephan.zych.be", "http://stephan.zych.be"} {
		if strings.HasPrefix(path, pre) {
			path = strings.TrimPrefix(path, pre)
			if path == "" {
				path = "/"
			}
		}
	}
	if !strings.HasPrefix(path, "/") {
		return l // external
	}
	trimmed := strings.Trim(path, "/")
	if trimmed == "" {
		l.internal, l.kind = true, "home"
		return l
	}
	parts := strings.Split(trimmed, "/")
	switch parts[0] {
	case "projects", "blog":
		if len(parts) == 1 {
			l.internal, l.kind, l.target = true, "list", parts[0]
			return l
		}
		items := m.content.Projects
		if parts[0] == "blog" {
			items = m.content.Blog
		}
		for _, a := range items {
			if a.Slug == parts[1] {
				l.internal, l.kind, l.section, l.target = true, "article", parts[0], parts[1]
				return l
			}
		}
	default:
		if _, ok := m.content.Pages[parts[0]]; ok {
			l.internal, l.kind, l.target = true, "page", parts[0]
			return l
		}
	}
	return l // unresolved internal path → leave external/no-op
}

// followLink navigates an internal link, or copies an external URL to the
// client clipboard (OSC52) with a notification.
func (m Model) followLink(l pageLink) (tea.Model, tea.Cmd) {
	if l.internal {
		switch l.kind {
		case "home":
			m.screen = screenHome
			m.cursor = 0
		case "page":
			if a, ok := m.content.Pages[l.target]; ok {
				m.openReader(a, m.screen)
			}
		case "list":
			if l.target == "blog" {
				m.enterList("blog", "blog", m.content.Blog)
			} else {
				m.enterList("projects", "projects", m.content.Projects)
			}
		case "article":
			items := m.content.Projects
			if l.section == "blog" {
				items = m.content.Blog
			}
			for _, a := range items {
				if a.Slug == l.target {
					m.openReader(a, m.screen)
					break
				}
			}
		}
		return m, nil
	}
	m.clip = l.url
	m.message = "🔗 copied: " + l.url
	return m, func() tea.Msg { return clipDoneMsg{} }
}

// osc52Seq is the clipboard-copy escape sequence for the client terminal.
func osc52Seq(s string) string { return osc52.New(s).String() }

// linkifyOSC8 wraps absolute URLs in rendered text with OSC 8 hyperlinks.
func linkifyOSC8(s string) string {
	return reAbsURL.ReplaceAllStringFunc(s, func(u string) string {
		return "\x1b]8;;" + u + "\x1b\\" + u + "\x1b]8;;\x1b\\"
	})
}

// updateLinks drives the link-picker overlay.
func (m Model) updateLinks(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	switch msg.String() {
	case "esc", "q", "l":
		m.linksOpen = false
		return m, nil
	case "up", "k":
		if m.linkCursor > 0 {
			m.linkCursor--
		}
	case "down", "j":
		if m.linkCursor < len(m.readerLinks)-1 {
			m.linkCursor++
		}
	case "g":
		m.linkCursor = 0
	case "G":
		m.linkCursor = len(m.readerLinks) - 1
	case "enter":
		if m.linkCursor >= 0 && m.linkCursor < len(m.readerLinks) {
			l := m.readerLinks[m.linkCursor]
			m.linksOpen = false
			return m.followLink(l)
		}
	}
	return m, nil
}

// viewLinks renders the centered link-picker over a dotted backdrop.
func (m Model) viewLinks() string {
	boxW := 64
	if mx := m.iw() - 8; boxW > mx {
		boxW = mx
	}
	if boxW < 24 {
		boxW = 24
	}
	innerW := boxW - 4

	var b strings.Builder
	b.WriteString(m.st.PalTitle.Render("🔗 links in this page") + "\n")
	b.WriteString(m.st.FrameBorder.Render(strings.Repeat("─", innerW)) + "\n")
	for i, l := range m.readerLinks {
		text := truncate(l.text, innerW/2)
		meta := l.url
		if l.internal {
			meta = "→ " + l.kind
			if l.target != "" {
				meta += " " + l.target
			}
		}
		nameSt := m.st.PalItem
		if i == m.linkCursor {
			nameSt = m.st.PalItemSel
		}
		left := nameSt.Render(text)
		meta = truncate(meta, innerW-lipgloss.Width(left)-2)
		pad := innerW - lipgloss.Width(left) - lipgloss.Width(meta)
		if pad < 1 {
			pad = 1
		}
		b.WriteString(left + strings.Repeat(" ", pad) + m.st.PalSection.Render(meta))
		if i < len(m.readerLinks)-1 {
			b.WriteString("\n")
		}
	}
	b.WriteString("\n" + m.st.FrameBorder.Render(strings.Repeat("─", innerW)) + "\n")
	b.WriteString(m.st.PalHint.Render("↑↓ move · ⏎ open · esc close"))

	box := m.st.PalBox.Width(boxW - 2).Render(b.String())
	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, box,
		lipgloss.WithWhitespaceForeground(m.st.Backdrop), lipgloss.WithWhitespaceChars("·"))
}
