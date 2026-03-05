package main

import (
	"strings"

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

const paletteRevealLen = 8 // visible rows; also the open-cascade length

// paletteItem is one selectable action in the command palette.
type paletteItem struct {
	icon   string
	label  string // also the Tab-completion text
	hint   string
	action func(m *Model) tea.Cmd
}

// navItems are the command-mode (`:`) actions, built from the shared nav data
// plus the terminal-only help/quit commands.
func (m *Model) navItems() []paletteItem {
	out := make([]paletteItem, 0, len(m.data.Nav.Tabs)+2)
	for _, tab := range m.data.Nav.Tabs {
		icon := iconGlyph(tab.Icon)
		switch tab.Name {
		case "home":
			out = append(out, paletteItem{icon, "home", "go to start", func(m *Model) tea.Cmd { m.screen = screenHome; m.cursor = 0; return nil }})
		case "projects":
			out = append(out, paletteItem{icon, "projects", "section", func(m *Model) tea.Cmd { m.enterList("projects", "projects", m.content.Projects); return nil }})
		case "blog":
			out = append(out, paletteItem{icon, "blog", "section", func(m *Model) tea.Cmd { m.enterList("blog", "blog", m.content.Blog); return nil }})
		default:
			name := tab.Name
			out = append(out, paletteItem{icon, name, "page", func(m *Model) tea.Cmd {
				if a, ok := m.content.Pages[name]; ok {
					m.openReader(a, screenHome)
				}
				return nil
			}})
		}
	}
	for _, name := range themeOrder {
		name := name
		out = append(out, paletteItem{"󰸌", "colorscheme " + name, "set theme", func(m *Model) tea.Cmd { m.setTheme(name); return nil }})
	}
	out = append(out,
		paletteItem{"󰈙", "whoami", "man page for one (1) developer", func(m *Model) tea.Cmd {
			if a, ok := m.content.Pages["whoami"]; ok {
				m.openReader(a, screenHome)
			}
			return nil
		}},
		paletteItem{"󰌾", "sudo", "try root access", func(m *Model) tea.Cmd { m.message = "E: Are you sure you are not root?"; return nil }},
		paletteItem{"󰅶", "coffee", "brew coffee", func(m *Model) tea.Cmd { m.message = "☕ Brewing..."; return nil }},
		paletteItem{"󰊕", "42", "the answer", func(m *Model) tea.Cmd { m.message = "The answer to life, the universe, and everything."; return nil }},
		paletteItem{"󰊠", "matrix", "enter the Matrix", func(m *Model) tea.Cmd { return m.startEffect("matrix") }},
		paletteItem{"󰈸", "party", "celebrate!", func(m *Model) tea.Cmd { return m.startEffect("party") }},
		paletteItem{"󰋽", "help", "keys & commands", func(m *Model) tea.Cmd { m.returnTo = screenHome; m.screen = screenHelp; return nil }},
		paletteItem{"󰍃", "quit", "disconnect", func(m *Model) tea.Cmd { return tea.Quit }},
	)
	return out
}

func (m *Model) articleItems() []paletteItem {
	out := []paletteItem{}
	for _, a := range m.allArticles() {
		a := a
		out = append(out, paletteItem{"󰈙", a.Title, a.Section, func(m *Model) tea.Cmd { m.openReader(a, screenHome); return nil }})
	}
	return out
}

// buildPaletteItems assembles items for the active prefix.
// `:` → navigation/actions only (commands); `/` → articles only (search).
func (m *Model) buildPaletteItems(prefix string) []paletteItem {
	if prefix == "/" {
		return m.articleItems()
	}
	return m.navItems()
}

func (m Model) paletteFiltered() []paletteItem {
	q := strings.ToLower(strings.TrimSpace(m.input.Value()))
	if q == "" {
		return m.palItems
	}
	out := make([]paletteItem, 0, len(m.palItems))
	for _, it := range m.palItems {
		if strings.Contains(strings.ToLower(it.label+" "+it.hint), q) {
			out = append(out, it)
		}
	}
	return out
}

// openPalette enters the palette overlay with the given prefix (":" or "/").
func (m Model) openPalette(prefix string) (tea.Model, tea.Cmd) {
	m.paletteOpen = true
	m.palettePrefix = prefix
	m.message = ""
	m.input.Prompt = prefix
	m.input.SetValue("")
	m.cursor = 0
	m.palItems = m.buildPaletteItems(prefix)
	m.palFrame = 0
	cmds := []tea.Cmd{m.input.Focus()}
	if !m.animating {
		m.animating = true
		cmds = append(cmds, animTick())
	}
	return m, tea.Batch(cmds...)
}

func (m Model) updatePalette(msg tea.KeyMsg) (tea.Model, tea.Cmd) {
	items := m.paletteFiltered()
	switch msg.String() {
	case "esc", "ctrl+c":
		m.paletteOpen = false
		m.input.Blur()
		return m, nil
	case "enter":
		if len(items) > 0 && m.cursor < len(items) {
			m.paletteOpen = false
			m.input.Blur()
			return m, items[m.cursor].action(&m)
		}
		return m, nil
	case "tab":
		// autocomplete the input to the highlighted item
		if len(items) > 0 && m.cursor < len(items) {
			m.input.SetValue(items[m.cursor].label)
			m.input.CursorEnd()
		}
		return m, nil
	case "up", "ctrl+p", "ctrl+k":
		if m.cursor > 0 {
			m.cursor--
		}
		return m, nil
	case "down", "ctrl+n", "ctrl+j":
		if m.cursor < len(items)-1 {
			m.cursor++
		}
		return m, nil
	}
	var cmd tea.Cmd
	m.input, cmd = m.input.Update(msg)
	if f := m.paletteFiltered(); m.cursor >= len(f) {
		m.cursor = max(0, len(f)-1)
	}
	return m, cmd
}

// viewPalette renders the centered palette over a dotted backdrop.
func (m Model) viewPalette() string {
	return lipgloss.Place(m.width, m.height, lipgloss.Center, lipgloss.Center, m.renderPaletteBox(),
		lipgloss.WithWhitespaceForeground(m.st.Backdrop),
		lipgloss.WithWhitespaceChars("·"))
}

func (m Model) renderPaletteBox() string {
	boxW := 60
	if mx := m.iw() - 8; boxW > mx {
		boxW = mx
	}
	if boxW < 24 {
		boxW = 24
	}
	innerW := boxW - 4 // border + padding

	items := m.paletteFiltered()

	title := "⌘ command palette"
	if m.palettePrefix == "/" {
		title = "󰍉 search content"
	}

	var b strings.Builder
	b.WriteString(m.st.PalTitle.Render(title) + "\n")
	b.WriteString(m.input.View() + "\n")
	b.WriteString(m.st.FrameBorder.Render(strings.Repeat("─", innerW)) + "\n")

	if len(items) == 0 {
		b.WriteString(m.st.PalHint.Render("  no matches"))
	}

	// scrolling window around the cursor, with an open-cascade reveal
	visible := paletteRevealLen
	if m.palFrame < visible {
		visible = m.palFrame
	}
	start := 0
	if m.cursor >= visible {
		start = m.cursor - visible + 1
	}
	end := start + visible
	if end > len(items) {
		end = len(items)
	}
	for i := start; i < end; i++ {
		it := items[i]
		label := truncate(it.label, innerW-len(it.hint)-6)
		if i == m.cursor {
			row := m.st.PalIconSel.Render(it.icon+" ") + m.st.PalItemSel.Render(label)
			pad := innerW - lipgloss.Width(row) - lipgloss.Width(it.hint) - 1
			if pad < 1 {
				pad = 1
			}
			row += m.st.PalItemSel.Render(strings.Repeat(" ", pad)) + m.st.PalItemSel.Render(it.hint+" ")
			b.WriteString(row)
		} else {
			row := m.st.PalIcon.Render(it.icon+" ") + m.st.PalItem.Render(label)
			pad := innerW - lipgloss.Width(row) - lipgloss.Width(it.hint)
			if pad < 1 {
				pad = 1
			}
			row += strings.Repeat(" ", pad) + m.st.PalSection.Render(it.hint)
			b.WriteString(row)
		}
		if i < end-1 {
			b.WriteString("\n")
		}
	}

	b.WriteString("\n" + m.st.FrameBorder.Render(strings.Repeat("─", innerW)) + "\n")
	b.WriteString(m.st.PalHint.Render("↑↓ move · tab complete · ⏎ open · esc close · ") +
		m.st.PalSection.Render(itoa(len(items))+" results"))

	return m.st.PalBox.Width(boxW - 2).Render(b.String())
}

func itoa(n int) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	var d []byte
	for n > 0 {
		d = append([]byte{byte('0' + n%10)}, d...)
		n /= 10
	}
	if neg {
		d = append([]byte{'-'}, d...)
	}
	return string(d)
}
