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

	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/log"
	"github.com/charmbracelet/ssh"
	"github.com/charmbracelet/wish"
	"github.com/charmbracelet/wish/activeterm"
	bm "github.com/charmbracelet/wish/bubbletea"
	lm "github.com/charmbracelet/wish/logging"
)

func env(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func main() {
	local := flag.Bool("local", false, "run the TUI directly in this terminal (no SSH)")
	flag.Parse()

	contentDir := env("CONTENT_DIR", "../src/content")
	content, loadErr := LoadContent(contentDir)
	if loadErr != nil {
		log.Warn("content load failed", "dir", contentDir, "err", loadErr)
	}

	if *local {
		runLocal(content, loadErr)
		return
	}

	runSSH(content, loadErr, contentDir)
}

// runLocal is the dev path: render straight to the current terminal.
func runLocal(content *Content, loadErr error) {
	m := NewModel(content, loadErr, 0, 0)
	if _, err := tea.NewProgram(m, tea.WithAltScreen()).Run(); err != nil {
		log.Fatal("program error", "err", err)
	}
}

// runSSH serves the TUI over SSH via Wish.
func runSSH(content *Content, loadErr error, contentDir string) {
	host := env("SSH_HOST", "0.0.0.0")
	port := env("SSH_PORT", "2222")
	hostKey := env("SSH_HOST_KEY", ".ssh/id_ed25519")

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
		return NewModel(c, err, w, h), []tea.ProgramOption{tea.WithAltScreen()}
	}

	s, err := wish.NewServer(
		wish.WithAddress(net.JoinHostPort(host, port)),
		wish.WithHostKeyPath(hostKey),
		wish.WithMiddleware(
			bm.Middleware(teaHandler),
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
