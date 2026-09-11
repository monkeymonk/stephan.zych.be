package main

import (
	"bytes"
	"crypto/hmac"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
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
	analyticsUA    = "Mozilla/5.0 (SSH; szych-tui/1.0)"
	analyticsQueue = 64
	analyticsWait  = 3 * time.Second
)

// analyticsPayload is Umami's /api/send payload. Everything but website/hostname
// /tag is per-session or per-view.
type analyticsPayload struct {
	Website  string `json:"website"`
	Hostname string `json:"hostname"`
	Tag      string `json:"tag"`
	ID       string `json:"id,omitempty"`
	// IP is a pseudonymous stand-in, never the visitor's address. Umami hashes
	// website+ip+userAgent into its session id, so without something that
	// varies per client every SSH visitor collapses into one session. See
	// pseudoIP.
	IP     string         `json:"ip,omitempty"`
	URL    string         `json:"url,omitempty"`
	Title  string         `json:"title,omitempty"`
	Screen string         `json:"screen,omitempty"`
	Name   string         `json:"name,omitempty"`
	Data   map[string]any `json:"data,omitempty"`
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
	ip      string // pseudonymous, see pseudoIP
	screen  string
	started time.Time

	mu       sync.Mutex
	lastPath string
}

// session mints a session identifier, records the real pty size, and derives a
// pseudonymous stand-in for the client address. `addr` is a host:port string
// and is consumed here: only the derived value is retained.
func (t *tracker) session(w, h int, addr string) *trackerSession {
	if t == nil {
		return nil
	}
	return &trackerSession{
		t:       t,
		id:      newUUID(),
		ip:      pseudoIP(addr),
		screen:  strconv.Itoa(w) + "x" + strconv.Itoa(h),
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

// pseudoSalt keys the address hash. Minted once per process, never persisted,
// so the mapping from a real client to its stand-in cannot be reproduced after
// a restart and nothing derived from an address outlives the container. That
// also means a visitor returning after a redeploy counts as new, which is the
// accepted cost of not keeping a stable identifier for anybody.
var pseudoSalt = func() []byte {
	b := make([]byte, 32)
	_, _ = rand.Read(b)
	return b
}()

// pseudoIP maps a client address onto RFC 6598 shared address space
// (100.64.0.0/10) via a keyed hash.
//
// Umami computes its session id as uuid(websiteId, ip, userAgent, salt). Every
// SSH visitor arrives at the collector from the same container address and now
// with an identical User-Agent, so without something that varies per client the
// whole TUI reads as a single session: pageviews right, visitors wrong. Sending
// the real address would fix the numbers and forward exactly what this codebase
// has always refused to forward.
//
// So: HMAC the address with a per-process key and keep 22 bits, which is the
// host space of a /10. The result is stable for one client inside one process
// (sessions and visitors count correctly), is not reversible to an address, and
// is deliberately unroutable — geolocation on 100.64/10 resolves to nothing, so
// the dashboard shows no country for TUI traffic rather than a fictional one.
//
// The port is stripped first: it changes on every connection, and hashing it
// would hand every reconnect a new identity.
func pseudoIP(addr string) string {
	if addr == "" {
		return ""
	}
	host := addr
	if h, _, err := net.SplitHostPort(addr); err == nil {
		host = h
	}
	sum := hmac.New(sha256.New, pseudoSalt)
	_, _ = sum.Write([]byte(host))
	d := sum.Sum(nil)
	n := uint32(d[0])<<16 | uint32(d[1])<<8 | uint32(d[2])
	n &= 0x3fffff // 22 host bits of 100.64.0.0/10
	return fmt.Sprintf("100.%d.%d.%d", 64+(n>>16), (n>>8)&0xff, n&0xff)
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
