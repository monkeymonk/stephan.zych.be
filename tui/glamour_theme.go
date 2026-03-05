package main

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/glamour/ansi"
)

// glamourStyle is a Glamour render theme matching the website's
// render-markdown.nvim look: coloured `#` heading prefixes, accent links,
// and theme-appropriate code blocks.
func (m Model) glamourStyle() ansi.StyleConfig {
	t := m.theme
	return ansi.StyleConfig{
		Document: ansi.StyleBlock{
			StylePrimitive: ansi.StylePrimitive{Color: sp(t.Text)},
			Margin:         up(0),
		},
		Paragraph: ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Color: sp(t.Text)}},
		Text:      ansi.StylePrimitive{Color: sp(t.Text)},

		BlockQuote: ansi.StyleBlock{
			StylePrimitive: ansi.StylePrimitive{Color: sp(t.Subtext0), Italic: bp(true)},
			Indent:         up(1),
			IndentToken:    sp("│ "),
		},

		Heading: ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Bold: bp(true)}},
		H1:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Prefix: " # ", Suffix: " ", Color: sp(t.Accent), BackgroundColor: sp(tintBase(t.Accent, t.Base, 0.20)), Bold: bp(true)}},
		H2:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Prefix: " ## ", Suffix: " ", Color: sp(t.Lavender), BackgroundColor: sp(tintBase(t.Lavender, t.Base, 0.18)), Bold: bp(true)}},
		H3:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Prefix: " ### ", Suffix: " ", Color: sp(t.Mauve), BackgroundColor: sp(tintBase(t.Mauve, t.Base, 0.16)), Bold: bp(true)}},
		H4:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Prefix: " #### ", Suffix: " ", Color: sp(t.Green), BackgroundColor: sp(tintBase(t.Green, t.Base, 0.14)), Bold: bp(true)}},
		H5:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Prefix: " ##### ", Suffix: " ", Color: sp(t.Teal), BackgroundColor: sp(tintBase(t.Teal, t.Base, 0.12)), Bold: bp(true)}},
		H6:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Prefix: " ###### ", Suffix: " ", Color: sp(t.Flamingo), BackgroundColor: sp(tintBase(t.Flamingo, t.Base, 0.12)), Bold: bp(true)}},

		Strong:        ansi.StylePrimitive{Color: sp(t.Text), Bold: bp(true)},
		Emph:          ansi.StylePrimitive{Color: sp(t.Subtext0), Italic: bp(true)},
		Strikethrough: ansi.StylePrimitive{CrossedOut: bp(true), Color: sp(t.Overlay0)},

		HorizontalRule: ansi.StylePrimitive{Color: sp(t.Surface2), Format: "\n─────────────────────\n"},

		Item:        ansi.StylePrimitive{BlockPrefix: "• ", Color: sp(t.Text)},
		Enumeration: ansi.StylePrimitive{BlockPrefix: ". ", Color: sp(t.Blue)},
		Task: ansi.StyleTask{
			StylePrimitive: ansi.StylePrimitive{},
			Ticked:         "✓ ",
			Unticked:       "□ ",
		},

		Link:     ansi.StylePrimitive{Color: sp(t.Blue), Underline: bp(true)},
		LinkText: ansi.StylePrimitive{Color: sp(t.Lavender), Bold: bp(true)},

		Image:     ansi.StylePrimitive{Color: sp(t.Blue), Underline: bp(true)},
		ImageText: ansi.StylePrimitive{Color: sp(t.Subtext0), Format: "🖼 {{.text}}"},

		Code: ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{
			Color:           sp(t.Green),
			BackgroundColor: sp(t.Surface0),
			Prefix:          " ",
			Suffix:          " ",
		}},
		CodeBlock: ansi.StyleCodeBlock{
			StyleBlock: ansi.StyleBlock{
				StylePrimitive: ansi.StylePrimitive{Color: sp(t.Text)},
				Margin:         up(0),
			},
			Theme: "catppuccin-mocha",
		},

		Table: ansi.StyleTable{
			StyleBlock:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Color: sp(t.Text)}},
			CenterSeparator: sp("┼"),
			ColumnSeparator: sp("│"),
			RowSeparator:    sp("─"),
		},

		DefinitionTerm:        ansi.StylePrimitive{Color: sp(t.Blue), Bold: bp(true)},
		DefinitionDescription: ansi.StylePrimitive{Color: sp(t.Subtext0)},
	}
}

// tintBase blends a hue with the given base background at the given alpha,
// approximating the web's translucent heading backgrounds.
func tintBase(hex, base string, alpha float64) string {
	r, g, b := hexRGB(hex)
	br, bg, bb := hexRGB(base)
	mix := func(baseC, c int) int { return int(float64(baseC)*(1-alpha) + float64(c)*alpha + 0.5) }
	return fmt.Sprintf("#%02x%02x%02x", mix(br, r), mix(bg, g), mix(bb, b))
}

// tint blends a hue with the Catppuccin base background at the given alpha,
// approximating the web's translucent heading backgrounds.
func tint(hex string, alpha float64) string {
	r, g, b := hexRGB(hex)
	const br, bg, bb = 0x1e, 0x1e, 0x2e // colBase #1e1e2e
	mix := func(base, c int) int { return int(float64(base)*(1-alpha) + float64(c)*alpha + 0.5) }
	return fmt.Sprintf("#%02x%02x%02x", mix(br, r), mix(bg, g), mix(bb, b))
}

func hexRGB(hex string) (int, int, int) {
	hex = strings.TrimPrefix(hex, "#")
	var r, g, b int
	fmt.Sscanf(hex, "%02x%02x%02x", &r, &g, &b)
	return r, g, b
}

// pointer helpers for the Glamour style structs
func sp(s string) *string { return &s }
func bp(b bool) *bool     { return &b }
func up(u uint) *uint     { return &u }
