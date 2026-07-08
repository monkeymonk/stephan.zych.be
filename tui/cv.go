package main

import (
	"fmt"
	"strings"
)

// cvArticle builds the CV reader page from content/data/cv.json — a
// standalone page (like about/contact), not a markdown file on disk.
func (m Model) cvArticle() Article {
	cv := m.data.CV
	var b strings.Builder

	fmt.Fprintf(&b, "**%s**", cv.Basics.Name)
	if cv.Basics.Tagline != "" {
		fmt.Fprintf(&b, " — %s", cv.Basics.Tagline)
	}
	b.WriteString("\n\n")
	if cv.Basics.Location != "" {
		b.WriteString(cv.Basics.Location + "\n\n")
	}

	var contact []string
	if cv.Basics.Email != "" {
		contact = append(contact, fmt.Sprintf("[%s](mailto:%s)", cv.Basics.Email, cv.Basics.Email))
	}
	if cv.Basics.Website != "" {
		contact = append(contact, fmt.Sprintf("[%s](https://%s)", cv.Basics.Website, cv.Basics.Website))
	}
	if cv.Basics.Linkedin != "" {
		contact = append(contact, fmt.Sprintf("[%s](https://%s)", cv.Basics.Linkedin, cv.Basics.Linkedin))
	}
	if cv.Basics.Github != "" {
		contact = append(contact, fmt.Sprintf("[%s](https://%s)", cv.Basics.Github, cv.Basics.Github))
	}
	if len(contact) > 0 {
		b.WriteString(strings.Join(contact, "  ·  ") + "\n\n")
	}

	if cv.Basics.Pdf != "" {
		fmt.Fprintf(&b, "**Print / PDF** — [%s%s](%s%s)\n\n", m.data.Site.URL, cv.Basics.Pdf, m.data.Site.URL, cv.Basics.Pdf)
	}

	if len(cv.Summary) > 0 {
		b.WriteString("## About me\n\n")
		for _, p := range cv.Summary {
			b.WriteString(p + "\n\n")
		}
	}

	if len(cv.Expertise) > 0 {
		b.WriteString("## Core expertise\n\n")
		b.WriteString(strings.Join(cv.Expertise, " · ") + "\n\n")
	}

	if len(cv.Experience) > 0 {
		b.WriteString("## Work experience\n\n")
		for _, e := range cv.Experience {
			fmt.Fprintf(&b, "### %s — %s", e.Role, e.Company)
			if e.Via != "" {
				fmt.Fprintf(&b, " · via %s", e.Via)
			}
			b.WriteString("\n\n")

			var loc []string
			if e.Location != "" {
				loc = append(loc, e.Location)
			}
			if e.Period != "" {
				loc = append(loc, e.Period)
			}
			if len(loc) > 0 {
				fmt.Fprintf(&b, "*%s*\n\n", strings.Join(loc, " · "))
			}

			if e.Summary != "" {
				b.WriteString(e.Summary + "\n\n")
			}

			for _, h := range e.Highlights {
				b.WriteString("- " + h + "\n")
			}
			if len(e.Highlights) > 0 {
				b.WriteString("\n")
			}

			for _, g := range e.Groups {
				if g.Label != "" {
					fmt.Fprintf(&b, "**%s**\n\n", g.Label)
				}
				for _, item := range g.Items {
					b.WriteString("- " + item + "\n")
				}
				b.WriteString("\n")
			}

			if len(e.Clients) > 0 {
				fmt.Fprintf(&b, "**Representative clients** %s\n\n", strings.Join(e.Clients, " · "))
			}

			if e.Note != "" {
				b.WriteString(e.Note + "\n\n")
			}
		}
	}

	if len(cv.Earlier) > 0 {
		b.WriteString("## Earlier roles\n\n")
		for _, e := range cv.Earlier {
			fmt.Fprintf(&b, "- **%s** — %s · %s\n", e.Role, e.Company, e.Period)
		}
		b.WriteString("\n")
	}

	if len(cv.Education) > 0 {
		b.WriteString("## Education & training\n\n")
		for _, e := range cv.Education {
			fmt.Fprintf(&b, "**%s** — %s\n\n", e.School, e.Detail)
		}
	}

	if len(cv.Skills) > 0 {
		b.WriteString("## Digital skills\n\n")
		for _, s := range cv.Skills {
			fmt.Fprintf(&b, "**%s** %s\n\n", s.Label, strings.Join(s.Items, " · "))
		}
	}

	if len(cv.Languages) > 0 {
		b.WriteString("## Language skills\n\n")
		for _, l := range cv.Languages {
			fmt.Fprintf(&b, "**%s** — %s", l.Name, l.Level)
			if l.Note != "" {
				fmt.Fprintf(&b, " · %s", l.Note)
			}
			b.WriteString("\n\n")
		}
	}

	if len(cv.Community) > 0 {
		b.WriteString("## Leadership & community\n\n")
		for _, c := range cv.Community {
			fmt.Fprintf(&b, "**%s** — %s\n\n", c.Label, c.Detail)
		}
	}

	if len(cv.Interests) > 0 {
		b.WriteString("## Interests\n\n")
		b.WriteString(strings.Join(cv.Interests, " · ") + "\n\n")
	}

	return Article{
		Section: "pages",
		Slug:    "cv",
		Title:   "CV",
		Body:    strings.TrimSpace(b.String()),
	}
}
