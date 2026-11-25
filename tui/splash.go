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

// wordmarkLines renders the home wordmark one styled line per input line: a
// one-time light-sweep intro for the first frames, then settling into the
// solid wordmark. Shared by wordmarkView and the "current" banner variant
// (banner.go), which centers these lines in the rotation stage instead of
// printing them as-is.
func wordmarkLines(lines []string, frame int, base, hot, glow, solid lipgloss.Style) []string {
	if len(lines) == 0 {
		return nil
	}
	logoW := lipgloss.Width(lines[0])
	if frame > logoW+10 {
		out := make([]string, len(lines))
		for i, l := range lines {
			out[i] = solid.Render(l)
		}
		return out
	}
	sweep := frame - 6 // start just left of the logo
	out := make([]string, len(lines))
	for i, line := range lines {
		var b strings.Builder
		col := 0
		for _, r := range line {
			st := base
			if r != ' ' {
				switch d := sweep - col; {
				case d == 0:
					st = hot
				case d == 1 || d == -1:
					st = glow
				}
			}
			b.WriteString(st.Render(string(r)))
			col++
		}
		out[i] = b.String()
	}
	return out
}

// wordmarkView renders the home wordmark: a one-time light-sweep intro for the
// first frames, then settling into the solid wordmark. Shared "splash" intro
// now lives on the home screen itself.
func (m Model) wordmarkView(lines []string, frame int) string {
	return strings.Join(wordmarkLines(lines, frame, m.st.SplashBase, m.st.SplashHot, m.st.SplashGlow, m.st.HomeWordmark), "\n")
}
