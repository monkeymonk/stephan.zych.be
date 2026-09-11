package main

// Overlay is the TUI mirror of web/src/core/overlays.ts: exactly one transient
// surface owns the keyboard at a time. It replaces the independent
// paletteOpen/linksOpen booleans, whose only real invariant was "never both" —
// an invariant View() already assumed and Update() could not express.
//
// Keeping the two renderers structurally alike is the point: the same key
// opens the same surface and closes the same others on the web and over SSH.
type Overlay int

const (
	overlayNone Overlay = iota
	overlayPalette
	overlayLinks
	overlayConfirmQuit
)

// String names the overlay for the keymap's scope matching and for analytics.
func (o Overlay) String() string {
	switch o {
	case overlayPalette:
		return "palette"
	case overlayLinks:
		return "links"
	case overlayConfirmQuit:
		return "confirm-quit"
	default:
		return "none"
	}
}

// open reports whether any overlay owns the keyboard.
func (o Overlay) open() bool { return o != overlayNone }
