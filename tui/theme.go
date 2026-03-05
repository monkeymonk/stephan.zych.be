package main

// Theme is a full colour palette. Switching themes rebuilds a session's Styles.
type Theme struct {
	Base, Mantle, Crust                       string
	Text, Subtext1, Subtext0                  string
	Overlay1, Overlay0                        string
	Surface2, Surface1, Surface0              string
	Blue, Lavender, Sky, Teal, Green, Yellow  string
	Peach, Maroon, Red, Mauve, Pink, Flamingo string
	Accent                                    string
	Swatches                                  []string // neofetch/bar swatch row
}

var catppuccinMocha = Theme{
	Base: "#1e1e2e", Mantle: "#181825", Crust: "#11111b",
	Text: "#cdd6f4", Subtext1: "#bac2de", Subtext0: "#a6adc8",
	Overlay1: "#7f849c", Overlay0: "#6c7086",
	Surface2: "#585b70", Surface1: "#45475a", Surface0: "#313244",
	Blue: "#89b4fa", Lavender: "#b4befe", Sky: "#89dceb", Teal: "#94e2d5",
	Green: "#a6e3a1", Yellow: "#f9e2af", Peach: "#fab387", Maroon: "#eba0ac",
	Red: "#f38ba8", Mauve: "#cba6f7", Pink: "#f5c2e7", Flamingo: "#f2cdcd",
	Accent: "#89b4fa",
	Swatches: []string{"#f38ba8", "#fab387", "#f9e2af", "#a6e3a1", "#94e2d5", "#89b4fa", "#cba6f7", "#b4befe"},
}

var gruvboxDark = Theme{
	Base: "#282828", Mantle: "#1d2021", Crust: "#1d2021",
	Text: "#ebdbb2", Subtext1: "#d5c4a1", Subtext0: "#bdae93",
	Overlay1: "#928374", Overlay0: "#7c6f64",
	Surface2: "#665c54", Surface1: "#504945", Surface0: "#3c3836",
	Blue: "#83a598", Lavender: "#83a598", Sky: "#83a598", Teal: "#8ec07c",
	Green: "#b8bb26", Yellow: "#fabd2f", Peach: "#fe8019", Maroon: "#cc241d",
	Red: "#fb4934", Mauve: "#d3869b", Pink: "#d3869b", Flamingo: "#fb4934",
	Accent: "#83a598",
	Swatches: []string{"#fb4934", "#fe8019", "#fabd2f", "#b8bb26", "#8ec07c", "#83a598", "#d3869b", "#83a598"},
}

var tokyoNight = Theme{
	Base: "#1a1b26", Mantle: "#16161e", Crust: "#16161e",
	Text: "#c0caf5", Subtext1: "#a9b1d6", Subtext0: "#9aa5ce",
	Overlay1: "#6b7394", Overlay0: "#565f89",
	Surface2: "#545c7e", Surface1: "#3b4261", Surface0: "#292e42",
	Blue: "#7aa2f7", Lavender: "#7dcfff", Sky: "#7dcfff", Teal: "#73daca",
	Green: "#9ece6a", Yellow: "#e0af68", Peach: "#ff9e64", Maroon: "#db4b4b",
	Red: "#f7768e", Mauve: "#bb9af7", Pink: "#bb9af7", Flamingo: "#f7768e",
	Accent: "#7aa2f7",
	Swatches: []string{"#f7768e", "#ff9e64", "#e0af68", "#9ece6a", "#73daca", "#7aa2f7", "#bb9af7", "#7dcfff"},
}

var themes = map[string]Theme{
	"catppuccin-mocha": catppuccinMocha,
	"gruvbox-dark":     gruvboxDark,
	"tokyonight":       tokyoNight,
}

// themeOrder is the cycle order for the :colorscheme command.
var themeOrder = []string{"catppuccin-mocha", "gruvbox-dark", "tokyonight"}
