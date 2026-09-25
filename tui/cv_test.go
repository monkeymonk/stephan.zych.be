package main

// tui/cv.go's markdown parser is the Go half of a grammar that must stay
// identical to web/lib/cvContent.js — a divergence there is exactly what the
// renderer-parity reviewer exists to catch (see the doc comment above
// parseCVBody). These tests exercise every piece of that grammar end to end:
// front-matter extraction (now identity/contact scalars only — every other
// field is body-sourced), job-block parsing (including the optional meta
// line, groups-vs-highlights and clients-line branches), the plain-bullet
// "## Core expertise"/"## Technical stack"/"## Interests" sections, each of
// the newer body sections ("## Selected engineering work", "## Earlier
// roles", "## Leadership & community", "## Education & training", "##
// Language skills"), the "<sz-tag>...</sz-tag>" marker (well-formed,
// malformed, and its priority over the generic sz-* widget rule in
// stripHTML) and exactly which fields it applies to, and variant loading
// (data.go's loadCVVariants, model.go's resolveCVVariant — each variant
// file is a complete, standalone CV, no merge step) built on top of it —
// plus setCVVariant's re-render-in-place behaviour.

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

// loadCV's front matter now carries only the flat identity/contact scalars;
// everything else — including list-of-object fields like evidence that used
// to round-trip through front-matter YAML — is body-sourced and must be
// ignored if a stray front-matter key of the same name is present.
func TestLoadCVFrontMatterExtraction(t *testing.T) {
	t.Run("minimal identity/contact scalars", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "index.md")
		const src = `---
name: Jane Doe
tagline: Staff Engineer
location: Ghent, Belgium
email: jane@example.test
website: example.test
linkedin: linkedin.com/in/janedoe
github: github.com/janedoe
photo: /assets/jane.jpg
---

An intro paragraph about Jane.
`
		if err := os.WriteFile(path, []byte(src), 0o644); err != nil {
			t.Fatalf("writing fixture: %v", err)
		}

		cv := loadCV(path)

		want := struct{ Name, Tagline, Location, Email, Website, Linkedin, Github, Photo string }{
			"Jane Doe", "Staff Engineer", "Ghent, Belgium", "jane@example.test",
			"example.test", "linkedin.com/in/janedoe", "github.com/janedoe", "/assets/jane.jpg",
		}
		got := struct{ Name, Tagline, Location, Email, Website, Linkedin, Github, Photo string }{
			cv.Basics.Name, cv.Basics.Tagline, cv.Basics.Location, cv.Basics.Email,
			cv.Basics.Website, cv.Basics.Linkedin, cv.Basics.Github, cv.Basics.Photo,
		}
		if got != want {
			t.Errorf("loadCV basics = %+v, want %+v", got, want)
		}
		if cv.Basics.Pdf != "/cv/print/" {
			t.Errorf("Basics.Pdf = %q, want /cv/print/ (loadCV's fixed base value)", cv.Basics.Pdf)
		}
		if len(cv.Summary) != 1 || cv.Summary[0] != "An intro paragraph about Jane." {
			t.Errorf("Summary = %+v, want a single intro paragraph", cv.Summary)
		}
		if cv.Evidence != nil {
			t.Errorf("Evidence = %+v, want nil: body has no Selected engineering work heading", cv.Evidence)
		}
	})

	// A malformed fixture front matter with stray evidence/earlier keys
	// (the old front-matter shape) must simply be ignored — these fields
	// are only ever read from the body now.
	t.Run("stray front-matter keys for body-sourced sections are ignored", func(t *testing.T) {
		dir := t.TempDir()
		path := filepath.Join(dir, "index.md")
		const src = `---
name: Jane Doe
tagline: Staff Engineer
location: Ghent, Belgium
email: jane@example.test
website: example.test
linkedin: linkedin.com/in/janedoe
github: github.com/janedoe
photo: /assets/jane.jpg
evidence:
  - label: Should not appear
    detail: This came from front matter and must be ignored.
    link: nope.test
earlier:
  - role: Should not appear
    company: Nope
    period: "2000"
---

## Selected engineering work

**Real entry.** This came from the body, the only source read for this field.
`
		if err := os.WriteFile(path, []byte(src), 0o644); err != nil {
			t.Fatalf("writing fixture: %v", err)
		}

		cv := loadCV(path)

		if len(cv.Evidence) != 1 || cv.Evidence[0].Label != "Real entry" {
			t.Errorf("Evidence = %+v, want a single body-sourced entry labelled \"Real entry\"", cv.Evidence)
		}
		for _, e := range cv.Evidence {
			if e.Label == "Should not appear" {
				t.Errorf("Evidence contains the front-matter evidence: entry, want it ignored: %+v", cv.Evidence)
			}
		}
		if cv.Earlier != nil {
			t.Errorf("Earlier = %+v, want nil: the front-matter earlier: key must be ignored and the body has no Earlier roles heading", cv.Earlier)
		}
	})
}

// parseCVJob's title line, optional "*location · period*" line, summary
// paragraph, "**label**" groups vs bare-bullet highlights, and the trailing
// "Representative clients:" line are each independently optional — this
// table exercises both a block with every optional piece present and one
// with none of them. Job-block parsing itself is unchanged by the format
// revision, so this coverage stays as it was.
func TestParseCVJobBlocks(t *testing.T) {
	cases := []struct {
		name  string
		title string
		block string
		want  CVExperience
	}{
		{
			name:  "via, meta line, groups, clients",
			title: "Lead Developer — CBTW · via STEPHANZYCH",
			block: "*Brussels, Belgium · 2023 – Present*\n\n" +
				"Hands-on lead developer in the technical team.\n\n" +
				"**Architecture & technical direction**\n" +
				"- Own architecture and technical decisions\n" +
				"- Define technical standards\n\n" +
				"Representative clients: Acme, Globex",
			want: CVExperience{
				Role: "Lead Developer", Company: "CBTW", Via: "STEPHANZYCH",
				Location: "Brussels, Belgium", Period: "2023 – Present",
				Summary: "Hands-on lead developer in the technical team.",
				Groups: []CVGroup{{
					Label: "Architecture & technical direction",
					Items: []string{"Own architecture and technical decisions", "Define technical standards"},
				}},
				Clients: []string{"Acme", "Globex"},
			},
		},
		{
			name:  "no via, no meta line, plain highlights, no clients",
			title: "Freelance Web Developer — Independent",
			block: "Built small business websites and campaign microsites.\n\n" +
				"- Delivered project one\n" +
				"- Delivered project two",
			want: CVExperience{
				Role: "Freelance Web Developer", Company: "Independent",
				Summary:    "Built small business websites and campaign microsites.",
				Highlights: []string{"Delivered project one", "Delivered project two"},
			},
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := parseCVJob(tc.title, tc.block, "test.md")
			if !reflect.DeepEqual(got, tc.want) {
				t.Errorf("parseCVJob(%q, ...) =\n%+v\nwant\n%+v", tc.title, got, tc.want)
			}
		})
	}
}

// A job's summary and its trailing note both go through resolveSzTag (per
// parseCVJob's title comment); a bare-bullet highlight does not — <sz-tag>
// markup is only ever authored in prose fields, never inside a job's
// highlights/groups bullets, so parseCVJob doesn't resolve those.
func TestParseCVJobResolvesSzTagInSummaryAndNoteOnly(t *testing.T) {
	block := "Working on <sz-tag>React</sz-tag> apps for clients.\n\n" +
		"- Shipped feature X\n\n" +
		"Also mentoring <sz-tag>junior engineers</sz-tag> on the side."
	got := parseCVJob("Advisor — Acme", block, "test.md")

	if got.Summary != "Working on `React` apps for clients." {
		t.Errorf("Summary = %q, want the <sz-tag> span resolved to a backtick span", got.Summary)
	}
	if got.Note != "Also mentoring `junior engineers` on the side." {
		t.Errorf("Note = %q, want the <sz-tag> span resolved to a backtick span", got.Note)
	}
	if want := []string{"Shipped feature X"}; !reflect.DeepEqual(got.Highlights, want) {
		t.Errorf("Highlights = %+v, want %+v", got.Highlights, want)
	}
}

// splitLocationPeriod's single-value heuristic: with no "·" to split on, a
// digit-bearing value (every period in this CV's data has one — a year, a
// range, "2023 – Present") is treated as the period; anything else is the
// location.
func TestSplitLocationPeriod(t *testing.T) {
	cases := []struct {
		in, wantLocation, wantPeriod string
	}{
		{"Brussels, Belgium · 2023 – Present", "Brussels, Belgium", "2023 – Present"},
		{"2023 – Present", "", "2023 – Present"},
		{"Remote", "Remote", ""},
		{"Remote · Present", "Remote", "Present"},
	}
	for _, tc := range cases {
		loc, period := splitLocationPeriod(tc.in)
		if loc != tc.wantLocation || period != tc.wantPeriod {
			t.Errorf("splitLocationPeriod(%q) = (%q, %q), want (%q, %q)", tc.in, loc, period, tc.wantLocation, tc.wantPeriod)
		}
	}
}

// parseCVSkillSection parses the repeated "### <label>" + bullet blocks a
// "## Core expertise"/"## Technical stack" section is made of. Bullets are
// now plain text with no per-item markup at all — items come out exactly as
// written, byte-for-byte, with no backtick-wrapping or other substitution.
func TestParseCVSkillSection(t *testing.T) {
	text := "\n### Frontend\n- React\n- TypeScript\n\n### Backend\n- Go\n"

	got := parseCVSkillSection(text)
	want := []CVSkillGroup{
		{Label: "Frontend", Items: []string{"React", "TypeScript"}},
		{Label: "Backend", Items: []string{"Go"}},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("parseCVSkillSection() =\n%+v\nwant\n%+v", got, want)
	}
}

// A flat "## Interests" bullet list, now plain text with no markup at all,
// exercised via parseCVBody (which also proves the leading paragraph still
// becomes Summary and that every other section stays nil when its heading
// is absent).
func TestParseCVBodyInterestsPlainBullets(t *testing.T) {
	body := "Intro paragraph about me.\n\n## Interests\n- Chess\n- Cycling\n"

	summary, experience, expertise, skills, interests, evidence, earlier, earlierClients, community, education, languages :=
		parseCVBody(body, "test.md")

	if want := []string{"Intro paragraph about me."}; !reflect.DeepEqual(summary, want) {
		t.Errorf("summary = %+v, want %+v", summary, want)
	}
	if experience != nil {
		t.Errorf("experience = %+v, want nil: no Work experience heading present", experience)
	}
	if expertise != nil {
		t.Errorf("expertise = %+v, want nil: no Core expertise heading present", expertise)
	}
	if skills != nil {
		t.Errorf("skills = %+v, want nil: no Technical stack heading present", skills)
	}
	if want := []string{"Chess", "Cycling"}; !reflect.DeepEqual(interests, want) {
		t.Errorf("interests = %+v, want %+v (plain bullets, no markup)", interests, want)
	}
	if evidence != nil {
		t.Errorf("evidence = %+v, want nil", evidence)
	}
	if earlier != nil || earlierClients != nil {
		t.Errorf("earlier = %+v, earlierClients = %+v, want both nil", earlier, earlierClients)
	}
	if community != nil {
		t.Errorf("community = %+v, want nil", community)
	}
	if education != nil {
		t.Errorf("education = %+v, want nil", education)
	}
	if languages != nil {
		t.Errorf("languages = %+v, want nil", languages)
	}
}

// parseCVEvidence splits "## Selected engineering work" into its
// paragraph-per-entry "**label.** detail [link text](url)" entries — one
// with a trailing link, one without.
func TestParseCVEvidence(t *testing.T) {
	text := "**Project Alpha.** Built the whole thing end to end, mentioning <sz-tag>Go</sz-tag>. [example.com/alpha](https://example.com/alpha)\n\n" +
		"**Project Beta.** Shipped without a case study link."

	got := parseCVEvidence(text, "test.md")
	want := []CVEvidence{
		{Label: "Project Alpha", Detail: "Built the whole thing end to end, mentioning `Go`.", Link: "example.com/alpha"},
		{Label: "Project Beta", Detail: "Shipped without a case study link.", Link: ""},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("parseCVEvidence() =\n%+v\nwant\n%+v", got, want)
	}
}

// parseCVEarlier splits "## Earlier roles" into its flat "role — company ·
// period" bullets, plus an optional trailing "Representative clients:" line.
func TestParseCVEarlier(t *testing.T) {
	cases := []struct {
		name        string
		text        string
		wantEarlier []CVEarlier
		wantClients []string
	}{
		{
			name: "with trailing clients line",
			text: "- Freelance Web Developer — Independent · 2011 – 2016\n" +
				"- Rich Media Developer — TBWA Group · 2012 – 2013\n\n" +
				"Representative clients: IKEA, Sony Pictures",
			wantEarlier: []CVEarlier{
				{Role: "Freelance Web Developer", Company: "Independent", Period: "2011 – 2016"},
				{Role: "Rich Media Developer", Company: "TBWA Group", Period: "2012 – 2013"},
			},
			wantClients: []string{"IKEA", "Sony Pictures"},
		},
		{
			name: "no trailing clients line",
			text: "- Freelance Web Developer — Independent · 2011 – 2016",
			wantEarlier: []CVEarlier{
				{Role: "Freelance Web Developer", Company: "Independent", Period: "2011 – 2016"},
			},
			wantClients: nil,
		},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			earlier, clients := parseCVEarlier(tc.text, "test.md")
			if !reflect.DeepEqual(earlier, tc.wantEarlier) {
				t.Errorf("earlier =\n%+v\nwant\n%+v", earlier, tc.wantEarlier)
			}
			if !reflect.DeepEqual(clients, tc.wantClients) {
				t.Errorf("clients = %+v, want %+v", clients, tc.wantClients)
			}
		})
	}
}

// parseCVCommunity splits "## Leadership & community" into its
// paragraph-per-entry "**label.** detail" entries — the same shape as
// parseCVEvidence, but with no trailing link to extract.
func TestParseCVCommunity(t *testing.T) {
	text := "**Internal tech talks · CBTW.** Talks on terminal tooling, mentioning <sz-tag>Go</sz-tag>.\n\n" +
		"**Member, Réseau Entreprendre Bruxelles.** 2019 – 2023"

	got := parseCVCommunity(text, "test.md")
	want := []CVCommunity{
		{Label: "Internal tech talks · CBTW", Detail: "Talks on terminal tooling, mentioning `Go`."},
		{Label: "Member, Réseau Entreprendre Bruxelles", Detail: "2019 – 2023"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("parseCVCommunity() =\n%+v\nwant\n%+v", got, want)
	}
}

// parseCVEducation splits "## Education & training" into its flat "-
// **school** — detail" bullets.
func TestParseCVEducation(t *testing.T) {
	text := "- **Académie Royale des Beaux-Arts de Bruxelles** — Bachelor: Plastic, Visual & Spatial Arts\n" +
		"- **Université Libre de Bruxelles** — Computer Science studies"

	got := parseCVEducation(text, "test.md")
	want := []CVEducation{
		{School: "Académie Royale des Beaux-Arts de Bruxelles", Detail: "Bachelor: Plastic, Visual & Spatial Arts"},
		{School: "Université Libre de Bruxelles", Detail: "Computer Science studies"},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("parseCVEducation() =\n%+v\nwant\n%+v", got, want)
	}
}

// parseCVLanguages splits "## Language skills" into its flat "- **name** —
// level[ · note]" bullets — the trailing note is optional.
func TestParseCVLanguages(t *testing.T) {
	text := "- **French** — C2 · Native\n- **English** — B2"

	got := parseCVLanguages(text, "test.md")
	want := []CVLanguage{
		{Name: "French", Level: "C2", Note: "Native"},
		{Name: "English", Level: "B2", Note: ""},
	}
	if !reflect.DeepEqual(got, want) {
		t.Errorf("parseCVLanguages() =\n%+v\nwant\n%+v", got, want)
	}
}

// resolveSzTag: a well-formed span resolves to a backtick span, multiple
// spans in one string each resolve independently, text with no <sz-tag> at
// all passes through unchanged (the early-return path), and a malformed
// unmatched "<sz-tag>" or "</sz-tag>" (no pair) is left as the raw literal
// text, byte-for-byte, rather than dropped, mangled, or panicking.
func TestResolveSzTag(t *testing.T) {
	cases := []struct {
		name, in, want string
	}{
		{"well-formed single tag", "<sz-tag>React</sz-tag>", "`React`"},
		{"multiple tags in one string", "Built with <sz-tag>React</sz-tag> and <sz-tag>Go</sz-tag>.", "Built with `React` and `Go`."},
		{"plain text with no tags", "plain text, no markers", "plain text, no markers"},
		{"unmatched opening tag", "Something <sz-tag>broken with no close", "Something <sz-tag>broken with no close"},
		{"unmatched closing tag", "Something </sz-tag> stray with no open", "Something </sz-tag> stray with no open"},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			got := resolveSzTag(tc.in, "test.md")
			if got != tc.want {
				t.Errorf("resolveSzTag(%q) = %q, want %q (byte-for-byte, no panic)", tc.in, got, tc.want)
			}
		})
	}
}

// stripHTML's priority ordering is the one genuinely tricky invariant here:
// a well-formed <sz-tag> pair must survive as backtick text even though a
// generic, unrecognised sz-* widget tag elsewhere in the very same input is
// still deleted by the fallback rule — exercised with both in one string.
func TestStripHTMLSzTagSurvivesWhileGenericSzWidgetIsDeleted(t *testing.T) {
	in := `Built with <sz-tag>React</sz-tag> and <sz-icon name="code"></sz-icon> everywhere.`

	got := stripHTML(in)

	if !strings.Contains(got, "`React`") {
		t.Errorf("stripHTML(%q) = %q, want it to contain the backtick-wrapped <sz-tag> content", in, got)
	}
	if strings.Contains(got, "<sz-tag") || strings.Contains(got, "</sz-tag") {
		t.Errorf("stripHTML(%q) = %q, want no raw <sz-tag> markup left behind", in, got)
	}
	if strings.Contains(got, "<sz-icon") || strings.Contains(got, "</sz-icon") {
		t.Errorf("stripHTML(%q) = %q, want the generic unrecognised sz-icon widget tag deleted", in, got)
	}
}

// resolveSzTag is applied to every free-text CV field parseCVBody produces —
// the top-level summary, a job's summary and note, an evidence detail, and a
// community detail — but never to a structured list/bullet item (expertise,
// technical stack, interests, job highlights, job groups): a <sz-tag> span
// written inside one of those is left as literal, unresolved text, since the
// grammar never calls for resolving it there.
func TestSzTagResolvedOnlyOnFreeTextFields(t *testing.T) {
	body := "Intro with <sz-tag>Go</sz-tag> mentioned inline.\n\n" +
		"## Work experience\n\n" +
		"### Engineer — Acme\n\n" +
		"Summary mentioning <sz-tag>React</sz-tag> here.\n\n" +
		"- Highlight bullet mentioning <sz-tag>Vue</sz-tag> literally\n\n" +
		"Also a closing note about <sz-tag>Go</sz-tag> again.\n\n" +
		"## Core expertise\n\n" +
		"### Frontend\n" +
		"- <sz-tag>React</sz-tag>\n\n" +
		"## Interests\n" +
		"- <sz-tag>Chess</sz-tag>\n\n" +
		"## Selected engineering work\n\n" +
		"**Project.** Detail mentioning <sz-tag>Go</sz-tag>.\n\n" +
		"## Leadership & community\n\n" +
		"**Talk.** Detail mentioning <sz-tag>Go</sz-tag> again.\n"

	summary, experience, expertise, _, interests, evidence, _, _, community, _, _ := parseCVBody(body, "test.md")

	if want := []string{"Intro with `Go` mentioned inline."}; !reflect.DeepEqual(summary, want) {
		t.Errorf("top-level summary = %+v, want %+v (resolved)", summary, want)
	}

	if len(experience) != 1 {
		t.Fatalf("experience = %+v, want exactly one job", experience)
	}
	job := experience[0]
	if job.Summary != "Summary mentioning `React` here." {
		t.Errorf("job.Summary = %q, want the <sz-tag> resolved", job.Summary)
	}
	if job.Note != "Also a closing note about `Go` again." {
		t.Errorf("job.Note = %q, want the <sz-tag> resolved", job.Note)
	}
	if want := []string{"Highlight bullet mentioning <sz-tag>Vue</sz-tag> literally"}; !reflect.DeepEqual(job.Highlights, want) {
		t.Errorf("job.Highlights = %+v, want %+v (a structured bullet's <sz-tag> left unresolved)", job.Highlights, want)
	}

	if want := []CVSkillGroup{{Label: "Frontend", Items: []string{"<sz-tag>React</sz-tag>"}}}; !reflect.DeepEqual(expertise, want) {
		t.Errorf("expertise = %+v, want %+v (a structured bullet's <sz-tag> left unresolved)", expertise, want)
	}
	if want := []string{"<sz-tag>Chess</sz-tag>"}; !reflect.DeepEqual(interests, want) {
		t.Errorf("interests = %+v, want %+v (a structured bullet's <sz-tag> left unresolved)", interests, want)
	}

	if len(evidence) != 1 || evidence[0].Detail != "Detail mentioning `Go`." {
		t.Errorf("evidence = %+v, want a single entry with Detail resolved", evidence)
	}
	if len(community) != 1 || community[0].Detail != "Detail mentioning `Go` again." {
		t.Errorf("community = %+v, want a single entry with Detail resolved", community)
	}
}

// loadCVVariants: each variant file is parsed as a complete, standalone CV
// via the same loadCV logic the base gets — no merge step, no per-field
// nil-tracking. A front-matter-only file (slug, label, tagline — no body)
// yields a CVData whose Basics reflect that front matter and whose
// body-derived fields are all empty, since its body has no sections to
// parse. A file with a body override ("## Core expertise") populates that
// field from its own body, plain bullet text, no markup.
func TestLoadCVVariants(t *testing.T) {
	dir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(dir, "cv"), 0o755); err != nil {
		t.Fatalf("mkdir: %v", err)
	}
	// index.md is excluded by loadCVVariants regardless of content.
	if err := os.WriteFile(filepath.Join(dir, "cv", "index.md"), []byte("---\nname: Base\n---\n"), 0o644); err != nil {
		t.Fatalf("writing index.md: %v", err)
	}
	framingOnly := "---\nslug: framing\nlabel: Framing Only\ntagline: A different framing\n---\n"
	bodyOverride := "---\nslug: body\nlabel: Body Override\n---\n\n## Core expertise\n\n### Frontend\n- React\n"
	if err := os.WriteFile(filepath.Join(dir, "cv", "framing.md"), []byte(framingOnly), 0o644); err != nil {
		t.Fatalf("writing framing.md: %v", err)
	}
	if err := os.WriteFile(filepath.Join(dir, "cv", "body.md"), []byte(bodyOverride), 0o644); err != nil {
		t.Fatalf("writing body.md: %v", err)
	}

	variants := loadCVVariants(dir)
	byslug := map[string]CVVariant{}
	for _, v := range variants {
		byslug[v.Slug] = v
	}
	if len(variants) != 2 {
		t.Fatalf("loadCVVariants returned %d variants, want 2 (index.md excluded): %+v", len(variants), variants)
	}

	framing, ok := byslug["framing"]
	if !ok {
		t.Fatal("no \"framing\" variant loaded")
	}
	if framing.Label != "Framing Only" {
		t.Errorf("framing.Label = %q, want Framing Only", framing.Label)
	}
	if framing.CV.Basics.Tagline != "A different framing" {
		t.Errorf("framing.CV.Basics.Tagline = %q, want %q", framing.CV.Basics.Tagline, "A different framing")
	}
	if framing.CV.Expertise != nil || framing.CV.Experience != nil || framing.CV.Summary != nil {
		t.Errorf("framing-only variant has body-derived fields set: Expertise=%+v Experience=%+v Summary=%+v",
			framing.CV.Expertise, framing.CV.Experience, framing.CV.Summary)
	}
	if framing.CV.Basics.Pdf != "/cv/print/framing/" {
		t.Errorf("framing.CV.Basics.Pdf = %q, want /cv/print/framing/", framing.CV.Basics.Pdf)
	}

	body, ok := byslug["body"]
	if !ok {
		t.Fatal("no \"body\" variant loaded")
	}
	if body.CV.Basics.Tagline != "" {
		t.Errorf("body.CV.Basics.Tagline = %q, want empty: this file's front matter doesn't set tagline", body.CV.Basics.Tagline)
	}
	wantExpertise := []CVSkillGroup{{Label: "Frontend", Items: []string{"React"}}}
	if !reflect.DeepEqual(body.CV.Expertise, wantExpertise) {
		t.Errorf("body.CV.Expertise = %+v, want %+v (plain bullet text, no markup)", body.CV.Expertise, wantExpertise)
	}
	if body.CV.Experience != nil {
		t.Errorf("body.CV.Experience = %+v, want nil: this variant's body has no Work experience heading", body.CV.Experience)
	}
}

// resolveCVVariant, exercised against the two real acceptance-criteria
// fixtures (content/cv/php.md, content/cv/react.md) plus the base
// content/cv/index.md: the default (empty-slug) variant returns the base
// unchanged, each real variant is its own complete, standalone parse (no
// merge step) whose tagline/expertise reflect that file's own content and
// whose pdf path is computed per slug, an unknown slug falls back to the
// base unchanged, and a section duplicated verbatim rather than reworded
// per role (Education) parses byte-identically across all three files.
func TestResolveCVVariantRealFixtures(t *testing.T) {
	base := loadCV(filepath.Join("..", "content", "cv", "index.md"))
	if base.Basics.Name == "" {
		t.Fatal("base CV loaded empty — content/cv/index.md missing or unreadable")
	}
	variants := loadCVVariants(filepath.Join("..", "content"))

	m := Model{data: &SiteData{CV: base, Variants: variants}}

	def := m.resolveCVVariant("")
	if !reflect.DeepEqual(def, base) {
		t.Errorf("resolveCVVariant(\"\") differs from the base CV")
	}

	unknown := m.resolveCVVariant("does-not-exist")
	if !reflect.DeepEqual(unknown, base) {
		t.Errorf("resolveCVVariant(unknown slug) differs from the base CV, want an unchanged fallback")
	}

	php := m.resolveCVVariant("php")
	if want := "Senior Fullstack PHP Developer · Laravel · JavaScript / TypeScript"; php.Basics.Tagline != want {
		t.Errorf("php.Basics.Tagline = %q, want %q", php.Basics.Tagline, want)
	}
	if php.Basics.Pdf != "/cv/print/php/" {
		t.Errorf("php.Basics.Pdf = %q, want /cv/print/php/", php.Basics.Pdf)
	}
	if len(php.Expertise) == 0 || len(php.Expertise[0].Items) == 0 || php.Expertise[0].Items[0] != "PHP application development" {
		t.Errorf("php.Expertise = %+v, want its first group's first item to be the plain PHP-development bullet", php.Expertise)
	}

	react := m.resolveCVVariant("react")
	if want := "Senior Fullstack React Developer · TypeScript · PHP / Laravel"; react.Basics.Tagline != want {
		t.Errorf("react.Basics.Tagline = %q, want %q", react.Basics.Tagline, want)
	}
	if react.Basics.Pdf != "/cv/print/react/" {
		t.Errorf("react.Basics.Pdf = %q, want /cv/print/react/", react.Basics.Pdf)
	}
	if len(react.Expertise) == 0 || len(react.Expertise[0].Items) == 0 || react.Expertise[0].Items[0] != "React" {
		t.Errorf("react.Expertise = %+v, want its first group's first item to be the plain React bullet", react.Expertise)
	}

	if len(base.Education) == 0 {
		t.Fatal("base.Education is empty — content/cv/index.md's Education fixture is required for this assertion")
	}
	if !reflect.DeepEqual(def.Education, base.Education) ||
		!reflect.DeepEqual(php.Education, base.Education) ||
		!reflect.DeepEqual(react.Education, base.Education) {
		t.Errorf("Education diverged across variants: default=%+v php=%+v react=%+v, want all identical to base=%+v",
			def.Education, php.Education, react.Education, base.Education)
	}
}

// LoadData's CVLabel and paletteSpecs()'s cv usage line must reflect
// content/cv/index.md's own `label:` front matter and the live
// content/cv/*.md variant roster — not a hardcoded "default CV" string or
// a hand-listed "cv php / cv react" that silently goes stale the moment a
// new variant file (e.g. lead.md) is added without a matching Go edit.
func TestCVLabelAndPaletteSpecsReflectRealVariants(t *testing.T) {
	data := LoadData(filepath.Join("..", "content"), filepath.Join("..", "content", "data"))
	if data.CVLabel == "" {
		t.Fatal("LoadData().CVLabel is empty — content/cv/index.md's label front matter is required for this assertion")
	}

	m := &Model{data: data}
	var baseHint string
	found := false
	for _, it := range m.navItems() {
		if it.label == "cv" {
			baseHint = it.hint
			found = true
		}
	}
	if !found {
		t.Fatal("navItems() has no \"cv\" entry for the base/default variant")
	}
	if want := data.CVLabel + " CV"; baseHint != want {
		t.Errorf("base cv palette item hint = %q, want %q (derived from CVLabel, not hardcoded)", baseHint, want)
	}

	var cvUsage string
	for _, s := range (Model{data: data}).paletteSpecs() {
		if strings.HasPrefix(s.usage, ": cv") {
			cvUsage = s.usage
		}
	}
	for _, v := range data.Variants {
		if !strings.Contains(cvUsage, "cv "+v.Slug) {
			t.Errorf("paletteSpecs() cv usage line %q is missing variant %q — it must be derived from data.Variants, not a hand-listed roster", cvUsage, v.Slug)
		}
	}
}

// setCVVariant switches m.cvVariant, rebuilds content.Pages["cv"], and — the
// case this test targets — re-renders the reader in place when it's already
// open on the cv page: both the underlying article and the viewport's
// rendered output must change, not just the model's variant field.
func TestSetCVVariantRerendersReaderInPlace(t *testing.T) {
	content, err := LoadContent(filepath.Join("..", "content"))
	if err != nil {
		t.Fatalf("LoadContent: %v", err)
	}
	data := LoadData(filepath.Join("..", "content"), filepath.Join("..", "content", "data"))

	m := NewModel(content, data, nil, 100, 40)
	if _, ok := m.content.Pages["cv"]; !ok {
		t.Fatal("NewModel didn't register the cv page")
	}

	m.openReader(m.content.Pages["cv"])
	if m.screen != screenReader || m.readerArticle.Slug != "cv" {
		t.Fatalf("openReader didn't open the cv page: screen=%v slug=%q", m.screen, m.readerArticle.Slug)
	}
	if m.cvVariant != "" {
		t.Fatalf("cvVariant = %q before any switch, want empty", m.cvVariant)
	}
	beforeArticleBody := m.readerArticle.Body
	beforeView := m.reader.View()

	m.setCVVariant("php")

	if m.cvVariant != "php" {
		t.Errorf("cvVariant = %q after setCVVariant(\"php\"), want php", m.cvVariant)
	}
	const wantTagline = "Fullstack PHP Developer"
	if !strings.Contains(m.content.Pages["cv"].Body, wantTagline) {
		t.Errorf("content.Pages[cv] wasn't rebuilt for the php variant: missing %q", wantTagline)
	}
	if m.readerArticle.Body == beforeArticleBody {
		t.Error("readerArticle.Body unchanged after setCVVariant: the reader wasn't updated in place")
	}
	if !strings.Contains(m.readerArticle.Body, wantTagline) {
		t.Errorf("readerArticle.Body wasn't updated to the php variant: missing %q", wantTagline)
	}
	if m.reader.View() == beforeView {
		t.Error("reader.View() unchanged after setCVVariant: the viewport wasn't re-rendered")
	}
}
