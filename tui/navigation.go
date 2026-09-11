package main

// Navigation history. The TUI used to remember where "back" went in two scalar
// fields — Model.prev (the reader's back target) and Model.returnTo (help's) —
// which could each hold one screen and no context. Two bugs fell straight out
// of that:
//
//   - Following an in-article link called openReader(a, m.screen) with
//     m.screen == screenReader, so `q` on the new article "returned" to the
//     reader the user was already in: a dead key.
//   - Pressing `?` while help was open set returnTo = screenHelp, so `q` and
//     esc could never leave help again.
//
// A location stack fixes both by construction: `q`/esc close an overlay if one
// is open, else pop, else (empty stack) confirm quit.

// historyLimit bounds the stack. Deep enough that a real reading session never
// hits it, shallow enough that a Model copy stays cheap — Update takes Model by
// value, so this slice is copied on every keystroke.
const historyLimit = 32

// location is a restorable position in the TUI: which screen, and everything
// needed to rebuild it. Article identity is stored as section+slug rather than
// as an Article value so a content reload cannot resurrect a stale body.
type location struct {
	screen screen

	// list state (screenList)
	listKind  string
	listTitle string

	// reader state (screenReader)
	articleSection string
	articleSlug    string
	readerOffset   int

	// cursor position to restore on the list/home screens
	cursor int
}

// history is the back stack. The zero value is ready to use.
type history struct {
	stack []location
}

// push records where the user is leaving from. Consecutive identical locations
// collapse, so `]`-walking a series does not fill the stack with one article.
func (h *history) push(loc location) {
	if n := len(h.stack); n > 0 && h.stack[n-1] == loc {
		return
	}
	h.stack = append(h.stack, loc)
	if len(h.stack) > historyLimit {
		// Drop the oldest by shifting down rather than by re-slicing the front
		// away: re-slicing walks the header forward through the backing array
		// until append has to grow a fresh one, so a long session reallocates
		// every historyLimit navigations. Shifting pins cap at historyLimit for
		// the life of the session.
		copy(h.stack, h.stack[1:])
		h.stack = h.stack[:historyLimit]
	}
}

// pop removes and returns the most recent location. ok is false when empty,
// which is the signal to fall through to the root behaviour (confirm quit).
func (h *history) pop() (loc location, ok bool) {
	n := len(h.stack)
	if n == 0 {
		return location{}, false
	}
	loc = h.stack[n-1]
	h.stack = h.stack[:n-1]
	return loc, true
}

// depth reports the number of places `q` can still go back to.
func (h *history) depth() int {
	return len(h.stack)
}

// capture snapshots the model's current position, for pushing before a
// navigation replaces it.
func (m Model) capture() location {
	loc := location{screen: m.screen, cursor: m.cursor}
	switch m.screen {
	case screenList:
		loc.listKind, loc.listTitle = m.listKind, m.listTitle
	case screenReader:
		// Section+slug, not the Article: openReader rewrites Body before
		// storing it (series nav, project card, {{ site.* }} substitution), so
		// a captured value would be a pre-rendered copy of a body the session's
		// corpus no longer contains.
		loc.articleSection = m.readerArticle.Section
		loc.articleSlug = m.readerArticle.Slug
		loc.readerOffset = m.reader.YOffset
	}
	return loc
}

// restore puts the model back at loc, re-resolving article content by
// section+slug and re-applying the reader offset and cursor.
func (m *Model) restore(loc location) {
	switch loc.screen {
	case screenList:
		m.enterList(loc.listKind, loc.listTitle, m.sectionItems(loc.listKind))
		// enterList puts the cursor back at the top; remembering that it wasn't
		// is the whole point of a location.
		m.cursor = loc.cursor
		if m.cursor >= len(m.listItems) {
			m.cursor = max(0, len(m.listItems)-1)
		}
	case screenReader:
		a, ok := m.articleAt(loc.articleSection, loc.articleSlug)
		if !ok {
			// Content is loaded once per session (main.go:136), so a slug on
			// the stack cannot go missing mid-session; this is the defensive
			// half. Home is the one screen that rebuilds from no content, and a
			// dead `q` is exactly what the stack exists to remove.
			m.screen = screenHome
			m.cursor = 0
			return
		}
		// Restoring is not a navigation, so the push openReader performs is
		// undone by the caller (Model.back), which reinstates the stack as it
		// stood after the pop.
		m.openReader(a)
		m.reader.SetYOffset(loc.readerOffset)
		m.cursor = loc.cursor
	default:
		m.screen = loc.screen
		m.cursor = loc.cursor
	}
}

// sectionItems returns the corpus slice a list screen is built from. gotoTab
// and followLink each inline this pair; restore needs it because a location
// records the list's kind, not its items — which are a slice, and the point of
// historyLimit is that a location stays cheap to copy.
func (m Model) sectionItems(kind string) []Article {
	if kind == "blog" {
		return m.content.Blog
	}
	return m.content.Projects
}

// articleAt re-resolves an article from the identity a location stores. The
// lookup goes through the session's own content maps every time, which is what
// makes storing section+slug rather than an Article worth the indirection.
func (m Model) articleAt(section, slug string) (Article, bool) {
	switch section {
	case "pages":
		a, ok := m.content.Pages[slug]
		return a, ok
	case "projects", "blog":
		for _, a := range m.sectionItems(section) {
			if a.Slug == slug {
				return a, true
			}
		}
	}
	return Article{}, false
}
