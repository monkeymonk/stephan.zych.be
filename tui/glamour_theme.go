package main

import "github.com/charmbracelet/glamour/ansi"

// catppuccinStyle is a Glamour render theme matching the website's
// render-markdown.nvim look: coloured `#` heading prefixes, accent links,
// and Catppuccin-Mocha code blocks.
func catppuccinStyle() ansi.StyleConfig {
	return ansi.StyleConfig{
		Document: ansi.StyleBlock{
			StylePrimitive: ansi.StylePrimitive{Color: sp(colText)},
			Margin:         up(0),
		},
		Paragraph: ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Color: sp(colText)}},
		Text:      ansi.StylePrimitive{Color: sp(colText)},

		BlockQuote: ansi.StyleBlock{
			StylePrimitive: ansi.StylePrimitive{Color: sp(colSubtext0), Italic: bp(true)},
			Indent:         up(1),
			IndentToken:    sp("│ "),
		},

		Heading: ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Bold: bp(true)}},
		H1:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Prefix: "# ", Color: sp(colMauve), Bold: bp(true)}},
		H2:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Prefix: "## ", Color: sp(colBlue), Bold: bp(true)}},
		H3:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Prefix: "### ", Color: sp(colGreen), Bold: bp(true)}},
		H4:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Prefix: "#### ", Color: sp(colPeach), Bold: bp(true)}},
		H5:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Prefix: "##### ", Color: sp(colYellow), Bold: bp(true)}},
		H6:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Prefix: "###### ", Color: sp(colTeal), Bold: bp(true)}},

		Strong:        ansi.StylePrimitive{Color: sp(colText), Bold: bp(true)},
		Emph:          ansi.StylePrimitive{Color: sp(colSubtext0), Italic: bp(true)},
		Strikethrough: ansi.StylePrimitive{CrossedOut: bp(true), Color: sp(colOverlay0)},

		HorizontalRule: ansi.StylePrimitive{Color: sp(colSurface2), Format: "\n─────────────────────\n"},

		Item:        ansi.StylePrimitive{BlockPrefix: "• ", Color: sp(colText)},
		Enumeration: ansi.StylePrimitive{BlockPrefix: ". ", Color: sp(colBlue)},
		Task: ansi.StyleTask{
			StylePrimitive: ansi.StylePrimitive{},
			Ticked:         "✓ ",
			Unticked:       "□ ",
		},

		Link:     ansi.StylePrimitive{Color: sp(colBlue), Underline: bp(true)},
		LinkText: ansi.StylePrimitive{Color: sp(colLavender), Bold: bp(true)},

		Image:     ansi.StylePrimitive{Color: sp(colBlue), Underline: bp(true)},
		ImageText: ansi.StylePrimitive{Color: sp(colSubtext0), Format: "🖼 {{.text}}"},

		Code: ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{
			Color:           sp(colGreen),
			BackgroundColor: sp(colSurface0),
			Prefix:          " ",
			Suffix:          " ",
		}},
		CodeBlock: ansi.StyleCodeBlock{
			StyleBlock: ansi.StyleBlock{
				StylePrimitive: ansi.StylePrimitive{Color: sp(colText)},
				Margin:         up(2),
			},
			Theme: "catppuccin-mocha",
		},

		Table: ansi.StyleTable{
			StyleBlock:      ansi.StyleBlock{StylePrimitive: ansi.StylePrimitive{Color: sp(colText)}},
			CenterSeparator: sp("┼"),
			ColumnSeparator: sp("│"),
			RowSeparator:    sp("─"),
		},

		DefinitionTerm:        ansi.StylePrimitive{Color: sp(colBlue), Bold: bp(true)},
		DefinitionDescription: ansi.StylePrimitive{Color: sp(colSubtext0)},
	}
}

// pointer helpers for the Glamour style structs
func sp(s string) *string { return &s }
func bp(b bool) *bool     { return &b }
func up(u uint) *uint     { return &u }
