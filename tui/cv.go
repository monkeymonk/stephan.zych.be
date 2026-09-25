package main

import (
	"fmt"
	"regexp"
	"strings"

	"github.com/charmbracelet/log"
)

// cvArticle builds the CV reader page from the CV data loaded from
// content/cv/*.md — a standalone page (like about/contact), not a markdown
// file on disk itself.
func (m Model) cvArticle() Article {
	cv := m.resolveCVVariant(m.cvVariant)
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
		for _, g := range cv.Expertise {
			fmt.Fprintf(&b, "**%s** %s\n\n", g.Label, strings.Join(g.Items, " · "))
		}
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

	if len(cv.Evidence) > 0 {
		b.WriteString("## Selected engineering work\n\n")
		for _, e := range cv.Evidence {
			fmt.Fprintf(&b, "**%s.** %s", e.Label, e.Detail)
			if e.Link != "" {
				fmt.Fprintf(&b, " [%s](https://%s)", e.Link, e.Link)
			}
			b.WriteString("\n\n")
		}
	}

	if len(cv.Earlier) > 0 {
		b.WriteString("## Earlier roles\n\n")
		for _, e := range cv.Earlier {
			fmt.Fprintf(&b, "- **%s** — %s · %s\n", e.Role, e.Company, e.Period)
		}
		b.WriteString("\n")
		if len(cv.EarlierClients) > 0 {
			fmt.Fprintf(&b, "**Representative clients** %s\n\n", strings.Join(cv.EarlierClients, " · "))
		}
	}

	if len(cv.Skills) > 0 {
		b.WriteString("## Technical stack\n\n")
		for _, s := range cv.Skills {
			fmt.Fprintf(&b, "**%s** %s\n\n", s.Label, strings.Join(s.Items, " · "))
		}
	}

	if len(cv.Education) > 0 {
		b.WriteString("## Education & training\n\n")
		for _, e := range cv.Education {
			fmt.Fprintf(&b, "**%s** — %s\n\n", e.School, e.Detail)
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

// --- CV markdown parsing ---------------------------------------------------
//
// content/cv/*.md front matter carries only the flat identity/contact
// scalars (name, tagline, location, email, website, linkedin, github,
// photo); every other section — summary, work experience, core expertise,
// technical stack, interests, selected engineering work, earlier roles,
// leadership & community, education & training, language skills — is
// parsed from the body, per the grammar documented on each section's
// parser below. This grammar is fixed and MUST stay identical to
// web/lib/cvContent.js's parser — a JS/Go divergence here is exactly the
// drift the renderer-parity reviewer exists to catch.
//
// A summary paragraph, a job's summary/note, or an evidence/community
// detail may wrap a span of text in "<sz-tag>text</sz-tag>" (real HTML, a
// Lit web component on the web side) — this parser resolves each such
// span to backtick-wrapped "`text`" so Glamour renders it distinctly (see
// resolveSzTag in content.go), paired with cvGlamourStyle's chip-styled
// Code look (glamour_theme.go). Structured list/bullet items (expertise,
// technical stack, interests, job highlights/groups) carry no markup at
// all — extracted verbatim, no substitution.

var (
	reWorkExperienceHeading = regexp.MustCompile(`(?m)^## Work experience\s*$`)
	reCoreExpertiseHeading  = regexp.MustCompile(`(?m)^## Core expertise\s*$`)
	reTechnicalStackHeading = regexp.MustCompile(`(?m)^## Technical stack\s*$`)
	reInterestsHeading      = regexp.MustCompile(`(?m)^## Interests\s*$`)
	reSelectedWorkHeading   = regexp.MustCompile(`(?m)^## Selected engineering work\s*$`)
	reEarlierRolesHeading   = regexp.MustCompile(`(?m)^## Earlier roles\s*$`)
	reCommunityHeading      = regexp.MustCompile(`(?m)^## Leadership & community\s*$`)
	reEducationHeading      = regexp.MustCompile(`(?m)^## Education & training\s*$`)
	reLanguagesHeading      = regexp.MustCompile(`(?m)^## Language skills\s*$`)
	reH2Heading             = regexp.MustCompile(`(?m)^## `)
	reJobHeading            = regexp.MustCompile(`(?m)^### (.+)$`)
	reBlankLine             = regexp.MustCompile(`\n\s*\n`)
	reItalicLine            = regexp.MustCompile(`^\*(.+)\*$`)
	reGroupLabel            = regexp.MustCompile(`^\*\*(.+)\*\*$`)
	reBulletLine            = regexp.MustCompile(`^-\s+(.+)$`)
	rePeriodLike            = regexp.MustCompile(`[0-9]`)
	// reLabelDetail matches the "**label.** detail" paragraph shape shared
	// by "## Selected engineering work" and "## Leadership & community"
	// entries.
	reLabelDetail = regexp.MustCompile(`(?s)^\*\*(.+?)\.\*\*\s*(.*)$`)
	// reTrailingLink matches a paragraph ending in a Markdown link, used to
	// split an evidence entry's detail from its trailing "[link text](url)".
	reTrailingLink = regexp.MustCompile(`(?s)^(.*?)\s*\[([^\]]+)\]\([^)]+\)\s*$`)
	// reEarlierLine matches an "## Earlier roles" bullet's "role — company
	// · period" shape.
	reEarlierLine = regexp.MustCompile(`^(.+?)\s+—\s+(.+?)\s+·\s+(.+)$`)
	// reBoldDashLine matches the "**name** — rest" bullet shape shared by
	// "## Education & training" and "## Language skills" entries.
	reBoldDashLine = regexp.MustCompile(`^\*\*(.+?)\*\*\s*—\s*(.+)$`)
)

// parseCVBody parses everything after a content/cv/*.md file's front
// matter: leading paragraphs (before the first "## " heading) become
// summary, a "## Work experience" section (if present) becomes the
// repeated ### job-block experience list, "## Core expertise" and
// "## Technical stack" (if present) become repeated ### skill groups,
// "## Interests" (if present) becomes a flat bullet list, "## Selected
// engineering work"/"## Leadership & community" (if present) become
// paragraph-per-entry evidence/community lists, "## Earlier roles" (if
// present) becomes a flat bullet list plus an optional clients list, and
// "## Education & training"/"## Language skills" (if present) become
// their own flat bullet lists — each parsed independently, so a variant
// body overriding only one of these sections leaves the others nil. path
// names the source file for resolveSzTag's and each section parser's
// malformed-input warnings. Malformed input degrades gracefully section
// by section — this runs on every SSH session, not in a one-shot build,
// so a bad file must not take the server down (the same tolerant spirit
// as readJSON's silently-ignored unmarshal error).
func parseCVBody(body, path string) (summary []string, experience []CVExperience, expertise, skills []CVSkillGroup, interests []string, evidence []CVEvidence, earlier []CVEarlier, earlierClients []string, community []CVCommunity, education []CVEducation, languages []CVLanguage) {
	body = strings.ReplaceAll(body, "\r\n", "\n")

	summaryText := body
	if loc := reH2Heading.FindStringIndex(body); loc != nil {
		summaryText = body[:loc[0]]
	}
	for _, p := range splitParagraphs(summaryText) {
		summary = append(summary, resolveSzTag(p, path))
	}

	if section, ok := findH2Section(body, reWorkExperienceHeading); ok {
		experience = parseCVJobs(section, path)
	}
	if section, ok := findH2Section(body, reCoreExpertiseHeading); ok {
		expertise = parseCVSkillSection(section)
	}
	if section, ok := findH2Section(body, reTechnicalStackHeading); ok {
		skills = parseCVSkillSection(section)
	}
	if section, ok := findH2Section(body, reInterestsHeading); ok {
		interests = parseBulletLines(section)
	}
	if section, ok := findH2Section(body, reSelectedWorkHeading); ok {
		evidence = parseCVEvidence(section, path)
	}
	if section, ok := findH2Section(body, reEarlierRolesHeading); ok {
		earlier, earlierClients = parseCVEarlier(section, path)
	}
	if section, ok := findH2Section(body, reCommunityHeading); ok {
		community = parseCVCommunity(section, path)
	}
	if section, ok := findH2Section(body, reEducationHeading); ok {
		education = parseCVEducation(section, path)
	}
	if section, ok := findH2Section(body, reLanguagesHeading); ok {
		languages = parseCVLanguages(section, path)
	}

	return summary, experience, expertise, skills, interests, evidence, earlier, earlierClients, community, education, languages
}

// findH2Section returns the text between a "## <heading>" line (matched by
// heading) and the next "## " heading (or the end of body), and whether
// heading matched at all — shared by every named "## " section this
// grammar recognises.
func findH2Section(body string, heading *regexp.Regexp) (string, bool) {
	loc := heading.FindStringIndex(body)
	if loc == nil {
		return "", false
	}
	rest := body[loc[1]:]
	if next := reH2Heading.FindStringIndex(rest); next != nil {
		rest = rest[:next[0]]
	}
	return rest, true
}

// parseLabelDetailParagraph splits a "**label.** detail" paragraph — the
// shared shape behind "## Selected engineering work" and "## Leadership &
// community" entries — into its label and detail text. ok is false when p
// doesn't open with a well-formed "**label.**" span.
func parseLabelDetailParagraph(p string) (label, detail string, ok bool) {
	m := reLabelDetail.FindStringSubmatch(p)
	if m == nil {
		return "", "", false
	}
	return strings.TrimSpace(m[1]), strings.TrimSpace(m[2]), true
}

// parseCVEvidence splits a "## Selected engineering work" section's text
// into its paragraph-per-entry "**label.** detail [link text](url)"
// entries. The trailing Markdown link, if present, contributes only its
// visible text as Link — never its URL — matching today's bare-domain
// display convention. A paragraph missing its "**label.**" opener is
// skipped and logged rather than mis-parsed.
func parseCVEvidence(text, path string) []CVEvidence {
	var out []CVEvidence
	for _, p := range splitParagraphs(text) {
		label, rest, ok := parseLabelDetailParagraph(p)
		if !ok {
			log.Warn("malformed CV evidence entry, missing **label.** opener", "path", path, "text", p)
			continue
		}
		detail, link := rest, ""
		if lm := reTrailingLink.FindStringSubmatch(rest); lm != nil {
			detail, link = strings.TrimSpace(lm[1]), lm[2]
		}
		out = append(out, CVEvidence{Label: label, Detail: resolveSzTag(detail, path), Link: link})
	}
	return out
}

// parseCVEarlier splits a "## Earlier roles" section's text into its flat
// "- role — company · period" bullets, plus an optional trailing
// "Representative clients:" paragraph — the same clients-line convention
// a job block's Clients field uses (see parseCVJob). A bullet line that
// doesn't match the "role — company · period" shape is skipped and
// logged rather than silently mis-parsed.
func parseCVEarlier(text, path string) (earlier []CVEarlier, clients []string) {
	for _, p := range splitParagraphs(text) {
		if strings.HasPrefix(p, "Representative clients:") {
			clients = splitCommaList(strings.TrimPrefix(p, "Representative clients:"))
			continue
		}
		for _, line := range parseBulletLines(p) {
			m := reEarlierLine.FindStringSubmatch(line)
			if m == nil {
				log.Warn("malformed CV earlier-role bullet, skipping", "path", path, "text", line)
				continue
			}
			earlier = append(earlier, CVEarlier{
				Role:    strings.TrimSpace(m[1]),
				Company: strings.TrimSpace(m[2]),
				Period:  strings.TrimSpace(m[3]),
			})
		}
	}
	return earlier, clients
}

// parseCVCommunity splits a "## Leadership & community" section's text
// into its paragraph-per-entry "**label.** detail" entries — the same
// shape as parseCVEvidence, but with no trailing link to extract. A
// paragraph missing its "**label.**" opener is skipped and logged.
func parseCVCommunity(text, path string) []CVCommunity {
	var out []CVCommunity
	for _, p := range splitParagraphs(text) {
		label, detail, ok := parseLabelDetailParagraph(p)
		if !ok {
			log.Warn("malformed CV community entry, missing **label.** opener", "path", path, "text", p)
			continue
		}
		out = append(out, CVCommunity{Label: label, Detail: resolveSzTag(detail, path)})
	}
	return out
}

// parseCVEducation splits a "## Education & training" section's text into
// its flat "- **school** — detail" bullets. A bullet not matching that
// shape is skipped and logged.
func parseCVEducation(text, path string) []CVEducation {
	var out []CVEducation
	for _, line := range parseBulletLines(text) {
		m := reBoldDashLine.FindStringSubmatch(line)
		if m == nil {
			log.Warn("malformed CV education bullet, skipping", "path", path, "text", line)
			continue
		}
		out = append(out, CVEducation{School: strings.TrimSpace(m[1]), Detail: strings.TrimSpace(m[2])})
	}
	return out
}

// parseCVLanguages splits a "## Language skills" section's text into its
// flat "- **name** — level[ · note]" bullets. A bullet not matching that
// shape is skipped and logged.
func parseCVLanguages(text, path string) []CVLanguage {
	var out []CVLanguage
	for _, line := range parseBulletLines(text) {
		m := reBoldDashLine.FindStringSubmatch(line)
		if m == nil {
			log.Warn("malformed CV language bullet, skipping", "path", path, "text", line)
			continue
		}
		name := strings.TrimSpace(m[1])
		level, note := strings.TrimSpace(m[2]), ""
		if idx := strings.Index(level, " · "); idx >= 0 {
			level, note = strings.TrimSpace(level[:idx]), strings.TrimSpace(level[idx+len(" · "):])
		}
		out = append(out, CVLanguage{Name: name, Level: level, Note: note})
	}
	return out
}

// splitParagraphs splits text on blank lines, trimming and dropping
// empties.
func splitParagraphs(text string) []string {
	var out []string
	for _, p := range reBlankLine.Split(strings.TrimSpace(text), -1) {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// parseCVJobs splits a "## Work experience" section's text into its
// "### "-headed job blocks and parses each. path is threaded through for
// resolveSzTag's malformed-<sz-tag> warnings.
func parseCVJobs(text, path string) []CVExperience {
	headings := reJobHeading.FindAllStringSubmatchIndex(text, -1)
	if headings == nil {
		return nil
	}
	jobs := make([]CVExperience, 0, len(headings))
	for i, h := range headings {
		title := text[h[2]:h[3]]
		blockStart := h[1]
		blockEnd := len(text)
		if i+1 < len(headings) {
			blockEnd = headings[i+1][0]
		}
		jobs = append(jobs, parseCVJob(title, text[blockStart:blockEnd], path))
	}
	return jobs
}

// parseCVSkillSection splits a "## Core expertise"/"## Technical stack"
// section's text into its repeated "### <label>" groups, each followed by
// a bullet list — the same repeated-"### "-heading shape as a job's
// Groups, but with none of a job block's other fields (role, company, meta
// line, clients, note); kept as its own function rather than a literal
// reuse of parseCVJob for that reason, sharing only bullet-line extraction
// (parseBulletLines). Bullets are plain text, no per-item markup at all —
// no substitution needed (see the grammar note above parseCVBody).
func parseCVSkillSection(text string) []CVSkillGroup {
	headings := reJobHeading.FindAllStringSubmatchIndex(text, -1)
	if headings == nil {
		return nil
	}
	groups := make([]CVSkillGroup, 0, len(headings))
	for i, h := range headings {
		label := text[h[2]:h[3]]
		blockStart := h[1]
		blockEnd := len(text)
		if i+1 < len(headings) {
			blockEnd = headings[i+1][0]
		}
		items := parseBulletLines(text[blockStart:blockEnd])
		groups = append(groups, CVSkillGroup{Label: strings.TrimSpace(label), Items: items})
	}
	return groups
}

// parseCVJob parses one "### <role> — <company>[ · via <via>]" job block:
// the title line plus everything up to the next job heading (or the end of
// the section) — the optional "*location · period*" line, the job summary
// paragraph, any number of "**label**" groups and/or a bare bullet
// highlights list, an optional "Representative clients:" line, and an
// optional trailing note paragraph. path is threaded through for
// resolveSzTag's malformed-<sz-tag> warnings.
func parseCVJob(title, block, path string) CVExperience {
	job := CVExperience{}
	job.Role, job.Company, job.Via = splitJobTitle(title)

	paras := splitParagraphs(block)
	i := 0
	if i < len(paras) {
		if m := reItalicLine.FindStringSubmatch(paras[i]); m != nil {
			job.Location, job.Period = splitLocationPeriod(m[1])
			i++
		}
	}
	if i < len(paras) && !isStructuredParagraph(paras[i]) {
		job.Summary = resolveSzTag(paras[i], path)
		i++
	}
	for ; i < len(paras); i++ {
		p := paras[i]
		switch {
		case strings.HasPrefix(p, "Representative clients:"):
			job.Clients = splitCommaList(strings.TrimPrefix(p, "Representative clients:"))
		case isGroupParagraph(p):
			label, items := parseGroupParagraph(p)
			job.Groups = append(job.Groups, CVGroup{Label: label, Items: items})
		case isBulletParagraph(p):
			job.Highlights = append(job.Highlights, parseBulletLines(p)...)
		default:
			resolved := resolveSzTag(p, path)
			if job.Note == "" {
				job.Note = resolved
			} else {
				job.Note += "\n\n" + resolved
			}
		}
	}
	return job
}

// splitJobTitle splits a job heading's title text ("<role> — <company>[ ·
// via <via>]") into its three parts.
func splitJobTitle(title string) (role, company, via string) {
	role = title
	if idx := strings.Index(title, " — "); idx >= 0 {
		role = title[:idx]
		rest := title[idx+len(" — "):]
		if vi := strings.Index(rest, " · via "); vi >= 0 {
			company = rest[:vi]
			via = rest[vi+len(" · via "):]
		} else {
			company = rest
		}
	}
	return strings.TrimSpace(role), strings.TrimSpace(company), strings.TrimSpace(via)
}

// splitLocationPeriod splits a "*<location> · <period>*" line's inner text.
// When only one side is present the grammar gives no positional cue, so a
// value that looks date-like (contains a digit — every period in this CV's
// data does: a year, a range, "2023 – Present") is treated as the period;
// anything else is the location. Both current CV source files always supply
// both, so this heuristic is untested by the fixtures but must not crash on
// it.
func splitLocationPeriod(s string) (location, period string) {
	parts := strings.Split(s, " · ")
	if len(parts) == 1 {
		if rePeriodLike.MatchString(parts[0]) {
			return "", strings.TrimSpace(parts[0])
		}
		return strings.TrimSpace(parts[0]), ""
	}
	return strings.TrimSpace(parts[0]), strings.TrimSpace(strings.Join(parts[1:], " · "))
}

// splitCommaList splits a "Representative clients: a, b, c" line's payload.
func splitCommaList(s string) []string {
	var out []string
	for _, p := range strings.Split(s, ",") {
		p = strings.TrimSpace(p)
		if p != "" {
			out = append(out, p)
		}
	}
	return out
}

// isStructuredParagraph reports whether p is a group label, a bare bullet
// list, or the clients line — i.e. not the job summary paragraph.
func isStructuredParagraph(p string) bool {
	return isGroupParagraph(p) || isBulletParagraph(p) || strings.HasPrefix(p, "Representative clients:")
}

// isGroupParagraph reports whether p opens with a "**label**" line.
func isGroupParagraph(p string) bool {
	line, _, _ := strings.Cut(p, "\n")
	return reGroupLabel.MatchString(strings.TrimSpace(line))
}

// parseGroupParagraph splits a "**label**\n- item\n- item" paragraph into
// its label and bullet items.
func parseGroupParagraph(p string) (label string, items []string) {
	line, rest, _ := strings.Cut(p, "\n")
	if m := reGroupLabel.FindStringSubmatch(strings.TrimSpace(line)); m != nil {
		label = m[1]
	}
	return label, parseBulletLines(rest)
}

// isBulletParagraph reports whether every non-blank line of p is a bare
// "- item" bullet (no preceding "**label**" line).
func isBulletParagraph(p string) bool {
	lines := strings.Split(p, "\n")
	for _, l := range lines {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		if !reBulletLine.MatchString(l) {
			return false
		}
	}
	return true
}

// parseBulletLines extracts each "- item" line's text.
func parseBulletLines(p string) []string {
	var items []string
	for _, l := range strings.Split(p, "\n") {
		l = strings.TrimSpace(l)
		if l == "" {
			continue
		}
		if m := reBulletLine.FindStringSubmatch(l); m != nil {
			items = append(items, m[1])
		}
	}
	return items
}
