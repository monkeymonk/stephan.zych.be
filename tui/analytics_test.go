package main

// The analytics sender is deliberately silent: every failure mode — marshal,
// dial, timeout, non-2xx — is discarded so nothing is ever audible in an SSH
// session. That is the right call for a terminal, and it is also why a broken
// collector configuration survived a release unnoticed. These are the checks
// that silence costs us.

import (
	"encoding/json"
	"io"
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
	s := tr.session(sessionInfo{Width: 120, Height: 40, Addr: clientAddr, Term: "xterm-256color", ClientVersion: "SSH-2.0-OpenSSH_9.6"})
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
			if ip, _ := payload["ip"].(string); ip != "203.0.113.0" {
				t.Errorf("ip = %q, want the 203.0.113.0 prefix — it has to vary per network so sessions split, and still resolve so the country does", ip)
			}
			if strings.Contains(h.raw, "203.0.113.7") {
				t.Errorf("the visitor's full address reached the collector: %s", h.raw)
			}
			if payload["device"] != analyticsDevice {
				t.Errorf("device = %v, want %q — left unset, Umami reads `screen` as pixels and calls 120x40 a laptop", payload["device"], analyticsDevice)
			}
			if payload["browser"] != "xterm" {
				t.Errorf("browser = %v, want xterm (from $TERM)", payload["browser"])
			}
			if _, present := payload["os"]; present {
				t.Errorf("os = %v, want it omitted: plain OpenSSH does not name the host OS", payload["os"])
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

// The prefix has to do two jobs at once: keep enough of the address that
// MaxMind still resolves a country, and drop the part that identifies a
// subscriber. Reconnects change the source port, so the port must not
// participate — otherwise every reconnect would read as a new visitor.
func TestAnonymizeIPKeepsThePrefixAndDropsTheHost(t *testing.T) {
	const full = "203.0.113.7"

	got := anonymizeIP(full + ":54321")
	if got != "203.0.113.0" {
		t.Errorf("anonymizeIP(%q) = %q, want 203.0.113.0", full, got)
	}
	if other := anonymizeIP(full + ":9999"); other != got {
		t.Errorf("same client, different port gave %q then %q: the port must not survive", got, other)
	}
	if got == full {
		t.Error("the full address was sent unchanged")
	}

	// A different network must land on a different prefix, or sessions merge.
	if other := anonymizeIP("198.51.100.20:22"); other == got {
		t.Errorf("two different networks collapsed onto %q", got)
	}

	// IPv6 keeps the /48 a site is allocated and loses the subnet plus the
	// interface identifier, which is the personal half.
	v6 := anonymizeIP("[2001:db8:1234:5678:9abc:def0:1234:5678]:22")
	if v6 != "2001:db8:1234::" {
		t.Errorf("anonymizeIP(v6) = %q, want 2001:db8:1234::", v6)
	}
	if zoned := anonymizeIP("[fe80::1%25eth0]:22"); zoned == "" {
		t.Error("a zoned IPv6 address failed to parse; the zone must be stripped, not rejected")
	}

	if anonymizeIP("") != "" {
		t.Error("an empty address must stay empty rather than becoming a real-looking one")
	}
	if anonymizeIP("not-an-address:22") != "" {
		t.Error("an unparseable address must stay empty")
	}
}

// Umami takes browser/OS/device from the payload when present and guesses
// otherwise. Its guess reads `screen` as pixels, so 120x40 columns of terminal
// becomes "laptop" — data that looks real and means nothing.
func TestClientDescriptionIsSentRatherThanGuessed(t *testing.T) {
	for term, want := range map[string]string{
		"xterm-256color": "xterm",
		"xterm-kitty":    "kitty",
		"alacritty":      "Alacritty",
		"tmux-256color":  "tmux",
		"screen.xterm":   "screen",
		"linux":          "Linux console",
		"":               "",
	} {
		if got := terminalName(term); got != want {
			t.Errorf("terminalName(%q) = %q, want %q", term, got, want)
		}
	}

	// An OS is reported only when the client string actually names one.
	if got := clientOS("SSH-2.0-OpenSSH_for_Windows_8.6"); got != "Windows" {
		t.Errorf("clientOS(windows build) = %q, want Windows", got)
	}
	if got := clientOS("SSH-2.0-OpenSSH_9.6"); got != "" {
		t.Errorf("clientOS(plain OpenSSH) = %q, want empty: the protocol does not carry the host OS, and a guess would be fiction", got)
	}
}
