package main

// The home banner's pause control (home.pause, space key) and the
// focus-driven blur guard (tea.BlurMsg / tea.FocusMsg) both gate on
// needsAnim/needsRotate the same way overlayConfirmQuit already did, so
// these tests exercise the same seams rotate_test.go does: needsAnim itself,
// the animMsg case's effect on homeFrame/bannerIndex, resolve() finding the
// space binding, and the Update cases for the two focus messages.

import (
	"testing"

	tea "github.com/charmbracelet/bubbletea"
)

// needsAnim: pausing the banner on the home screen turns animation off,
// exactly like leaving home or opening the quit prompt already does.
func TestNeedsAnimFalseWhenBannerPaused(t *testing.T) {
	m := Model{screen: screenHome, bannerPaused: true}
	if m.needsAnim() {
		t.Errorf("needsAnim() = true while bannerPaused, want false")
	}
	m.bannerPaused = false
	if !m.needsAnim() {
		t.Errorf("needsAnim() = false on home with bannerPaused unset, want true")
	}
}

// animMsg while paused must not advance homeFrame or the banner rotation:
// the whole point of pausing is that the frame driving both stays put.
func TestAnimMsgDoesNotAdvanceWhilePaused(t *testing.T) {
	m := Model{screen: screenHome, bannerPaused: true, homeFrame: 5, bannerIndex: 2}
	mdl, _ := m.Update(animMsg{})
	got := mdl.(Model)
	if got.homeFrame != 5 {
		t.Errorf("homeFrame = %d after animMsg while paused, want unchanged 5", got.homeFrame)
	}
	if got.bannerIndex != 2 {
		t.Errorf("bannerIndex = %d after animMsg while paused, want unchanged 2", got.bannerIndex)
	}
}

// space toggles bannerPaused via the keymap, the same path every other home
// key goes through (resolve() then the binding's run).
func TestHomePauseBindingTogglesViaResolve(t *testing.T) {
	m := Model{screen: screenHome, data: &SiteData{}}
	b, ok := resolve(m, tea.KeyMsg{Type: tea.KeySpace})
	if !ok {
		t.Fatalf("resolve() did not find a binding for space on the home screen")
	}
	mm, _ := b.run(m)
	if !mm.bannerPaused {
		t.Errorf("bannerPaused = false after running home.pause once, want true")
	}
	mm2, _ := b.run(mm)
	if mm2.bannerPaused {
		t.Errorf("bannerPaused = true after running home.pause twice, want false (toggled back)")
	}
}

// tea.BlurMsg: the terminal reporting a loss of focus turns needsAnim off
// immediately, regardless of screen or pause state.
func TestBlurMsgStopsAnim(t *testing.T) {
	m := Model{screen: screenHome, animating: true}
	mdl, _ := m.Update(tea.BlurMsg{})
	got := mdl.(Model)
	if !got.blurred {
		t.Errorf("blurred = false after BlurMsg, want true")
	}
	if got.needsAnim() {
		t.Errorf("needsAnim() = true after BlurMsg, want false")
	}
}

// tea.FocusMsg: regaining focus clears blurred and restarts the ticker (a
// non-nil cmd) when the current screen needs one, same as afterKey does for
// an ordinary key.
func TestFocusMsgRestartsTicker(t *testing.T) {
	m := Model{screen: screenHome, blurred: true}
	mdl, cmd := m.Update(tea.FocusMsg{})
	got := mdl.(Model)
	if got.blurred {
		t.Errorf("blurred = true after FocusMsg, want false")
	}
	if !got.animating {
		t.Errorf("animating = false after FocusMsg on home, want true")
	}
	if cmd == nil {
		t.Errorf("cmd = nil after FocusMsg on home, want a restarted animTick")
	}
}
