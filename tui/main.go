package main

import (
	"context"
	"errors"
	"flag"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"
	_ "time/tzdata" // embed the zoneinfo DB so the statusline clock works on a distroless image

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
	"github.com/charmbracelet/log"
	"github.com/charmbracelet/ssh"
	"github.com/charmbracelet/wish"
	"github.com/charmbracelet/wish/activeterm"
	bm "github.com/charmbracelet/wish/bubbletea"
	lm "github.com/charmbracelet/wish/logging"
	"github.com/muesli/termenv"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

const (
	sshIdleTimeout = 5 * time.Minute  // drop a session after this much inactivity
	sshMaxTimeout  = 30 * time.Minute // absolute cap on any single session
	sshMaxSessions = 64               // concurrent sessions — public-port abuse backstop
)

// sessionSlots bounds concurrent SSH sessions. A public port is an abuse magnet;
// this caps resource use without pulling in a rate-limiting dependency.
var sessionSlots = make(chan struct{}, sshMaxSessions)

// limitConcurrency rejects new sessions once the server is at capacity. Placed
// inside activeterm in the chain so non-interactive probes never consume a slot.
func limitConcurrency(next ssh.Handler) ssh.Handler {
	return func(s ssh.Session) {
		select {
		case sessionSlots <- struct{}{}:
			defer func() { <-sessionSlots }()
			next(s)
		default:
			wish.Fatalln(s, "Server at capacity — please reconnect in a moment.")
		}
	}
}

func main() {
	local := flag.Bool("local", false, "run the TUI directly in this terminal (no SSH)")
	flag.Parse()

	contentDir := env("CONTENT_DIR", "../content")
	content, loadErr := LoadContent(contentDir)
	if loadErr != nil {
		log.Warn("content load failed", "dir", contentDir, "err", loadErr)
	}
	dataDir := env("DATA_DIR", contentDir+"/data")
	data := LoadData(dataDir)
	wakapi := FetchWakapi()
	data.Wakapi = wakapi

	if *local {
		runLocal(content, data, loadErr)
		return
	}

	runSSH(content, data, wakapi, loadErr, contentDir, dataDir)
}

// runLocal is the dev path: render straight to the current terminal.
func runLocal(content *Content, data *SiteData, loadErr error) {
	m := NewModel(content, data, loadErr, 0, 0)
	if _, err := tea.NewProgram(m, tea.WithAltScreen()).Run(); err != nil {
		log.Fatal("program error", "err", err)
	}
}

// runSSH serves the TUI over SSH via Wish.
func runSSH(content *Content, data *SiteData, wakapi *WakapiStats, loadErr error, contentDir, dataDir string) {
	host := env("SSH_HOST", "0.0.0.0")
	port := env("SSH_PORT", "2222")
	hostKey := env("SSH_HOST_KEY", ".ssh/id_ed25519")

	// Styles use the global lipgloss renderer, which probes the process's stdout
	// for color support. Inside the container stdout is never a TTY, so termenv
	// reports the Ascii profile and every style renders colorless. Force truecolor
	// so the Catppuccin hex palette reaches the client's terminal intact.
	lipgloss.SetColorProfile(termenv.TrueColor)

	teaHandler := func(s ssh.Session) (tea.Model, []tea.ProgramOption) {
		pty, _, active := s.Pty()
		w, h := 80, 24
		if active {
			w, h = pty.Window.Width, pty.Window.Height
		}
		// Reload content per session so deploys without a restart still serve fresh
		// data; fall back to the boot-time copy on error.
		c, err := LoadContent(contentDir)
		if err != nil {
			c, err = content, loadErr
		}
		d := LoadData(dataDir)
		d.Wakapi = wakapi
		return NewModel(c, d, err, w, h), []tea.ProgramOption{tea.WithAltScreen()}
	}

	s, err := wish.NewServer(
		wish.WithAddress(net.JoinHostPort(host, port)),
		wish.WithHostKeyPath(hostKey),
		wish.WithIdleTimeout(sshIdleTimeout),
		wish.WithMaxTimeout(sshMaxTimeout),
		wish.WithMiddleware(
			bm.Middleware(teaHandler),
			limitConcurrency,        // cap concurrent sessions
			activeterm.Middleware(), // require an interactive terminal
			lm.Middleware(),
		),
	)
	if err != nil {
		log.Fatal("could not create server", "err", err)
	}

	done := make(chan os.Signal, 1)
	signal.Notify(done, os.Interrupt, syscall.SIGINT, syscall.SIGTERM)
	log.Info("starting ssh server", "addr", net.JoinHostPort(host, port))
	go func() {
		if err := s.ListenAndServe(); err != nil && !errors.Is(err, ssh.ErrServerClosed) {
			log.Fatal("server error", "err", err)
		}
	}()

	<-done
	log.Info("stopping ssh server")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()
	if err := s.Shutdown(ctx); err != nil && !errors.Is(err, ssh.ErrServerClosed) {
		log.Error("shutdown error", "err", err)
	}
}
