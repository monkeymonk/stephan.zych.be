package main

import (
	"fmt"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// panel wraps a widget in the rounded card border, with a cli-style command
// header (matches the neofetch card's `❯ cmd` look).
func (m Model) panel(cmd, body string) string {
	if strings.TrimSpace(body) == "" {
		return ""
	}
	header := m.st.CardCmdS.Render("❯ ") + m.st.CardCmd.Render(cmd)
	inner := lipgloss.JoinVertical(lipgloss.Left, header, "", body)
	return m.st.Card.Render(inner)
}

// renderWidget dispatches a marker kind to its widget renderer.
func (m Model) renderWidget(kind string, width int) string {
	switch kind {
	case "neofetch":
		return m.neofetchCard(width)
	case "gitlog":
		return m.renderGitlog(m.data.Profile.Timeline)
	case "stats":
		return m.renderStats(m.data.Profile.Stats, m.data.Profile.Skills, width)
	case "wakapi":
		return m.renderWakapi(m.data.Wakapi, width)
	case "contact-card":
		return m.renderContact()
	}
	return ""
}

func (m Model) renderContact() string {
	var b strings.Builder
	s := m.data.Site
	add := func(k, v string) {
		if v == "" {
			return
		}
		b.WriteString(m.st.Key.Render(padRight(k, 10)) + m.st.Val.Render(v) + "\n")
	}
	add("Email", s.Email)
	add("GitHub", s.Socials.Github)
	add("LinkedIn", s.Socials.Linkedin)
	add("Repo", s.RepoURL)
	return m.panel("./contact --reach-me", strings.TrimRight(b.String(), "\n"))
}

// barRowView renders a single proportional bar row using lipgloss block chars.
// ntcharts horizontal barchart with WithNoAxis() omits label rendering entirely
// (labels are drawn only in drawAxisAndLabels which is skipped), so this
// fallback is used instead for readable labelled bars.
func (m Model) barRowView(label string, pct int, color string) string {
	const w = 16
	filled := pct * w / 100
	if filled > w {
		filled = w
	}
	bar := lipgloss.NewStyle().Foreground(lipgloss.Color(color)).Render(strings.Repeat("█", filled)) +
		lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Surface1)).Render(strings.Repeat("░", w-filled))
	return fmt.Sprintf("%s %s %3d%%", padRight(truncate(label, 22), 22), bar, pct)
}

func (m Model) renderGitlog(timeline []TimelineEntry) string {
	if len(timeline) == 0 {
		return ""
	}
	hashSt := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Peach))
	refSt := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Green)).Bold(true)
	msgSt := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Text))
	dateSt := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Overlay0))
	var b strings.Builder
	for i, c := range timeline {
		line := hashSt.Render(c.Hash)
		if c.Ref != "" {
			line += " " + refSt.Render("(" + c.Ref + ")")
		}
		line += " " + msgSt.Render(c.Message) + "  " + dateSt.Render(c.Date)
		b.WriteString(line)
		if i < len(timeline)-1 {
			b.WriteString("\n")
		}
	}
	return m.panel("git log --graph --oneline", b.String())
}

func (m Model) renderStats(counters []StatCounter, skills []Skill, width int) string {
	numSt := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Accent)).Bold(true)
	labelSt := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Overlay0))
	cols := make([]string, 0, len(counters)*2)
	for i, c := range counters {
		num := numSt.Render(fmt.Sprintf("%d%s", c.Value, c.Suffix))
		col := lipgloss.JoinVertical(lipgloss.Center, num, labelSt.Render(c.Label))
		if i > 0 {
			cols = append(cols, "    ")
		}
		cols = append(cols, col)
	}
	countersRow := lipgloss.JoinHorizontal(lipgloss.Top, cols...)

	skillLines := make([]string, len(skills))
	for i, s := range skills {
		skillLines[i] = m.barRowView(s.Name, s.Level, m.theme.Swatches[i%len(m.theme.Swatches)])
	}
	body := lipgloss.JoinVertical(lipgloss.Left, countersRow, "", strings.Join(skillLines, "\n"))
	return m.panel("./stats --receipts", body)
}

func (m Model) renderWakapi(w *WakapiStats, width int) string {
	if w == nil || len(w.Languages) == 0 {
		return ""
	}
	totalSt := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Text)).Bold(true)
	mutedSt := lipgloss.NewStyle().Foreground(lipgloss.Color(m.theme.Overlay0))
	summary := totalSt.Render(w.Total)
	if w.DailyAverage != "" {
		summary += mutedSt.Render("  ~" + w.DailyAverage + " / day")
	}
	summary += mutedSt.Render("  · " + w.Range)

	langLines := make([]string, len(w.Languages))
	for i, l := range w.Languages {
		label := l.Name
		if l.Text != "" {
			label = fmt.Sprintf("%-16s %s · %d%%", truncate(l.Name, 16), l.Text, l.Percent)
		} else {
			label = fmt.Sprintf("%-16s %d%%", truncate(l.Name, 16), l.Percent)
		}
		langLines[i] = m.barRowView(label, l.Percent, m.theme.Swatches[i%len(m.theme.Swatches)])
	}
	body := lipgloss.JoinVertical(lipgloss.Left, summary, "", strings.Join(langLines, "\n"))
	return m.panel("wakatime --last-7-days", body)
}
