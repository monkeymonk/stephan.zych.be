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

// navItems are the command-mode (`:`) actions.
func (m *Model) navItems() []paletteItem {
	return []paletteItem{
		{"󰋜", "home", "go to start", func(m *Model) tea.Cmd { m.screen = screenHome; m.cursor = 0; return nil }},
		{"󰉋", "projects", "section", func(m *Model) tea.Cmd { m.enterList("projects", "projects", m.content.Projects); return nil }},
		{"󰂺", "blog", "section", func(m *Model) tea.Cmd { m.enterList("blog", "blog", m.content.Blog); return nil }},
		{"󰋽", "help", "keys & commands", func(m *Model) tea.Cmd { m.returnTo = screenHome; m.screen = screenHelp; return nil }},
		{"󰍃", "quit", "disconnect", func(m *Model) tea.Cmd { return tea.Quit }},
	}
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
// `:` → navigation/actions then articles; `/` → articles only (search).
func (m *Model) buildPaletteItems(prefix string) []paletteItem {
	if prefix == "/" {
		return m.articleItems()
	}
	return append(m.navItems(), m.articleItems()...)
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
	inner := lipgloss.Place(m.iw(), m.height-2, lipgloss.Center, lipgloss.Center, m.renderPaletteBox(),
		lipgloss.WithWhitespaceForeground(styleBackdrop),
		lipgloss.WithWhitespaceChars("·"))
	return m.frame(inner)
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
	b.WriteString(stylePalTitle.Render(title) + "\n")
	b.WriteString(m.input.View() + "\n")
	b.WriteString(styleFrameBorder.Render(strings.Repeat("─", innerW)) + "\n")

	if len(items) == 0 {
		b.WriteString(stylePalHint.Render("  no matches"))
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
			row := stylePalIconSel.Render(it.icon+" ") + stylePalItemSel.Render(label)
			pad := innerW - lipgloss.Width(row) - lipgloss.Width(it.hint) - 1
			if pad < 1 {
				pad = 1
			}
			row += stylePalItemSel.Render(strings.Repeat(" ", pad)) + stylePalItemSel.Render(it.hint+" ")
			b.WriteString(row)
		} else {
			row := stylePalIcon.Render(it.icon+" ") + stylePalItem.Render(label)
			pad := innerW - lipgloss.Width(row) - lipgloss.Width(it.hint)
			if pad < 1 {
				pad = 1
			}
			row += strings.Repeat(" ", pad) + stylePalSection.Render(it.hint)
			b.WriteString(row)
		}
		if i < end-1 {
			b.WriteString("\n")
		}
	}

	b.WriteString("\n" + styleFrameBorder.Render(strings.Repeat("─", innerW)) + "\n")
	b.WriteString(stylePalHint.Render("↑↓ move · tab complete · ⏎ open · esc close · ") +
		stylePalSection.Render(itoa(len(items))+" results"))

	return stylePalBox.Width(boxW - 2).Render(b.String())
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
