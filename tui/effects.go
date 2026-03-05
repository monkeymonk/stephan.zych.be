package main

import (
	"math/rand"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// viewEffect renders the active full-screen easter-egg effect (driven by
// m.effectFrame; any key exits, handled in Update).
func (m Model) viewEffect() string {
	if m.effect == "party" {
		return m.viewConfetti()
	}
	return m.viewMatrix()
}

func effectGrid(w, h int) [][]string {
	rows := make([][]string, h)
	for y := range rows {
		rows[y] = make([]string, w)
		for x := range rows[y] {
			rows[y][x] = " "
		}
	}
	return rows
}

// effectJoin renders the grid, replacing the last row with a centered hint.
func effectJoin(rows [][]string, hint string, w int) string {
	h := len(rows)
	var b strings.Builder
	for y := 0; y < h; y++ {
		if y == h-1 {
			pad := (w - lipgloss.Width(hint)) / 2
			if pad < 0 {
				pad = 0
			}
			b.WriteString(strings.Repeat(" ", pad) + hint)
		} else {
			b.WriteString(strings.Join(rows[y], ""))
		}
		if y < h-1 {
			b.WriteString("\n")
		}
	}
	return b.String()
}

func (m Model) viewMatrix() string {
	w, h := m.width, m.height
	if w < 1 || h < 1 {
		return ""
	}
	// halfwidth katakana (1 column each) + digits/symbols
	glyphs := []rune("ｱｲｳｴｵｶｷｸｹｺﾊﾋﾌﾍﾎ0123456789Z:=*+<>|")
	head := lipgloss.NewStyle().Foreground(lipgloss.Color("#e8fff0")).Bold(true)
	bright := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Green)).Bold(true)
	dim := lipgloss.NewStyle().Foreground(lipgloss.Color("#2a6b3a"))
	faint := lipgloss.NewStyle().Foreground(lipgloss.Color("#16361f"))
	rows := effectGrid(w, h)
	for x := 0; x < w; x++ {
		r := rand.New(rand.NewSource(int64(x)*2654435761 + 1))
		speed := 2 + r.Intn(4)
		offset := r.Intn(h + 20)
		trail := 5 + r.Intn(12)
		pos := (m.effectFrame*speed/3 + offset) % (h + trail)
		for t := 0; t <= trail; t++ {
			y := pos - t
			if y < 0 || y >= h {
				continue
			}
			gi := ((x*31+y*17+m.effectFrame/2)%len(glyphs) + len(glyphs)) % len(glyphs)
			g := string(glyphs[gi])
			switch {
			case t == 0:
				rows[y][x] = head.Render(g)
			case t <= 2:
				rows[y][x] = bright.Render(g)
			case t <= trail/2:
				rows[y][x] = dim.Render(g)
			default:
				rows[y][x] = faint.Render(g)
			}
		}
	}
	hint := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Green)).Background(lipgloss.Color(m.theme.Crust)).Render(" wake up… press any key ")
	return effectJoin(rows, hint, w)
}

func (m Model) viewConfetti() string {
	w, h := m.width, m.height
	if w < 1 || h < 1 {
		return ""
	}
	chars := []rune("*+•°.:oxX")
	rows := effectGrid(w, h)
	n := (w * h) / 10
	for i := 0; i < n; i++ {
		r := rand.New(rand.NewSource(int64(i)*40503 + 7))
		x := r.Intn(w)
		startY := r.Intn(h)
		y := (startY + m.effectFrame*(1+r.Intn(3))/4) % h
		ch := string(chars[r.Intn(len(chars))])
		col := m.theme.Swatches[r.Intn(len(m.theme.Swatches))]
		rows[y][x] = lipgloss.NewStyle().Foreground(lipgloss.Color(col)).Bold(true).Render(ch)
	}
	hint := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Mauve)).Bold(true).Render("🎉  press any key  🎉")
	return effectJoin(rows, hint, w)
}
