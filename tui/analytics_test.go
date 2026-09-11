package main

// The analytics sender is deliberately silent: every failure mode — marshal,
// dial, timeout, non-2xx — is discarded so nothing is ever audible in an SSH
// session. That is the right call for a terminal, and it is also why a broken
// collector configuration survived a release unnoticed. These are the checks
// that silence costs us.

import (
	"encoding/json"
	"io"
	"net"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

// Umami answers a bot-flagged request with 200 {"beep":"boop"} and records
// nothing, so a flagged User-Agent is indistinguishable from success at the
// client. The two rules below are what isbot 3, 4 and 5 all agree on; the
// string that failed in production ("szych-tui (SSH)") broke the first one.
func TestAnalyticsUserAgentIsNotBotShaped(t *testing.T) {
	if !strings.HasPrefix(analyticsUA, "Mozilla/5.0") {
		t.Errorf("analyticsUA %q must start with Mozilla/5.0: from isbot v5 the check rejects anything that does not look like a browser UA, and Umami then silently drops every hit", analyticsUA)
	}
	if strings.Contains(strings.ToLower(analyticsUA), "compatible") {
		t.Errorf("analyticsUA %q must not contain \"compatible\": isbot treats that token as a bot marker even inside an otherwise browser-shaped string", analyticsUA)
	}
}

// Tracking is off unless BOTH halves are configured — the env var pointing at
// the collector and the website id that rides along in content/data/site.json.
// A nil tracker is a working no-op, so this is the only place the distinction
// is observable.
func TestTrackerRequiresEndpointAndWebsiteID(t *testing.T) {
	withID := &SiteData{}
	withID.Site.AnalyticsID = "abc"
	withID.Site.URL = "https://example.test"

	t.Setenv("UMAMI_URL", "")
	if newTracker(withID) != nil {
		t.Error("tracker built with no UMAMI_URL: hits would go nowhere")
	}

	t.Setenv("UMAMI_URL", "http://collector.test")
	if newTracker(&SiteData{}) != nil {
		t.Error("tracker built with no analyticsId: Umami would reject every hit")
	}
	if newTracker(nil) != nil {
		t.Error("tracker built from nil data")
	}
	if newTracker(withID) == nil {
		t.Fatal("tracker not built despite both halves being present")
	}
}

// What actually reaches the collector: the shared website id, the tui tag that
// keeps both surfaces in one dashboard, a stable per-session id, and one hit
// per distinct path rather than one per keystroke.
func TestPageviewsReachTheCollector(t *testing.T) {
	type hit struct {
		ua   string
		raw  string
		body map[string]any
	}
	hits := make(chan hit, 8)

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		raw, _ := io.ReadAll(r.Body)
		var parsed map[string]any
		_ = json.Unmarshal(raw, &parsed)
		hits <- hit{ua: r.Header.Get("User-Agent"), raw: string(raw), body: parsed}
		_, _ = w.Write([]byte(`{}`))
	}))
	defer srv.Close()

	data := &SiteData{}
	data.Site.AnalyticsID = "website-id"
	data.Site.URL = "https://stephan.zych.be"
	t.Setenv("UMAMI_URL", srv.URL)

	tr := newTracker(data)
	if tr == nil {
		t.Fatal("tracker not configured")
	}
	const clientAddr = "203.0.113.7:54321"
	s := tr.session(120, 40, clientAddr)
	s.pageview("/blog/", "blog")
	s.pageview("/blog/", "blog") // same path: must not be sent twice
	s.pageview("/cv/", "cv")

	paths := []string{}
	var firstID string
	for range 2 {
		select {
		case h := <-hits:
			if h.ua != analyticsUA {
				t.Errorf("User-Agent = %q, want %q", h.ua, analyticsUA)
			}
			payload, ok := h.body["payload"].(map[string]any)
			if !ok {
				t.Fatalf("no payload object in %v", h.body)
			}
			if payload["website"] != "website-id" {
				t.Errorf("website = %v, want website-id", payload["website"])
			}
			if payload["tag"] != analyticsTag {
				t.Errorf("tag = %v, want %q — the tag is what separates TUI hits from web hits in the shared dashboard", payload["tag"], analyticsTag)
			}
			if payload["hostname"] != "tui.stephan.zych.be" {
				t.Errorf("hostname = %v, want tui.stephan.zych.be", payload["hostname"])
			}
			id, _ := payload["id"].(string)
			if id == "" {
				t.Error("no session id: Umami counts sessions by it")
			}
			if firstID == "" {
				firstID = id
			} else if id != firstID {
				t.Errorf("session id changed between hits: %q then %q", firstID, id)
			}
			path, _ := payload["url"].(string)
			paths = append(paths, path)
			if ip, _ := payload["ip"].(string); !strings.HasPrefix(ip, "100.") {
				t.Errorf("ip = %q, want a 100.64.0.0/10 stand-in — without one Umami hashes every SSH visitor into the same session", ip)
			}
			if strings.Contains(h.raw, "203.0.113.7") {
				t.Errorf("the visitor's real address reached the collector: %s", h.raw)
			}
		case <-time.After(4 * time.Second):
			t.Fatalf("only %d hits arrived, want 2", len(paths))
		}
	}

	if strings.Join(paths, ",") != "/blog/,/cv/" {
		t.Errorf("paths = %v, want [/blog/ /cv/]", paths)
	}
	select {
	case h := <-hits:
		t.Errorf("a third hit arrived (%v): repeated paths must be deduped, or every keystroke would count as a view", h.body["payload"])
	case <-time.After(300 * time.Millisecond):
	}
}

// The whole point of the stand-in: distinct clients must land on distinct
// addresses, the same client must land on the same one, and none of it may be
// the real address. Reconnects change the source port, so the port must not
// participate — otherwise every reconnect would read as a new visitor.
func TestPseudoIPIsStableUnroutableAndNotTheRealAddress(t *testing.T) {
	const real = "203.0.113.7"

	a := pseudoIP(real + ":54321")
	b := pseudoIP(real + ":9999")
	if a != b {
		t.Errorf("same client, different port gave %q then %q: the port must not be hashed", a, b)
	}
	if a == "" {
		t.Fatal("no stand-in derived")
	}
	if strings.Contains(a, real) {
		t.Errorf("stand-in %q contains the real address", a)
	}

	ip := net.ParseIP(a)
	if ip == nil {
		t.Fatalf("stand-in %q is not an IP", a)
	}
	// RFC 6598 shared address space: not routable on the public internet, so a
	// geo lookup yields nothing rather than a fictional country.
	_, cgnat, _ := net.ParseCIDR("100.64.0.0/10")
	if !cgnat.Contains(ip) {
		t.Errorf("stand-in %q is outside 100.64.0.0/10", a)
	}

	if other := pseudoIP("198.51.100.20:22"); other == a {
		t.Errorf("two different clients collapsed onto %q", a)
	}
	if pseudoIP("") != "" {
		t.Error("an empty address must stay empty rather than hashing to a real-looking one")
	}
}
