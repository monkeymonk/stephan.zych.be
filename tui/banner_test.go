package main

import (
	"math/rand/v2"
	"strings"
	"testing"

	"github.com/charmbracelet/lipgloss"
)

func testBannerData(t *testing.T) *SiteData {
	t.Helper()
	d := LoadData("../content", "../content/data")
	if len(d.StartScreen.Banner.Glyphs) == 0 {
		t.Fatal("no banner glyphs loaded from ../content/data/startScreen.json")
	}
	return d
}

// Every variant, at every supported stage size, must fill the stage exactly:
// rotation must never shift the tagline/menu below it.
func TestBannerVariantsFillStage(t *testing.T) {
	d := testBannerData(t)
	s := buildStyles(themes[defaultTheme])
	sizes := [][2]int{{56, 12}, {64, 16}, {80, 16}, {112, 16}, {64, 9}}
	for _, v := range bannerVariants {
		for _, sz := range sizes {
			ctx := newBannerCtx(d.StartScreen.Banner, d.StartScreen.Wordmark, &s, sz[0], sz[1], 42)
			for f := 0; f <= 400; f += 7 {
				lines := v.render(ctx, f)
				if len(lines) != sz[1] {
					t.Fatalf("%s %dx%d frame %d: %d lines, want %d", v.id, sz[0], sz[1], f, len(lines), sz[1])
				}
				for i, l := range lines {
					if w := lipgloss.Width(l); w != sz[0] {
						t.Fatalf("%s %dx%d frame %d line %d: width %d, want %d", v.id, sz[0], sz[1], f, i, w, sz[0])
					}
				}
			}
		}
	}
}

// The shared bitmap is 7 half-block lines of 54 cols, with the e acute's
// accent on the top line (glyph index 2: s, t, é).
func TestBannerArtFromContent(t *testing.T) {
	b := testBannerData(t).StartScreen.Banner
	art := halfBlock(wordBitmap(b, b.Word))
	if len(art) != 7 {
		t.Fatalf("art has %d lines, want 7", len(art))
	}
	for i, l := range art {
		if n := len([]rune(l)); n != 54 {
			t.Fatalf("art line %d is %d cols, want 54", i, n)
		}
	}
	step := b.GlyphCols + b.GlyphGap
	accent := []rune(art[0])[2*step : 2*step+b.GlyphCols]
	if strings.TrimSpace(string(accent)) == "" {
		t.Fatal("no accent above the e on the top art line")
	}
}

// The bag plays every variant once per cycle and never repeats back to back.
func TestBannerBagRotation(t *testing.T) {
	rng := rand.New(rand.NewPCG(1, 2))
	n := len(bannerVariants)
	for trial := 0; trial < 20; trial++ {
		idx, bag, _ := newBannerSession()
		seen := map[int]bool{idx: true}
		prev := idx
		for i := 1; i < 3*n; i++ {
			idx, bag = nextBannerVariant(bag, prev, rng)
			if idx == prev {
				t.Fatalf("variant %d repeated back to back", idx)
			}
			prev = idx
			seen[idx] = true
		}
		if len(seen) != n {
			t.Fatalf("only %d of %d variants played in 3 cycles", len(seen), n)
		}
	}
}

// The home screen must keep showing the menu with the banner in place.
func TestHomeViewWithBanner(t *testing.T) {
	d := testBannerData(t)
	for _, sz := range [][2]int{{120, 40}, {80, 24}, {60, 22}, {50, 20}} {
		m := NewModel(nil, d, nil, sz[0], sz[1])
		for i := 0; i < 600; i++ {
			m.homeFrame++
			m.advanceBanner()
			if i%50 == 0 {
				out := m.View()
				if lines := strings.Count(out, "\n") + 1; lines != sz[1] {
					t.Fatalf("%dx%d frame %d: view has %d lines, want %d", sz[0], sz[1], i, lines, sz[1])
				}
			}
		}
	}
}
