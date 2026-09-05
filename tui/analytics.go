package main

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"io"
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
	// analyticsUA must be present and must not look like a bot: Umami runs an
	// isbot check and answers a flagged request with 200 {"beep":"boop"} without
	// recording anything, so a missing UA looks like success and measures nothing.
	analyticsUA    = "szych-tui (SSH)"
	analyticsQueue = 64
	analyticsWait  = 3 * time.Second
)

// analyticsPayload is Umami's /api/send payload. Everything but website/hostname
// /tag is per-session or per-view.
type analyticsPayload struct {
	Website  string         `json:"website"`
	Hostname string         `json:"hostname"`
	Tag      string         `json:"tag"`
	ID       string         `json:"id,omitempty"`
	URL      string         `json:"url,omitempty"`
	Title    string         `json:"title,omitempty"`
	Screen   string         `json:"screen,omitempty"`
	Name     string         `json:"name,omitempty"`
	Data     map[string]any `json:"data,omitempty"`
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
	screen  string
	started time.Time

	mu       sync.Mutex
	lastPath string
}

// session mints a session identifier and records the real pty size. Umami uses
// the id to count sessions, which is what lets us stay useful without ever
// forwarding the visitor's IP.
func (t *tracker) session(w, h int) *trackerSession {
	if t == nil {
		return nil
	}
	return &trackerSession{
		t:       t,
		id:      newUUID(),
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
