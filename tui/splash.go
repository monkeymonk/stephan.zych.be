package main

import (
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// splash typewriter timings, in animation frames (~24fps).
const (
	splashHoldFrames = 60 // fully-typed pause (~2.5s)
	splashGapFrames  = 8  // blank between taglines
)

// splashTaglineText returns the typewriter state of the cycling taglines for
// the given frame (frames since the tagline reveal began): type out, hold,
// erase, brief gap, then the next tagline — looping forever like the web home.
func splashTaglineText(taglines []string, frame int) string {
	if frame < 0 || len(taglines) == 0 {
		return ""
	}
	f := frame
	for {
		for _, t := range taglines {
			r := []rune(t)
			n := len(r)
			cycle := n + splashHoldFrames + n + splashGapFrames
			if f < cycle {
				switch {
				case f < n:
					return string(r[:f+1])
				case f < n+splashHoldFrames:
					return t
				case f < n+splashHoldFrames+n:
					return string(r[:n-(f-(n+splashHoldFrames))])
				default:
					return ""
				}
			}
			f -= cycle
		}
	}
}

// wordmarkView renders the home wordmark: a one-time light-sweep intro for the
// first frames, then settling into the solid wordmark. Shared "splash" intro
// now lives on the home screen itself.
func (m Model) wordmarkView(lines []string, frame int) string {
	if len(lines) == 0 {
		return ""
	}
	logoW := lipgloss.Width(lines[0])
	if frame > logoW+10 {
		return m.st.HomeWordmark.Render(strings.Join(lines, "\n"))
	}
	sweep := frame - 6 // start just left of the logo
	var b strings.Builder
	for i, line := range lines {
		col := 0
		for _, r := range line {
			st := m.st.SplashBase
			if r != ' ' {
				switch d := sweep - col; {
				case d == 0:
					st = m.st.SplashHot
				case d == 1 || d == -1:
					st = m.st.SplashGlow
				}
			}
			b.WriteString(st.Render(string(r)))
			col++
		}
		if i < len(lines)-1 {
			b.WriteString("\n")
		}
	}
	return b.String()
}
