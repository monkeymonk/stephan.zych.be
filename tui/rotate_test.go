package main

// The neofetch identity card's rows are the one place rotation lives now: a
// row's value authored as a pipe-separated list in content/pages/about.md (front matter)
// (e.g. the Role row's "Application & Web Architect | Technical Lead |
// ...") cycles one item at a time — the TUI mirror of
// web/src/components/ui/sz-rotate.ts's own "|" split over a row rendered
// that way. These tests exercise splitting a row value into items
// (splitRotateItems), picking + padding the currently displayed item as
// rotateIndex advances (rotateItemAt, padRotateItem), the card itself
// staying a constant width across items (neofetchCard), detecting whether
// any row has something to cycle (identityHasRotatingRow), and the
// rotateMsg ticker gate (needsRotate). Wall-clock timing (rotateDwell,
// rotateTick) is deliberately not exercised here.

import (
	"strings"
	"testing"

	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/x/ansi"
)

// splitRotateItems: a plain "A | B | C" list, extra surrounding whitespace
// around items, HTML entities the author wrote (e.g. "&amp;") decoded to
// their literal character, a single item with no "|" at all, and an empty or
// whitespace-only value yielding no items — never a panic, never a
// one-element slice containing an empty string.
func TestSplitRotateItems(t *testing.T) {
	cases := []struct {
		name string
		in   string
		want []string
	}{
		{"simple pipe list", "Architect | Technical Lead | Developer", []string{"Architect", "Technical Lead", "Developer"}},
		{"extra spaces around items", "  Architect  |Technical Lead|   Developer   ", []string{"Architect", "Technical Lead", "Developer"}},
		{"html entity decoded", "Application &amp; Web Architect | Technical Lead", []string{"Application & Web Architect", "Technical Lead"}},
		{"single item, no pipe", "Technical Lead", []string{"Technical Lead"}},
		{"empty value", "", nil},
		{"whitespace-only value", "   ", nil},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := splitRotateItems(tc.in)
			if len(got) != len(tc.want) {
				t.Fatalf("splitRotateItems(%q) = %#v, want %#v", tc.in, got, tc.want)
			}
			for i := range got {
				if got[i] != tc.want[i] {
					t.Errorf("splitRotateItems(%q)[%d] = %q, want %q", tc.in, i, got[i], tc.want[i])
				}
			}
		})
	}
}

// rotateItemAt: the index selects items[index % len(items)], wrapping
// indefinitely as rotateIndex keeps advancing past len(items) — exercised at
// several indices spanning more than one full cycle.
func TestRotateItemAtAdvancesAndWraps(t *testing.T) {
	items := []string{"Application & Web Architect", "Technical Lead", "Fullstack Developer"}
	cases := []struct {
		name  string
		index int
		want  string
	}{
		{"index 0", 0, "Application & Web Architect"},
		{"index 1", 1, "Technical Lead"},
		{"index 2", 2, "Fullstack Developer"},
		{"wraps back to index 0", 3, "Application & Web Architect"},
		{"wraps to index 1", 4, "Technical Lead"},
		{"wraps several cycles later", 10, "Technical Lead"}, // 10 % 3 == 1
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := strings.TrimRight(rotateItemAt(items, tc.index), " ")
			if got != tc.want {
				t.Errorf("rotateItemAt(items, %d) = %q, want %q", tc.index, got, tc.want)
			}
		})
	}
}

// padRotateItem: every item in a set pads out to the exact same rune width —
// the width of the widest one — so swapping items on a rotateMsg tick never
// reflows the card.
func TestPadRotateItemConstantWidth(t *testing.T) {
	items := []string{"Lead", "Application & Web Architect", "PHP Dev"}
	want := len([]rune(items[1])) // the widest item, unpadded
	for _, it := range items {
		t.Run(it, func(t *testing.T) {
			padded := padRotateItem(it, items)
			if got := len([]rune(padded)); got != want {
				t.Errorf("padRotateItem(%q) width = %d, want %d", it, got, want)
			}
			if strings.TrimRight(padded, " ") != it {
				t.Errorf("padRotateItem(%q) = %q, want it padded with trailing spaces only", it, padded)
			}
		})
	}
}

// newNeofetchTestModel builds the minimal Model neofetchCard needs: styles
// (for the key/value/status rendering) and the identity rows under test.
func newNeofetchTestModel(rows [][]string) Model {
	if err := loadThemes("../content/data/themes.json"); err != nil {
		panic(err)
	}
	th := themes[defaultTheme]
	s := buildStyles(th)
	m := Model{theme: th, st: &s, data: &SiteData{}}
	m.data.Profile.Identity.User = "stephan@zych.be"
	m.data.Profile.Identity.Rows = rows
	return m
}

// neofetchCard: a multi-item row cycles through its items as rotateIndex
// advances and wraps, a pipe-free row renders unchanged regardless of
// rotateIndex, and the card's rendered width never changes across items —
// its border geometry must not grow and shrink every rotateDwell tick.
func TestNeofetchCardRotatesRowAndStaysConstantWidth(t *testing.T) {
	rows := [][]string{
		{"OS", "Brussels, Belgium"},
		{"Role", "Application & Web Architect | Technical Lead | Fullstack Developer"},
	}
	m := newNeofetchTestModel(rows)
	items := []string{"Application & Web Architect", "Technical Lead", "Fullstack Developer"}

	var widths []int
	for i := range len(items) * 2 { // more than one full cycle
		m.rotateIndex = i
		card := m.neofetchCard(200)
		plain := ansi.Strip(card)

		if want := items[i%len(items)]; !strings.Contains(plain, want) {
			t.Errorf("neofetchCard at rotateIndex %d = %q, want it to contain %q", i, plain, want)
		}
		if !strings.Contains(plain, "Brussels, Belgium") {
			t.Errorf("neofetchCard at rotateIndex %d = %q, want the pipe-free OS row unchanged", i, plain)
		}
		widths = append(widths, lipgloss.Width(card))
	}
	for i, w := range widths {
		if w != widths[0] {
			t.Errorf("neofetchCard width at rotateIndex %d = %d, want %d (constant across items)", i, w, widths[0])
		}
	}
}

// identityHasRotatingRow: nil rows, rows whose values are all pipe-free, and
// a malformed (too-short) row all report nothing to cycle; a single
// multi-item row among otherwise-static ones reports true.
func TestIdentityHasRotatingRow(t *testing.T) {
	cases := []struct {
		name string
		rows [][]string
		want bool
	}{
		{"no rows", nil, false},
		{"all static rows", [][]string{{"OS", "Brussels"}, {"Status", "available"}}, false},
		{"malformed row ignored, no rotating row", [][]string{{"Broken"}, {"OS", "Brussels"}}, false},
		{"one multi-item row among static ones", [][]string{{"OS", "Brussels"}, {"Role", "Architect | Lead"}}, true},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			if got := identityHasRotatingRow(tc.rows); got != tc.want {
				t.Errorf("identityHasRotatingRow(%+v) = %v, want %v", tc.rows, got, tc.want)
			}
		})
	}
}

// needsRotate: the home screen never ticks even when a row has something to
// cycle (the card isn't rendered there), a reader article whose body carries
// no neofetch widget marker never ticks, a reader with the marker but no
// rotating row doesn't either, a reader with the marker and a rotating row
// does, and the quit-prompt overlay always forces it off — the rotateMsg
// twin of needsAnim, same overlayConfirmQuit reasoning.
func TestNeedsRotate(t *testing.T) {
	marker := widgetPrefix + "neofetch" + widgetSuffix
	rotatingRows := [][]string{{"Role", "Architect | Lead"}}
	staticRows := [][]string{{"Role", "Architect"}}

	cases := []struct {
		name    string
		screen  screen
		overlay Overlay
		body    string
		rows    [][]string
		want    bool
	}{
		{"home screen never ticks, even with a rotating row", screenHome, overlayNone, marker, rotatingRows, false},
		{"reader, no neofetch marker in the body", screenReader, overlayNone, "just prose, no widget", rotatingRows, false},
		{"reader, marker present but no row has more than one item", screenReader, overlayNone, marker, staticRows, false},
		{"reader, marker present and a row has more than one item", screenReader, overlayNone, marker, rotatingRows, true},
		{"quit prompt forces it off", screenReader, overlayConfirmQuit, marker, rotatingRows, false},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			m := Model{
				screen:        tc.screen,
				overlay:       tc.overlay,
				readerArticle: Article{Body: tc.body},
				data:          &SiteData{},
			}
			m.data.Profile.Identity.Rows = tc.rows
			if got := m.needsRotate(); got != tc.want {
				t.Errorf("needsRotate() = %v, want %v (screen %v, body %q)", got, tc.want, tc.screen, tc.body)
			}
		})
	}
}
