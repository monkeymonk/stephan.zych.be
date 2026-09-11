package main

import (
	"github.com/charmbracelet/bubbles/key"
	tea "github.com/charmbracelet/bubbletea"
)

// Keybinding registry — the TUI mirror of web/src/core/keymap.ts, and the
// single place a key's meaning is decided.
//
// Before this, key handling was spread across Update (the global prefixes and
// the nav-tab letters), updateHome, updateList, updateReader, updatePalette and
// updateLinks, with a hand-maintained help table in commands.go that had
// already drifted from it ("esc / h / q → back", while `q` on the home screen
// quit outright). Every binding now declares where it applies, and the help
// screen is generated from this table, so the documentation cannot drift from
// the behaviour again.
//
// Scoping mirrors the web's tiers: an overlay's bindings win while it owns the
// keyboard, `scopeAlways` bindings (esc, ctrl+c) are never suppressed, and
// screen-scoped bindings act only on the screens they name.

// screenSet is a bitmask of screens a binding applies to. screenAny means
// every screen.
type screenSet uint8

const (
	setHome screenSet = 1 << iota
	setList
	setReader
	setHelp
	setEffect

	screenAny screenSet = setHome | setList | setReader | setHelp | setEffect
)

// has reports whether s is in the set.
func (ss screenSet) has(s screen) bool {
	return ss&(1<<uint(s)) != 0
}

// scope decides when a binding is eligible, independent of which screen is
// showing.
type scope int

const (
	// scopeScreen: only when no overlay owns the keyboard.
	scopeScreen scope = iota
	// scopeOverlay: only while the named overlay owns the keyboard.
	scopeOverlay
	// scopeAlways: regardless of overlay state (esc, ctrl+c).
	scopeAlways
)

// binding is one declared keystroke. Help text lives on key.Binding so the
// help view and content/data/shortcuts.json can be cross-checked against the
// same source.
type binding struct {
	id      string
	keys    key.Binding
	scope   scope
	overlay Overlay   // meaningful when scope == scopeOverlay
	screens screenSet // meaningful when scope == scopeScreen

	// when is an optional extra guard (e.g. the reader's link picker only
	// opens when the article actually has links).
	when func(m Model) bool

	// run performs the action. It returns the updated model, so bindings stay
	// pure functions of Model like every other Update path here.
	run func(m Model) (Model, tea.Cmd)
}

// keymap is the ordered binding table. Order matters only between bindings
// that could both match; resolve returns the first.
func keymap() []binding {
	return keyTable
}

// keyTable is built once. resolve walks it on every keystroke, and Update
// copies Model by value on every keystroke too; rebuilding thirty-odd bindings
// per key would be garbage for nothing.
//
// resolve walks the tiers narrowest-first and only breaks a tie inside a tier
// by table order, so the table reads top to bottom as "what beats what": the
// keys nothing may suppress, then the overlay that owns the keyboard, then the
// screen underneath it.
var keyTable = []binding{
	// --- always: nothing suppresses these ---------------------------------
	{
		id:    "app.quit",
		keys:  key.NewBinding(key.WithKeys("ctrl+c"), key.WithHelp("ctrl+c", "disconnect immediately")),
		scope: scopeAlways,
		// was: model.go:808, a normal-mode case that the palette (which closed
		// on ctrl+c), the link picker (which swallowed every key it did not
		// name) and the effect screen (any key dismissed it) each got to eat
		// first. Disconnecting is not a screen's decision, so it is the first
		// row of the first tier and nothing below it can take the key.
		run: func(m Model) (Model, tea.Cmd) {
			return m, tea.Quit
		},
	},
	{
		id:    "effect.dismiss",
		keys:  key.NewBinding(key.WithKeys(keyAny)),
		scope: scopeAlways,
		// was: model.go:800-804. A running effect is the web's `layer`: it owns
		// every key except the one that disconnects. It has to sit above esc
		// for the same reason the web registers an Escape twin here — esc
		// would otherwise pop history and navigate away with the effect still
		// painting the screen.
		when: func(m Model) bool { return m.screen == screenEffect },
		run: func(m Model) (Model, tea.Cmd) {
			m.screen = m.effectPrev
			m.effect = ""
			return m, nil
		},
	},
	{
		id:    "nav.back.escape",
		keys:  key.NewBinding(key.WithKeys("esc")),
		scope: scopeAlways,
		// esc means one thing everywhere, as on the web: close the overlay,
		// else pop the history stack, else ask before disconnecting. The web's
		// overlay.escape carries a `when: isModalOpen()` so a lower tier can
		// answer the no-modal case; here that case is the second and third
		// step of back(), so there is nothing to fall through to.
		run: Model.back,
	},
	{
		id:    "palette.command",
		keys:  key.NewBinding(key.WithKeys(":"), key.WithHelp(":", "command palette")),
		scope: scopeAlways,
		// was: model.go:810, a normal-mode case, so the link picker swallowed
		// it. The three prefixes are the web's `global` tier: an opener has to
		// be able to displace another overlay, because claiming the slot is
		// how one overlay closes another.
		when: keyboardFree,
		run: func(m Model) (Model, tea.Cmd) {
			return m.unwrap(m.openPalette(":"))
		},
	},
	{
		id:    "palette.search",
		keys:  key.NewBinding(key.WithKeys("/"), key.WithHelp("/", "search all content")),
		scope: scopeAlways,
		// was: model.go:812, like palette.command.
		when: keyboardFree,
		run: func(m Model) (Model, tea.Cmd) {
			return m.unwrap(m.openPalette("/"))
		},
	},
	{
		id:    "help.open",
		keys:  key.NewBinding(key.WithKeys("?"), key.WithHelp("?", "toggle this help")),
		scope: scopeAlways,
		// was: model.go:814, which let help be opened from inside help: the
		// old one-slot back target then pointed at help itself and esc could
		// only re-enter it. Help is not a place you navigate to from help, and
		// that is knowable without acting, so it is a `when` — the key is not
		// this binding's while help is up, and nothing narrower claims it.
		when: func(m Model) bool { return keyboardFree(m) && m.screen != screenHelp },
		run: func(m Model) (Model, tea.Cmd) {
			m.openHelp()
			return m, nil
		},
	},

	// --- overlay: command palette (palette.go:115-152) --------------------
	//
	// Anything not listed here stays unresolved: Update forwards the keystroke
	// to the textinput, and run takes a Model and no message. esc and ctrl+c
	// are absent because they are `always` now — the palette no longer holds a
	// private meaning for either.
	{
		id:      "palette.accept",
		keys:    key.NewBinding(key.WithKeys("enter")),
		scope:   scopeOverlay,
		overlay: overlayPalette,
		// was: palette.go:122
		run: func(m Model) (Model, tea.Cmd) {
			items := m.paletteFiltered()
			if len(items) > 0 && m.cursor < len(items) {
				m = m.closeOverlay()
				// One statement, as palette.go:126 writes it: the item's action
				// mutates through the pointer, so the Model has to be read
				// after the call. gc evaluates the call first; the spec leaves
				// that operand order unspecified.
				return m, items[m.cursor].action(&m)
			}
			return m, nil
		},
	},
	{
		id:      "palette.complete",
		keys:    key.NewBinding(key.WithKeys("tab"), key.WithHelp("tab", "autocomplete the selection")),
		scope:   scopeOverlay,
		overlay: overlayPalette,
		// was: palette.go:129
		run: func(m Model) (Model, tea.Cmd) {
			items := m.paletteFiltered()
			if len(items) > 0 && m.cursor < len(items) {
				m.input.SetValue(items[m.cursor].label)
				m.input.CursorEnd()
			}
			return m, nil
		},
	},
	{
		id:      "palette.move.up",
		keys:    key.NewBinding(key.WithKeys("up", "ctrl+p", "ctrl+k")),
		scope:   scopeOverlay,
		overlay: overlayPalette,
		// was: palette.go:136
		run: func(m Model) (Model, tea.Cmd) {
			if m.cursor > 0 {
				m.cursor--
			}
			return m, nil
		},
	},
	{
		id:      "palette.move.down",
		keys:    key.NewBinding(key.WithKeys("down", "ctrl+n", "ctrl+j")),
		scope:   scopeOverlay,
		overlay: overlayPalette,
		// was: palette.go:141
		run: func(m Model) (Model, tea.Cmd) {
			if m.cursor < len(m.paletteFiltered())-1 {
				m.cursor++
			}
			return m, nil
		},
	},

	// --- overlay: in-article link picker (links.go:169-193) ---------------
	//
	// The picker used to swallow every key it did not name, which is what made
	// ctrl+c and the palette prefixes dead while it was open. It claims only
	// its own keys now; anything else reaches a wider tier or nothing at all.
	// esc is `always`, and closing is what back() does with an overlay open,
	// so this row keeps only the two picker-specific spellings.
	{
		id:      "links.close",
		keys:    key.NewBinding(key.WithKeys("q", "l")),
		scope:   scopeOverlay,
		overlay: overlayLinks,
		// was: links.go:171
		run: func(m Model) (Model, tea.Cmd) {
			return m.closeOverlay(), nil
		},
	},
	{
		id:      "links.move.up",
		keys:    key.NewBinding(key.WithKeys("up", "k")),
		scope:   scopeOverlay,
		overlay: overlayLinks,
		// was: links.go:174
		run: func(m Model) (Model, tea.Cmd) {
			if m.linkCursor > 0 {
				m.linkCursor--
			}
			return m, nil
		},
	},
	{
		id:      "links.move.down",
		keys:    key.NewBinding(key.WithKeys("down", "j")),
		scope:   scopeOverlay,
		overlay: overlayLinks,
		// was: links.go:178
		run: func(m Model) (Model, tea.Cmd) {
			if m.linkCursor < len(m.readerLinks)-1 {
				m.linkCursor++
			}
			return m, nil
		},
	},
	{
		id:      "links.first",
		keys:    key.NewBinding(key.WithKeys("g")),
		scope:   scopeOverlay,
		overlay: overlayLinks,
		// was: links.go:182
		run: func(m Model) (Model, tea.Cmd) {
			m.linkCursor = 0
			return m, nil
		},
	},
	{
		id:      "links.last",
		keys:    key.NewBinding(key.WithKeys("G")),
		scope:   scopeOverlay,
		overlay: overlayLinks,
		// was: links.go:184
		run: func(m Model) (Model, tea.Cmd) {
			m.linkCursor = len(m.readerLinks) - 1
			return m, nil
		},
	},
	{
		id:      "links.follow",
		keys:    key.NewBinding(key.WithKeys("enter")),
		scope:   scopeOverlay,
		overlay: overlayLinks,
		// was: links.go:186. The picker closes before the link is followed, so
		// the location openReader records is the article the link was followed
		// from — which is where `q` goes back to.
		run: func(m Model) (Model, tea.Cmd) {
			if m.linkCursor >= 0 && m.linkCursor < len(m.readerLinks) {
				l := m.readerLinks[m.linkCursor]
				m = m.closeOverlay()
				return m.unwrap(m.followLink(l))
			}
			return m, nil
		},
	},

	// --- overlay: quit confirmation (model.go, back() at the root) --------
	//
	// The prompt is the whole of what reads the answer. Every other key
	// resolves to nothing while it is up: the screen tier is suppressed by an
	// open overlay, and Update forwards an unclaimed key only to the palette's
	// input or the reader's viewport, neither of which is showing. esc is
	// absent here for the usual reason — it is `always`, and back() with an
	// overlay open closes it, which is exactly the cancel.
	{
		id:      "quit.confirm",
		keys:    key.NewBinding(key.WithKeys("y", "enter"), key.WithHelp("y / ⏎", "disconnect")),
		scope:   scopeOverlay,
		overlay: overlayConfirmQuit,
		run: func(m Model) (Model, tea.Cmd) {
			return m, tea.Quit
		},
	},
	{
		id:      "quit.cancel",
		keys:    key.NewBinding(key.WithKeys("n", "q"), key.WithHelp("n / esc / q", "stay")),
		scope:   scopeOverlay,
		overlay: overlayConfirmQuit,
		// `q` cancels as well as asks. It is the key the hand is already on,
		// and the one press a user repeats when a screen does not seem to have
		// reacted; reading the repeat as "yes" would disconnect them for
		// pressing back twice.
		run: func(m Model) (Model, tea.Cmd) {
			return m.closeOverlay(), nil
		},
	},

	// --- screens ----------------------------------------------------------
	{
		id:      navTabsID,
		scope:   scopeScreen,
		screens: screenAny,
		// was: model.go:819-824. A placeholder with no keys: the nav-tab
		// letters come from content/data/nav.json, so resolve expands this row
		// from the Model (see matchNavTab). The row holds the position rather
		// than the keys, because a nav key that grew into a collision with `j`
		// or `q` would change meaning if it were tested after the screens.
	},
	{
		id:      "nav.back",
		keys:    key.NewBinding(key.WithKeys("q"), key.WithHelp("esc / h / q", "close overlay, else back, else ask to disconnect")),
		scope:   scopeScreen,
		screens: screenAny,
		// `q` is back on every screen, home included — it used to disconnect
		// there, with no confirmation and no other screen agreeing with it,
		// while the help table said "back". back() resolves the rest: with an
		// empty stack, home's back is the quit confirmation.
		run: Model.back,
	},

	// --- screen: home (model.go:860-883) ----------------------------------
	{
		id:      "home.move.up",
		keys:    key.NewBinding(key.WithKeys("up", "k")),
		scope:   scopeScreen,
		screens: setHome,
		// was: model.go:863
		run: func(m Model) (Model, tea.Cmd) {
			if m.cursor > 0 {
				m.cursor--
			}
			return m, nil
		},
	},
	{
		id:      "home.move.down",
		keys:    key.NewBinding(key.WithKeys("down", "j")),
		scope:   scopeScreen,
		screens: setHome,
		// was: model.go:867
		run: func(m Model) (Model, tea.Cmd) {
			if m.cursor < len(m.homeLinks())-1 {
				m.cursor++
			}
			return m, nil
		},
	},
	{
		id:      "home.first",
		keys:    key.NewBinding(key.WithKeys("g")),
		scope:   scopeScreen,
		screens: setHome,
		// was: model.go:871
		run: func(m Model) (Model, tea.Cmd) {
			m.cursor = 0
			return m, nil
		},
	},
	{
		id:      "home.last",
		keys:    key.NewBinding(key.WithKeys("G")),
		scope:   scopeScreen,
		screens: setHome,
		// was: model.go:873
		run: func(m Model) (Model, tea.Cmd) {
			m.cursor = len(m.homeLinks()) - 1
			return m, nil
		},
	},
	{
		id:      "home.open",
		keys:    key.NewBinding(key.WithKeys("enter", "l", "right")),
		scope:   scopeScreen,
		screens: setHome,
		// was: model.go:877
		run: func(m Model) (Model, tea.Cmd) {
			links := m.homeLinks()
			if m.cursor >= 0 && m.cursor < len(links) {
				return m.unwrap(m.gotoTab(links[m.cursor].name))
			}
			return m, nil
		},
	},

	// --- screen: list (model.go:945-968) ----------------------------------
	{
		id:      "list.move.up",
		keys:    key.NewBinding(key.WithKeys("up", "k"), key.WithHelp("j / k  ·  ↑ / ↓", "move")),
		scope:   scopeScreen,
		screens: setList,
		// was: model.go:947. The help row is per action, not per keystroke, so
		// it names both halves of the pair and its twin carries no help text.
		run: func(m Model) (Model, tea.Cmd) {
			if m.cursor > 0 {
				m.cursor--
			}
			return m, nil
		},
	},
	{
		id:      "list.move.down",
		keys:    key.NewBinding(key.WithKeys("down", "j")),
		scope:   scopeScreen,
		screens: setList,
		// was: model.go:951
		run: func(m Model) (Model, tea.Cmd) {
			if m.cursor < len(m.listItems)-1 {
				m.cursor++
			}
			return m, nil
		},
	},
	{
		id:      "list.first",
		keys:    key.NewBinding(key.WithKeys("g"), key.WithHelp("g / G", "jump to top / bottom")),
		scope:   scopeScreen,
		screens: setList,
		// was: model.go:955
		run: func(m Model) (Model, tea.Cmd) {
			m.cursor = 0
			return m, nil
		},
	},
	{
		id:      "list.last",
		keys:    key.NewBinding(key.WithKeys("G")),
		scope:   scopeScreen,
		screens: setList,
		// was: model.go:957
		run: func(m Model) (Model, tea.Cmd) {
			m.cursor = len(m.listItems) - 1
			return m, nil
		},
	},
	{
		id:      "list.back",
		keys:    key.NewBinding(key.WithKeys("backspace", "h", "left")),
		scope:   scopeScreen,
		screens: setList,
		// was: model.go:959, which sent every list home regardless of where it
		// was opened from. These are the alternative spellings of back; `q`
		// and esc reach back() through their own rows, and all four land in
		// the same place because there is only one implementation.
		run: Model.back,
	},
	{
		id:      "list.open",
		keys:    key.NewBinding(key.WithKeys("enter", "l", "right"), key.WithHelp("enter / l", "open")),
		scope:   scopeScreen,
		screens: setList,
		// was: model.go:962
		run: func(m Model) (Model, tea.Cmd) {
			if len(m.listItems) > 0 {
				m.openReader(m.listItems[m.cursor])
			}
			return m, nil
		},
	},

	// --- screen: reader (model.go:970-997) --------------------------------
	//
	// updateReader ended by handing the key to the viewport, so the scroll keys
	// (j, k, d, u, pgup…) are the viewport's own and are deliberately absent:
	// Update forwards anything this table leaves unresolved.
	{
		id:      "reader.back",
		keys:    key.NewBinding(key.WithKeys("backspace", "h", "left")),
		scope:   scopeScreen,
		screens: setReader,
		// was: model.go:972, which read the single m.prev field — overwritten
		// by openReader with the screen the *new* article was opened from, so
		// following an in-article link left it pointing at the reader the user
		// was already in. The stack records the article instead.
		run: Model.back,
	},
	{
		id:      "reader.links",
		keys:    key.NewBinding(key.WithKeys("l")),
		scope:   scopeScreen,
		screens: setReader,
		// was: model.go:975. The guard is a `when`, not a check inside run: an
		// article with no links has to leave `l` unresolved so Update still
		// hands it to the viewport, exactly as the fall-through did.
		when: func(m Model) bool { return len(m.readerLinks) > 0 },
		run: func(m Model) (Model, tea.Cmd) {
			m.overlay = overlayLinks
			m.linkCursor = 0
			return m, nil
		},
	},
	{
		id:      "reader.next",
		keys:    key.NewBinding(key.WithKeys("]")),
		scope:   scopeScreen,
		screens: setReader,
		// was: model.go:981
		run: func(m Model) (Model, tea.Cmd) {
			if _, next := m.readerNeighbors(); next != nil {
				m.openReader(*next)
			}
			return m, nil
		},
	},
	{
		id:      "reader.prev",
		keys:    key.NewBinding(key.WithKeys("["), key.WithHelp("[ / ]", "prev / next article")),
		scope:   scopeScreen,
		screens: setReader,
		// was: model.go:986
		run: func(m Model) (Model, tea.Cmd) {
			if prev, _ := m.readerNeighbors(); prev != nil {
				m.openReader(*prev)
			}
			return m, nil
		},
	},
	{
		id:      "reader.copy",
		keys:    key.NewBinding(key.WithKeys("y")),
		scope:   scopeScreen,
		screens: setReader,
		// was: model.go:991
		run: func(m Model) (Model, tea.Cmd) {
			return m.unwrap(m.copyURL(m.data.Site.URL + articlePath(m.readerArticle)))
		},
	},

	// --- screen: help (model.go:833-836) ----------------------------------
	{
		id:      "help.back",
		keys:    key.NewBinding(key.WithKeys("h")),
		scope:   scopeScreen,
		screens: setHelp,
		// was: model.go:833. Narrower than list.back and reader.back —
		// backspace and ← do not leave the help screen.
		run: Model.back,
	},
}

// resolve finds the binding that should handle msg for the model's current
// screen and overlay. It is pure: no Model mutation, no I/O, so the
// verification harness can drive it directly.
func resolve(m Model, msg tea.KeyMsg) (binding, bool) {
	cur := m.overlay
	for _, tier := range scopeTiers {
		for _, b := range keyTable {
			if b.scope != tier || !b.eligible(m, cur) {
				continue
			}
			if b.id == navTabsID {
				if nb, ok := matchNavTab(m, msg); ok {
					return nb, true
				}
				continue
			}
			if !b.matches(msg) {
				continue
			}
			// `when` last: a binding that declines here is not a match, so the
			// next tier still gets asked.
			if b.when != nil && !b.when(m) {
				continue
			}
			return b, true
		}
	}
	return binding{}, false
}

// helpDocIDs is the help screen's running order. It names rows, not text: the
// key and description live on the binding itself, so a renamed id loses a row
// instead of describing keys that do something else, which is the half of the
// old drift that actually misled anyone.
var helpDocIDs = []string{
	"list.move.up",     // j / k  ·  ↑ / ↓
	"list.first",       // g / G
	"list.open",        // enter / l
	"reader.prev",      // [ / ]
	"nav.back",         // esc / h / q
	"app.quit",         // ctrl+c — the other way out, next to the one that asks
	"palette.command",  // :
	"palette.search",   // /
	"palette.complete", // tab
	"help.open",        // ?
}

// helpBindings returns the documented bindings, in help-screen order. It is
// what renderHelp builds the Keys section from; the hand-written table it
// replaced is deleted, not kept as a fallback — a second source of truth for
// what a key does is the whole defect.
func helpBindings() []binding {
	out := make([]binding, 0, len(helpDocIDs))
	for _, id := range helpDocIDs {
		for _, b := range keyTable {
			if b.id == id {
				out = append(out, b)
				break
			}
		}
	}
	return out
}

// --- matching internals ---------------------------------------------------

// keyAny matches any keystroke. A running effect is dismissed by *any* key,
// which key.Binding cannot say: a Binding with no keys reports
// Enabled() == false, so key.Matches never fires for it. The sentinel is not a
// string tea.KeyMsg.String() produces for a keypress, and it is only ever a
// tier's catch-all, so even a bracketed paste that stringified to it would
// resolve to the binding it already matches.
const keyAny = "any key"

// navTabsID marks the row resolve expands into the nav-tab letters. It carries
// no keys of its own: theirs come from content/data/nav.json, and the corpus is
// never transcribed into Go.
const navTabsID = "nav.tab"

// scopeTiers is the specificity order, narrowest first: the keys nothing may
// suppress, then the overlay that owns the keyboard, then the screen under it.
var scopeTiers = [...]scope{scopeAlways, scopeOverlay, scopeScreen}

// keyboardFree reports that no text field owns the keyboard. It is the guard
// the three palette prefixes carry, and it is the whole of the web's `global`
// tier: `:` `/` `?` must be able to displace the link picker, but inside the
// palette they are ordinary characters its input has to receive.
func keyboardFree(m Model) bool { return m.overlay != overlayPalette }

// eligible reports whether the binding's scope admits it at all, before any key
// is compared. cur is passed in so one resolve pass derives it once.
func (b binding) eligible(m Model, cur Overlay) bool {
	switch b.scope {
	case scopeAlways:
		return true
	case scopeOverlay:
		return cur.open() && b.overlay == cur
	default:
		return !cur.open() && b.screens.has(m.screen)
	}
}

// matches compares the keystroke. key.Matches is case-sensitive, which the
// table depends on: `G` and `g` are different bindings everywhere.
func (b binding) matches(msg tea.KeyMsg) bool {
	for _, k := range b.keys.Keys() {
		if k == keyAny {
			return true
		}
	}
	return key.Matches(msg, b.keys)
}

// matchNavTab answers for the nav-tab letters, which are content-driven and so
// cannot be written into keyTable. The comparison is the raw string compare
// Update used (model.go:821), not key.Matches, because the key is data.
func matchNavTab(m Model, msg tea.KeyMsg) (binding, bool) {
	for _, lk := range m.homeLinks() {
		if msg.String() != lk.key {
			continue
		}
		name := lk.name
		return binding{
			id:      navTabsID + "." + name,
			keys:    key.NewBinding(key.WithKeys(lk.key)),
			scope:   scopeScreen,
			screens: screenAny,
			run: func(m Model) (Model, tea.Cmd) {
				return m.unwrap(m.gotoTab(name))
			},
		}, true
	}
	return binding{}, false
}

// unwrap converts the (tea.Model, tea.Cmd) pair today's handlers return into
// the concrete pair a binding's run yields. gotoTab, openPalette, copyURL and
// followLink all predate this table and all return the interface. It is a
// method so the call can be spread as the sole argument — Go admits a
// multi-value call nowhere else. The assertion cannot fail (every one of them
// returns the Model it was handed); falling back to the receiver keeps a future
// one that doesn't from discarding the keystroke's state silently.
func (m Model) unwrap(model tea.Model, cmd tea.Cmd) (Model, tea.Cmd) {
	if mm, ok := model.(Model); ok {
		return mm, cmd
	}
	return m, cmd
}
