package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/url"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"
)

const (
	// analyticsTag lands every TUI hit in the same Umami website as the web
	// traffic while staying filterable — one dashboard, two surfaces.
	analyticsTag = "tui"
	// analyticsUA has to be browser-SHAPED, not merely present. Umami runs the
	// `isbot` check on it and answers a flagged request with 200 {"beep":"boop"}
	// while recording nothing, so every failure looks like success.
	//
	// `szych-tui (SSH)` was the honest string and it measured nothing for a
	// release: isbot 3, 4 and 5 all flag it, because from v5 the library stopped
	// matching a deny-list of bot names and started rejecting anything that does
	// not look like a browser UA. Two rules, both verified against all three
	// majors: start with `Mozilla/5.0`, and never include the token
	// `compatible` — that one is itself a bot marker, so
	// `Mozilla/5.0 (compatible; szych-tui/1.0)` is flagged too. The parenthesis
	// still says what this is, so nothing here impersonates a real browser.
	// analytics_test.go pins both rules.
	analyticsUA = "Mozilla/5.0 (SSH; szych-tui/1.0)"
	// analyticsDevice is sent verbatim so Umami does not guess. Its own guess
	// reads `screen` as pixels, and 120x40 columns of terminal looks like a
	// small laptop.
	analyticsDevice = "terminal"
	analyticsQueue  = 64
	analyticsWait   = 3 * time.Second
)

// analyticsPayload is Umami's /api/send payload. Everything but website/hostname
// /tag is per-session or per-view.
type analyticsPayload struct {
	Website  string `json:"website"`
	Hostname string `json:"hostname"`
	Tag      string `json:"tag"`
	ID       string `json:"id,omitempty"`
	// IP carries only a network prefix, never the visitor's full address: Umami
	// hashes website+ip+userAgent into its session id AND geolocates that same
	// address, so it has to vary per visitor and still resolve. See anonymizeIP.
	IP string `json:"ip,omitempty"`
	// Browser, OS and Device are sent rather than parsed. Umami takes all three
	// from the payload when present and otherwise guesses from the User-Agent,
	// which for a terminal produces nonsense: getDevice() reads our `screen`
	// (columns x rows, e.g. 120x40), sees a width under 1920 and files every
	// SSH session as a laptop.
	Browser string         `json:"browser,omitempty"`
	OS      string         `json:"os,omitempty"`
	Device  string         `json:"device,omitempty"`
	URL     string         `json:"url,omitempty"`
	Title   string         `json:"title,omitempty"`
	Screen  string         `json:"screen,omitempty"`
	Name    string         `json:"name,omitempty"`
	Data    map[string]any `json:"data,omitempty"`
}

type analyticsEvent struct {
	Type    string           `json:"type"`
	Payload analyticsPayload `json:"payload"`
}

// tracker is the process-wide Umami sender: one HTTP client, one worker
// goroutine, one bounded queue. A nil *tracker is a working no-op, so callers
// never branch on whether analytics is configured.
type tracker struct {
	endpoint string
	website  string
	hostname string
	client   *http.Client
	events   chan analyticsEvent
}

// newTracker wires the sender from the shared content config plus UMAMI_URL.
// Returns nil — tracking silently off — when either half is missing, mirroring
// the web template's `{% if site.analyticsId %}` guard.
func newTracker(data *SiteData) *tracker {
	if data == nil {
		return nil
	}
	base := strings.TrimRight(os.Getenv("UMAMI_URL"), "/")
	if base == "" || data.Site.AnalyticsID == "" {
		return nil
	}
	t := &tracker{
		endpoint: base + "/api/send",
		website:  data.Site.AnalyticsID,
		hostname: analyticsHostname(data.Site.URL),
		client:   &http.Client{Timeout: analyticsWait},
		events:   make(chan analyticsEvent, analyticsQueue),
	}
	go t.run()
	return t
}

// analyticsHostname derives the reported hostname from the site URL in the
// shared JSON, so no domain is hardcoded in Go.
func analyticsHostname(siteURL string) string {
	host := ""
	if u, err := url.Parse(siteURL); err == nil {
		host = u.Hostname()
	}
	if host == "" { // unparseable or scheme-less — strip by hand
		host = strings.TrimSuffix(strings.TrimPrefix(strings.TrimPrefix(siteURL, "https://"), "http://"), "/")
		if i := strings.IndexAny(host, "/:"); i >= 0 {
			host = host[:i]
		}
	}
	if host == "" {
		return analyticsTag // last resort: a bare, still-valid label
	}
	return analyticsTag + "." + host
}

func (t *tracker) run() {
	for ev := range t.events {
		t.post(ev)
	}
}

// post fires one event. Every failure mode — marshal, dial, timeout, non-2xx —
// is discarded without logging: analytics must never be audible in an SSH session.
func (t *tracker) post(ev analyticsEvent) {
	body, err := json.Marshal(ev)
	if err != nil {
		return
	}
	req, err := http.NewRequest(http.MethodPost, t.endpoint, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("User-Agent", analyticsUA)
	res, err := t.client.Do(req)
	if err != nil {
		return
	}
	_, _ = io.Copy(io.Discard, res.Body)
	_ = res.Body.Close()
}

// trackerSession is one SSH session's handle on the tracker. The per-session
// UUID, pty size and dedupe cursor live here rather than on the shared tracker
// because sessions are concurrent — a shared lastPath would swallow one
// visitor's pageview because another visitor just viewed the same path.
// A nil *trackerSession is a working no-op.
type trackerSession struct {
	t       *tracker
	id      string
	ip      string // network prefix only, see anonymizeIP
	browser string // terminal emulator, from $TERM
	os      string // only when the SSH client string reveals it
	screen  string
	started time.Time

	mu       sync.Mutex
	lastPath string
}

// sessionInfo is what one SSH connection can honestly say about its client.
// Every field is optional: Umami shows "Unknown" for anything missing, which
// is the correct answer when the protocol does not carry it.
type sessionInfo struct {
	Width, Height int
	// Addr is the client's host:port. Consumed here: only the network prefix
	// derived from it is retained.
	Addr string
	// Term is $TERM as the client requested it (xterm-256color, alacritty,
	// tmux-256color). The emulator is the surface the reader actually looks at,
	// so it goes in the field a browser would occupy.
	Term string
	// ClientVersion is the SSH identification string (SSH-2.0-OpenSSH_9.6).
	// Only useful for the OS it sometimes names.
	ClientVersion string
}

func (t *tracker) session(info sessionInfo) *trackerSession {
	if t == nil {
		return nil
	}
	return &trackerSession{
		t:       t,
		id:      newUUID(),
		ip:      anonymizeIP(info.Addr),
		browser: terminalName(info.Term),
		os:      clientOS(info.ClientVersion),
		screen:  strconv.Itoa(info.Width) + "x" + strconv.Itoa(info.Height),
		started: time.Now(),
	}
}

// enqueue stamps the shared fields and hands the event to the worker. A full
// queue drops the event rather than blocking a keystroke.
func (s *trackerSession) enqueue(p analyticsPayload) {
	if s == nil || s.t == nil {
		return
	}
	p.Website = s.t.website
	p.Hostname = s.t.hostname
	p.Tag = analyticsTag
	p.ID = s.id
	p.Screen = s.screen
	p.IP = s.ip
	p.Browser = s.browser
	p.OS = s.os
	p.Device = analyticsDevice
	select {
	case s.t.events <- analyticsEvent{Type: "event", Payload: p}:
	default:
	}
}

// pageview reports a screen view. Repeats of the current path are dropped, so
// the model can emit from every navigation funnel without counting keystrokes.
func (s *trackerSession) pageview(path, title string) {
	if s == nil || path == "" {
		return
	}
	s.mu.Lock()
	if s.lastPath == path {
		s.mu.Unlock()
		return
	}
	s.lastPath = path
	s.mu.Unlock()
	s.enqueue(analyticsPayload{URL: path, Title: title})
}

// event reports a named event against the last path seen in this session.
func (s *trackerSession) event(name string, data map[string]any) {
	if s == nil {
		return
	}
	s.mu.Lock()
	path := s.lastPath
	s.mu.Unlock()
	if path == "" {
		path = "/"
	}
	s.enqueue(analyticsPayload{Name: name, URL: path, Data: data})
}

func (s *trackerSession) start() { s.event("session_start", nil) }

func (s *trackerSession) end() {
	if s == nil {
		return
	}
	s.event("session_end", map[string]any{
		"duration": int(time.Since(s.started).Seconds()),
	})
}

// anonymizeIP drops the identifying tail of a client address: the last octet of
// an IPv4 address, everything below the /48 of an IPv6 one.
//
// Two things have to be true at once. Umami computes its session id as
// uuid(websiteId, ip, userAgent, salt) and takes country/region/city from a
// MaxMind lookup on that same address — there is no way to send a country
// directly. So an address that is useless for geolocation also costs the
// location breakdown, and one that never varies collapses every SSH visitor
// into a single session.
//
// A network prefix satisfies both: it geolocates to the right country (and
// usually region), and it differs between visitors on different networks, so
// sessions split. What it gives up is precision about the person — a /24 is an
// ISP and a rough area, not a subscriber — and it is the same reduction this
// server already applies to its own access log before writing it, so the box
// keeps one rule rather than two.
//
// The port goes first: it changes on every connection, and keeping it would
// hand every reconnect a new identity.
func anonymizeIP(addr string) string {
	if addr == "" {
		return ""
	}
	host := addr
	if h, _, err := net.SplitHostPort(addr); err == nil {
		host = h
	}
	// An IPv6 zone (fe80::1%eth0) is not part of the address and breaks ParseIP.
	if i := strings.IndexByte(host, '%'); i >= 0 {
		host = host[:i]
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return ""
	}
	if v4 := ip.To4(); v4 != nil {
		return net.IPv4(v4[0], v4[1], v4[2], 0).String()
	}
	// /48: the routable prefix a site is allocated. Keeps the country, drops
	// the subnet and interface identifier, which is the part that is personal.
	masked := ip.Mask(net.CIDRMask(48, 128))
	return masked.String()
}

// newUUID formats 16 crypto/rand bytes as a canonical UUIDv4. Hand-rolled
// because the TUI deliberately carries no uuid dependency. crypto/rand.Read
// cannot fail on any supported platform, so the error is not actionable here.
func newUUID() string {
	var b [16]byte
	_, _ = rand.Read(b[:])
	b[6] = (b[6] & 0x0f) | 0x40 // version 4
	b[8] = (b[8] & 0x3f) | 0x80 // RFC 4122 variant
	var out [36]byte
	hex.Encode(out[0:8], b[0:4])
	out[8] = '-'
	hex.Encode(out[9:13], b[4:6])
	out[13] = '-'
	hex.Encode(out[14:18], b[6:8])
	out[18] = '-'
	hex.Encode(out[19:23], b[8:10])
	out[23] = '-'
	hex.Encode(out[24:36], b[10:16])
	return string(out[:])
}

// terminalName turns $TERM into something a dashboard row can say. TERM names
// the terminfo entry, not the product, so the mapping is only as good as what
// emulators choose to set: kitty and Alacritty identify themselves, everything
// else says "xterm-256color" and stays generic rather than being guessed at.
// A multiplexer wins on purpose — inside tmux that is what owns the screen.
func terminalName(term string) string {
	t := strings.ToLower(strings.TrimSpace(term))
	switch {
	case t == "":
		return ""
	case strings.HasPrefix(t, "tmux"):
		return "tmux"
	case strings.HasPrefix(t, "screen"):
		return "screen"
	case strings.Contains(t, "kitty"):
		return "kitty"
	case strings.Contains(t, "alacritty"):
		return "Alacritty"
	case strings.Contains(t, "ghostty"):
		return "Ghostty"
	case strings.Contains(t, "wezterm"):
		return "WezTerm"
	case strings.Contains(t, "foot"):
		return "foot"
	case strings.Contains(t, "rxvt"):
		return "rxvt"
	case strings.Contains(t, "linux"):
		return "Linux console"
	case strings.HasPrefix(t, "xterm"):
		return "xterm"
	default:
		return term
	}
}

// clientOS reports an operating system only when the SSH identification string
// actually names one. OpenSSH on Linux and macOS says nothing about the host,
// so most sessions report nothing and Umami shows "Unknown" — which is true,
// and better than inferring a platform from a version number.
func clientOS(clientVersion string) string {
	v := strings.ToLower(clientVersion)
	switch {
	case strings.Contains(v, "for_windows"), strings.Contains(v, "putty"),
		strings.Contains(v, "kitty_ssh"), strings.Contains(v, "winscp"):
		return "Windows"
	case strings.Contains(v, "termius"), strings.Contains(v, "juicessh"),
		strings.Contains(v, "connectbot"):
		return "mobile client"
	default:
		return ""
	}
}
