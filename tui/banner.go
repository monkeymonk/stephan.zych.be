package main

import (
	"math"
	"math/rand/v2"
	"strings"

	"github.com/charmbracelet/lipgloss"
)

// Home banner rotation: a fixed-size stage that cycles through the same
// animated "stephan" art variants the web home shows (web/src/layouts/banners/*.ts),
// at a fraction of the frame rate and with runs of equal style batched into
// one Render call each, since every frame goes over SSH.

const (
	bannerStageRows    = 16
	bannerStageMaxCols = 112
	bannerMinRowsSmall = 9 // shrink floor for short terminals
	bannerSmallWidth   = 56
	// bannerAdvanceFrames is how many home frames (24fps) elapse before the
	// rotation moves to the next variant: 480 frames == 20s.
	bannerAdvanceFrames = 480
	// bannerFrameDiv converts homeFrame deltas (24fps) into variant frames
	// (12fps): half the redraws, same perceived animation speed as web.
	bannerFrameDiv = 2
)

// bannerCtx is the read-only context passed to a variant's render function.
// It carries everything a pure function of (frame) needs, so View() stays
// side-effect free even though Model is copied by value.
type bannerCtx struct {
	cols, rows int
	bitmap     [][]bool // word pixel bitmap, rows*2 tall, built once per stage size
	art        []string // half-block collapse of bitmap, centered in the stage
	wordmark   []string // ASCII-art wordmark lines, for the "current" variant
	st         *Styles
	seed       uint64 // per-session seed, stable across frames/variants
	// sim carries state for the stepped simulations (fire, life, rain...):
	// a pointer, so it survives Model being copied by value. Use bannerSimAt.
	sim *bannerSim
}

// bannerSim is the incremental state of a stepped simulation variant. tag
// identifies (variant, stage size, run); a mismatch, or a frame that went
// backwards, resets it, so rendering stays a function of (ctx, frame).
type bannerSim struct {
	tag   string
	frame int
	data  any
}

// bannerSimAt returns the simulation state for tag advanced to frame:
// init builds frame 0, step advances one frame. Rendering the same frame
// twice does not step again.
func bannerSimAt[T any](ctx *bannerCtx, tag string, frame int, init func() T, step func(T, int) T) T {
	sim := ctx.sim
	if sim == nil {
		sim = &bannerSim{}
	}
	cur, ok := sim.data.(T)
	if !ok || sim.tag != tag || frame < sim.frame {
		cur, sim.tag, sim.frame = init(), tag, 0
	}
	for sim.frame < frame {
		sim.frame++
		cur = step(cur, sim.frame)
	}
	sim.data = cur
	return cur
}

// bannerVariant is one registered animated look. render must be a pure
// function of (ctx, frame): no mutation of ctx, no randomness besides the
// deterministic hash below, so the same frame always renders the same way.
type bannerVariant struct {
	id     string
	render func(ctx *bannerCtx, frame int) []string
}

// bannerVariants is the registry: add a variant by appending one entry here
// plus its render function below. Order defines nothing semantic (the bag
// shuffles it), but keep it matching the web registry for readability.
var bannerVariants = []bannerVariant{
	{id: "current", render: renderBannerCurrent},
	{id: "decrypt", render: renderBannerDecrypt},
	{id: "glitch", render: renderBannerGlitch},
	{id: "rainbow", render: renderBannerRainbow},
	{id: "wave", render: renderBannerWave},
	{id: "stack", render: renderBannerStack},
	{id: "spin", render: renderBannerSpin},
	{id: "donut", render: renderBannerDonut},
	{id: "rain", render: renderBannerRain},
	{id: "plasma", render: renderBannerPlasma},
	{id: "fire", render: renderBannerFire},
	{id: "life", render: renderBannerLife},
}

// bannerHash is a small deterministic integer hash used by variants that
// need "random-looking" but reproducible per-cell behaviour: the same
// (seed, frame, x, y) always yields the same value, so a frame can be
// re-rendered (or tested) without state. Based on splitmix64.
func bannerHash(seed uint64, frame, x, y int) uint64 {
	h := seed ^ uint64(int64(frame))*0x9E3779B97F4A7C15
	h ^= uint64(int64(x)) * 0xBF58476D1CE4E5B9
	h ^= uint64(int64(y)) * 0x94D049BB133111EB
	h ^= h >> 33
	h *= 0xFF51AFD7ED558CCD
	h ^= h >> 33
	h *= 0xC4CEB9FE1A85EC53
	h ^= h >> 33
	return h
}

// bannerHashFloat returns a float64 in [0, 1) from bannerHash.
func bannerHashFloat(seed uint64, frame, x, y int) float64 {
	return float64(bannerHash(seed, frame, x, y)>>11) / (1 << 53)
}

// wordBitmap builds the boolean pixel grid for word out of the shared
// BannerData glyphs: glyphGap blank columns between letters, an unknown rune
// renders as a blank glyphCols-wide column. Mirrors
// web/src/layouts/banners/core.ts wordBitmap; iterates runes, not bytes, so
// multi-byte glyphs like 'é' map to a single column group.
func wordBitmap(b BannerData, word string) [][]bool {
	letters := []rune(word)
	if b.GlyphRows <= 0 || b.GlyphCols <= 0 || len(letters) == 0 {
		return nil
	}
	cols := len(letters)*b.GlyphCols + (len(letters)-1)*b.GlyphGap
	if cols < b.GlyphCols {
		cols = b.GlyphCols
	}
	grid := make([][]bool, b.GlyphRows)
	for r := range grid {
		grid[r] = make([]bool, cols)
	}
	for i, letter := range letters {
		glyph := b.Glyphs[string(letter)]
		if glyph == nil {
			continue
		}
		colStart := i * (b.GlyphCols + b.GlyphGap)
		for row := 0; row < b.GlyphRows && row < len(glyph); row++ {
			line := glyph[row]
			lineRunes := []rune(line)
			for col := 0; col < b.GlyphCols && col < len(lineRunes); col++ {
				if lineRunes[col] == '#' {
					grid[row][colStart+col] = true
				}
			}
		}
	}
	return grid
}

// halfBlock collapses row pairs of a boolean grid into half-block
// characters: both set -> full block, top only -> upper half, bottom only ->
// lower half, neither -> space. Mirrors core.ts halfBlock.
func halfBlock(bitmap [][]bool) []string {
	lines := make([]string, 0, (len(bitmap)+1)/2)
	for row := 0; row < len(bitmap); row += 2 {
		top := bitmap[row]
		var bottom []bool
		if row+1 < len(bitmap) {
			bottom = bitmap[row+1]
		} else {
			bottom = make([]bool, len(top))
		}
		var b strings.Builder
		for col := 0; col < len(top); col++ {
			t := top[col]
			var bo bool
			if col < len(bottom) {
				bo = bottom[col]
			}
			switch {
			case t && bo:
				b.WriteRune('█')
			case t:
				b.WriteRune('▀')
			case bo:
				b.WriteRune('▄')
			default:
				b.WriteRune(' ')
			}
		}
		lines = append(lines, b.String())
	}
	return lines
}

// padLines pads every line to the width of the widest one, so stacked
// layers align. Mirrors core.ts padLines.
func padLines(lines []string) []string {
	width := 0
	for _, l := range lines {
		if w := lipgloss.Width(l); w > width {
			width = w
		}
	}
	out := make([]string, len(lines))
	for i, l := range lines {
		if w := lipgloss.Width(l); w < width {
			l += strings.Repeat(" ", width-w)
		}
		out[i] = l
	}
	return out
}

// centerOffsets computes the row/col offset to center a width x height
// block inside a cols x rows stage. Mirrors core.ts centerOffsets.
func centerOffsets(width, height, cols, rows int) (colOffset, rowOffset int) {
	colOffset = (cols - width) / 2
	if colOffset < 0 {
		colOffset = 0
	}
	rowOffset = (rows - height) / 2
	if rowOffset < 0 {
		rowOffset = 0
	}
	return
}

// centerBitmap centers a pixel-resolution boolean bitmap inside a cols x
// (rows*2) pixel grid (char rows are halved by halfBlock). Mirrors core.ts
// centerBitmap.
func centerBitmap(bitmap [][]bool, cols, rows int) [][]bool {
	pixelRows := rows * 2
	height := len(bitmap)
	width := 0
	if height > 0 {
		width = len(bitmap[0])
	}
	colOffset, rowOffset := centerOffsets(width, height, cols, pixelRows)
	// Keep the pixel offset even so halfBlock pairs the same glyph rows as
	// the web art (an odd offset re-pairs them and the letters go ragged).
	rowOffset &^= 1
	grid := make([][]bool, pixelRows)
	for r := range grid {
		grid[r] = make([]bool, cols)
	}
	for r := 0; r < height; r++ {
		rr := r + rowOffset
		if rr < 0 || rr >= pixelRows {
			continue
		}
		for c := 0; c < width; c++ {
			cc := c + colOffset
			if cc < 0 || cc >= cols {
				continue
			}
			grid[rr][cc] = bitmap[r][c]
		}
	}
	return grid
}

// centerLinesInStage centers character-grid lines inside a cols x rows
// stage, padding with spaces. Mirrors core.ts centerInStage. Always returns
// exactly rows lines, each exactly cols cells wide.
func centerLinesInStage(lines []string, cols, rows int) []string {
	height := len(lines)
	width := 0
	for _, l := range lines {
		if w := lipgloss.Width(l); w > width {
			width = w
		}
	}
	colOffset, rowOffset := centerOffsets(width, height, cols, rows)
	blankRow := strings.Repeat(" ", cols)
	out := make([]string, rows)
	for r := 0; r < rows; r++ {
		sr := r - rowOffset
		if sr < 0 || sr >= height {
			out[r] = blankRow
			continue
		}
		line := lines[sr]
		if w := lipgloss.Width(line); w < width {
			line += strings.Repeat(" ", width-w)
		}
		pad := cols - colOffset - width
		if pad < 0 {
			pad = 0
		}
		out[r] = strings.Repeat(" ", colOffset) + line + strings.Repeat(" ", pad)
	}
	return out
}

// renderRuns renders a line of cells by grouping consecutive cells sharing
// the same style into one style.Render call, instead of one escape sequence
// per cell: the frame goes over SSH every redraw, so fewer, longer ANSI runs
// matter for bandwidth. styleAt(col) returns nil for a plain (unstyled)
// space. cells must have exactly len(cells) == cols runes/cells; width is
// taken as rune count (banner content is always single-width glyphs).
func renderRuns(cells []rune, styleAt func(col int) *lipgloss.Style) string {
	var b strings.Builder
	start := 0
	var curStyle *lipgloss.Style
	flush := func(end int) {
		if end <= start {
			return
		}
		run := string(cells[start:end])
		if curStyle == nil {
			b.WriteString(run)
		} else {
			b.WriteString(curStyle.Render(run))
		}
	}
	for i := 0; i < len(cells); i++ {
		st := styleAt(i)
		sameStyle := (st == nil && curStyle == nil) || (st != nil && curStyle != nil && st == curStyle)
		if i == 0 {
			curStyle = st
			continue
		}
		if !sameStyle {
			flush(i)
			start = i
			curStyle = st
		}
	}
	flush(len(cells))
	return b.String()
}

// bannerStageSize computes the stage size for the current layout: cols is
// the available home body width, clamped to bannerStageMaxCols; rows shrink
// from bannerStageRows down to bannerMinRowsSmall when the home screen
// would not otherwise fit the terminal height. staticOnly reports when the
// terminal is too narrow for animation at all (width < bannerSmallWidth),
// in which case the caller should fall back to the static centered
// wordmark.
func bannerStageSize(availWidth, termHeight, otherLines int) (cols, rows int, staticOnly bool) {
	// cols = min(availWidth, bannerStageMaxCols): the stage must never
	// overflow the body and get cut mid-escape by fitLine. Below
	// bannerSmallWidth it gives way to the static wordmark instead.
	cols = availWidth
	if cols > bannerStageMaxCols {
		cols = bannerStageMaxCols
	}
	rows = bannerStageRows
	if termHeight > 0 {
		for rows > bannerMinRowsSmall && rows+otherLines > termHeight {
			rows--
		}
	}
	staticOnly = availWidth < bannerSmallWidth
	return
}

// newBannerCtx builds the bitmap/art once for a given stage size, from the
// shared BannerData (content/data/startScreen.json). Never hardcoded here.
func newBannerCtx(data BannerData, wordmark []string, st *Styles, cols, rows int, seed uint64) *bannerCtx {
	bitmap := centerBitmap(wordBitmap(data, data.Word), cols, rows)
	art := padLines(halfBlock(bitmap))
	return &bannerCtx{
		cols: cols, rows: rows,
		bitmap:   bitmap,
		art:      art,
		wordmark: wordmark,
		st:       st,
		seed:     seed,
	}
}

// ---------------------------------------------------------------------------
// 1. current: the plain wordmark, replaying the light-sweep intro each time
// this variant comes up in rotation (wordmarkLines, splash.go).
// ---------------------------------------------------------------------------

func renderBannerCurrent(ctx *bannerCtx, frame int) []string {
	// The 59-col wordmark does not fit a stage narrower than that: show the
	// 54-col half-block name, solid, so the stage still never overflows.
	if len(ctx.wordmark) > 0 && lipgloss.Width(ctx.wordmark[0]) > ctx.cols {
		lines := make([]string, len(ctx.art))
		for i, l := range ctx.art {
			lines[i] = ctx.st.HomeWordmark.Render(l)
		}
		return centerLinesInStage(lines, ctx.cols, ctx.rows)
	}
	lines := wordmarkLines(ctx.wordmark, frame, ctx.st.SplashBase, ctx.st.SplashHot, ctx.st.SplashGlow, ctx.st.HomeWordmark)
	return centerLinesInStage(lines, ctx.cols, ctx.rows)
}

// ---------------------------------------------------------------------------
// 2. decrypt: block noise resolving left-to-right into the art, then
// occasional single-letter re-scramble bursts. Mirrors decrypt.ts, but
// deterministic in frame instead of wall-clock driven.
// ---------------------------------------------------------------------------

const (
	bannerDecryptNoiseChars  = "░▒▓<>/\\|_=+*#%@"
	bannerDecryptLockFrames  = 28 // frames (12fps) for the initial resolve sweep
	bannerDecryptRescramble  = 90 // frames between rescramble bursts
	bannerDecryptBurstFrames = 7  // how long a rescramble burst lasts
	bannerDecryptGlyphCols   = 8  // approx glyph width in art columns, for grouping
)

// bannerDecryptNoise is bannerDecryptNoiseChars as runes, built once rather
// than per cell.
var bannerDecryptNoise = []rune(bannerDecryptNoiseChars)

func renderBannerDecrypt(ctx *bannerCtx, frame int) []string {
	stageArt := centerLinesInStage(ctx.art, ctx.cols, ctx.rows)
	artWidth := 0
	if len(ctx.art) > 0 {
		artWidth = lipgloss.Width(ctx.art[0])
	}
	colOffset, _ := centerOffsets(artWidth, len(ctx.art), ctx.cols, ctx.rows)

	cyclePos := frame
	if bannerDecryptRescramble > 0 && cyclePos > bannerDecryptLockFrames {
		cyclePos = bannerDecryptLockFrames + (frame-bannerDecryptLockFrames)%bannerDecryptRescramble
	}
	burstActive := cyclePos >= bannerDecryptLockFrames && cyclePos < bannerDecryptLockFrames+bannerDecryptBurstFrames
	glyphCount := (artWidth + bannerDecryptGlyphCols - 1) / bannerDecryptGlyphCols
	burstGlyph := -1
	if burstActive && glyphCount > 0 {
		cycleIndex := (frame - bannerDecryptLockFrames) / bannerDecryptRescramble
		burstGlyph = cycleIndex % glyphCount
	}

	out := make([]string, ctx.rows)
	for row := 0; row < ctx.rows; row++ {
		line := []rune(stageArt[row])
		cells := make([]rune, len(line))
		styles := make([]*lipgloss.Style, len(line))
		for col, ch := range line {
			if ch == ' ' {
				cells[col] = ' '
				continue
			}
			lockAt := (col-colOffset)/2 + 4
			glyphIndex := -1
			if bannerDecryptGlyphCols > 0 {
				glyphIndex = (col - colOffset) / bannerDecryptGlyphCols
			}
			forcedScramble := burstActive && glyphIndex == burstGlyph
			locked := frame >= lockAt && !forcedScramble
			if locked {
				cells[col] = ch
				styles[col] = &ctx.st.BannerLock
			} else {
				cells[col] = bannerDecryptNoise[bannerHash(ctx.seed, frame, col, row)%uint64(len(bannerDecryptNoise))]
				styles[col] = &ctx.st.BannerNoise
			}
		}
		out[row] = renderRuns(cells, func(col int) *lipgloss.Style { return styles[col] })
	}
	return out
}

// ---------------------------------------------------------------------------
// 3. glitch: solid art, with periodic short bursts where some rows shift 1-3
// cols and tint red/teal, otherwise plain accent. Mirrors glitch.ts's RGB
// split, translated from CSS layers to a text-mode row shift + tint.
// ---------------------------------------------------------------------------

const (
	bannerGlitchPeriod = 60 // frames between bursts
	bannerGlitchLen    = 5  // burst length in frames
)

func renderBannerGlitch(ctx *bannerCtx, frame int) []string {
	stageArt := centerLinesInStage(ctx.art, ctx.cols, ctx.rows)
	inBurst := frame%bannerGlitchPeriod < bannerGlitchLen

	out := make([]string, ctx.rows)
	for row := 0; row < ctx.rows; row++ {
		line := stageArt[row]
		if !inBurst {
			out[row] = ctx.st.BannerGlitchMain.Render(line)
			continue
		}
		shiftSeed := bannerHash(ctx.seed, frame, 0, row)
		shift := int(shiftSeed%7) - 3 // -3..3
		tintPick := bannerHash(ctx.seed, frame, 1, row) % 3
		shifted := shiftLine(line, shift, ctx.cols)
		switch tintPick {
		case 0:
			out[row] = ctx.st.BannerGlitchRed.Render(shifted)
		case 1:
			out[row] = ctx.st.BannerGlitchTeal.Render(shifted)
		default:
			out[row] = ctx.st.BannerGlitchMain.Render(shifted)
		}
	}
	return out
}

// shiftLine shifts a cols-wide line horizontally by n cells (positive =
// right), filling the vacated side with spaces and dropping overflow, so the
// result stays exactly cols cells wide.
func shiftLine(line string, n, cols int) string {
	r := []rune(line)
	if len(r) < cols {
		r = append(r, []rune(strings.Repeat(" ", cols-len(r)))...)
	}
	if len(r) > cols {
		r = r[:cols]
	}
	out := make([]rune, cols)
	for i := range out {
		out[i] = ' '
	}
	for i := 0; i < cols; i++ {
		src := i - n
		if src >= 0 && src < cols {
			out[i] = r[src]
		}
	}
	return string(out)
}

// ---------------------------------------------------------------------------
// 4. rainbow: art colored by a diagonal hue band cycling through the theme
// palette over time. Mirrors rainbow.ts's animated gradient clip.
// ---------------------------------------------------------------------------

func renderBannerRainbow(ctx *bannerCtx, frame int) []string {
	stageArt := centerLinesInStage(ctx.art, ctx.cols, ctx.rows)
	palette := ctx.st.BannerRainbow
	n := len(palette)
	out := make([]string, ctx.rows)
	for row := 0; row < ctx.rows; row++ {
		line := []rune(stageArt[row])
		out[row] = renderRuns(line, func(col int) *lipgloss.Style {
			if n == 0 || line[col] == ' ' {
				return nil
			}
			band := (col + row + frame) % n
			if band < 0 {
				band += n
			}
			return &palette[band]
		})
	}
	return out
}

// ---------------------------------------------------------------------------
// 9. wave: art rows offset by a sine of x and time, plus a sparse twinkling
// star field in the empty stage space. Mirrors wave.ts.
// ---------------------------------------------------------------------------

const bannerWaveStarDensity = 40 // one star per this many stage cells

func renderBannerWave(ctx *bannerCtx, frame int) []string {
	bitmap := ctx.bitmap
	pixelRows := len(bitmap)
	canvas := make([][]bool, pixelRows)
	for r := range canvas {
		canvas[r] = make([]bool, ctx.cols)
	}
	// Web: dy = 3*sin(tMs*0.003 + x*0.1); one TUI frame is 1000/12 ms.
	t := float64(frame) * 1000 / 12
	for x := 0; x < ctx.cols; x++ {
		dy := int(math.Round(3 * math.Sin(t*0.003+float64(x)*0.1)))
		for y := 0; y < pixelRows; y++ {
			cy := y + dy
			if bitmap[y][x] && cy >= 0 && cy < pixelRows {
				canvas[cy][x] = true
			}
		}
	}
	nameLines := halfBlock(canvas)

	// Stars drift left in the empty space (web: 30fps steps, so 2.5 per
	// TUI frame) and never draw over the name.
	grid := make([][]rune, ctx.rows)
	styles := make([][]*lipgloss.Style, ctx.rows)
	for r := range grid {
		grid[r] = []rune(nameLines[r])
		styles[r] = make([]*lipgloss.Style, ctx.cols)
	}
	waveStyles := ctx.st.BannerWave
	band := int(t * 0.02)
	for r := range grid {
		for c, ch := range grid[r] {
			if ch != ' ' && len(waveStyles) > 0 {
				styles[r][c] = &waveStyles[((c+band)/6)%len(waveStyles)]
			}
		}
	}
	starCount := max(1, (ctx.cols*ctx.rows)/bannerWaveStarDensity)
	for s := 0; s < starCount; s++ {
		row := int(bannerHash(ctx.seed, s, 7, 0) % uint64(ctx.rows))
		speed := 0.3 + bannerHashFloat(ctx.seed, s, 9, 0)*0.9
		start := bannerHashFloat(ctx.seed, s, 11, 0) * float64(ctx.cols)
		col := int(math.Floor(start-float64(frame)*speed*2.5)) % ctx.cols
		if col < 0 {
			col += ctx.cols
		}
		if grid[row][col] == ' ' {
			grid[row][col] = '.'
			if bannerHash(ctx.seed, s, 13, 0)%2 == 0 {
				grid[row][col] = '*'
			}
			styles[row][col] = &ctx.st.BannerStar
		}
	}
	out := make([]string, ctx.rows)
	for r := range grid {
		st := styles[r]
		out[r] = renderRuns(grid[r], func(c int) *lipgloss.Style { return st[c] })
	}
	return out
}

// ---------------------------------------------------------------------------
// 11. stack: tetris-like build of the art from falling block pieces, hold,
// then clear and repeat. Mirrors stack.ts, with frame-deterministic landing
// instead of wall-clock timers.
// ---------------------------------------------------------------------------

const (
	bannerStackDropFramesPerRow = 2  // frames (12fps) each block row takes to fall one step
	bannerStackHoldFrames       = 48 // hold fully-built art before clearing
	bannerStackClearFrames      = 2  // frames per cleared row
)

// bannerStackPiece is one 2x2 block of the centered bitmap.
type bannerStackPiece struct {
	blockRow, blockCol int
	launchOrder        int // launch order within its row group, after shuffling
}

// buildStackPieces groups the bitmap into blockRows x blockCols 2x2 pieces
// (skipping empty ones), shuffles within each row group (seeded, so
// deterministic across frames), then launches bottom row group first.
func buildStackPieces(bitmap [][]bool, blockRows, blockCols int, seed uint64) []bannerStackPiece {
	groups := make([][]bannerStackPiece, blockRows)
	for br := 0; br < blockRows; br++ {
		for bc := 0; bc < blockCols; bc++ {
			r0, c0 := br*2, bc*2
			if r0+1 >= len(bitmap) || c0+1 >= len(bitmap[0]) {
				continue
			}
			has := bitmap[r0][c0] || bitmap[r0][c0+1] || bitmap[r0+1][c0] || bitmap[r0+1][c0+1]
			if !has {
				continue
			}
			groups[br] = append(groups[br], bannerStackPiece{blockRow: br, blockCol: bc})
		}
	}
	var order []bannerStackPiece
	for br := blockRows - 1; br >= 0; br-- {
		group := groups[br]
		// deterministic shuffle keyed by seed and row
		for i := len(group) - 1; i > 0; i-- {
			j := int(bannerHash(seed, br, i, 0) % uint64(i+1))
			group[i], group[j] = group[j], group[i]
		}
		order = append(order, group...)
	}
	for i := range order {
		order[i].launchOrder = i / 4
	}
	return order
}

func renderBannerStack(ctx *bannerCtx, frame int) []string {
	pixelRows := len(ctx.bitmap)
	width := 0
	if pixelRows > 0 {
		width = len(ctx.bitmap[0])
	}
	blockRows := pixelRows / 2
	blockCols := width / 2
	if blockRows == 0 || blockCols == 0 {
		return centerLinesInStage(nil, ctx.cols, ctx.rows)
	}
	pieces := buildStackPieces(ctx.bitmap, blockRows, blockCols, ctx.seed)

	maxLaunch := 0
	for _, p := range pieces {
		if p.launchOrder > maxLaunch {
			maxLaunch = p.launchOrder
		}
	}
	dropFrames := (maxLaunch+blockRows)*bannerStackDropFramesPerRow + 4
	holdEnd := dropFrames + bannerStackHoldFrames

	cycle := dropFrames + bannerStackHoldFrames + blockRows*bannerStackClearFrames
	if cycle <= 0 {
		cycle = 1
	}
	t := frame % cycle

	landed := make([][]bool, pixelRows)
	falling := make([][]bool, pixelRows)
	for r := range landed {
		landed[r] = make([]bool, width)
		falling[r] = make([]bool, width)
	}

	clearRow := -1
	if t >= holdEnd {
		clearRow = (t - holdEnd) / bannerStackClearFrames
	}

	for _, p := range pieces {
		launchAt := p.launchOrder * bannerStackDropFramesPerRow
		targetRow := p.blockRow * 2
		var pixelRow int
		var isLanded bool
		if t < launchAt {
			continue
		}
		dt := t - launchAt
		pr := -2 + dt // one pixel row step per frame
		if pr >= targetRow {
			pixelRow = targetRow
			isLanded = true
		} else {
			pixelRow = pr
			isLanded = false
		}
		if t >= holdEnd && clearRow >= 0 && p.blockRow < clearRow {
			continue // cleared
		}
		target := falling
		if isLanded {
			target = landed
		}
		c0 := p.blockCol * 2
		for dr := 0; dr < 2; dr++ {
			rr := pixelRow + dr
			if rr < 0 || rr >= pixelRows {
				continue
			}
			for dc := 0; dc < 2; dc++ {
				cc := c0 + dc
				if cc >= width {
					continue
				}
				if ctx.bitmap[p.blockRow*2+dr][cc] {
					target[rr][cc] = true
				}
			}
		}
	}

	landedLines := padLines(halfBlock(padBitmapToCols(landed, ctx.cols)))
	fallingLines := padLines(halfBlock(padBitmapToCols(falling, ctx.cols)))

	out := make([]string, ctx.rows)
	landedStage := centerLinesInStage(landedLines, ctx.cols, ctx.rows)
	fallingStage := centerLinesInStage(fallingLines, ctx.cols, ctx.rows)
	for row := 0; row < ctx.rows; row++ {
		ll := []rune(landedStage[row])
		fl := []rune(fallingStage[row])
		cells := make([]rune, ctx.cols)
		styles := make([]*lipgloss.Style, ctx.cols)
		for col := 0; col < ctx.cols; col++ {
			switch {
			case col < len(ll) && ll[col] != ' ':
				cells[col] = ll[col]
				styles[col] = &ctx.st.BannerLanded
			case col < len(fl) && fl[col] != ' ':
				cells[col] = fl[col]
				styles[col] = &ctx.st.BannerFalling
			default:
				cells[col] = ' '
			}
		}
		out[row] = renderRuns(cells, func(col int) *lipgloss.Style { return styles[col] })
	}
	return out
}

// padBitmapToCols widens a bitmap (already sized to the art's own pixel
// width) to cols, so halfBlock's output can be centered in the stage like
// the other variants' art.
func padBitmapToCols(bitmap [][]bool, cols int) [][]bool {
	out := make([][]bool, len(bitmap))
	for r, row := range bitmap {
		if len(row) >= cols {
			out[r] = row[:cols]
			continue
		}
		nr := make([]bool, cols)
		copy(nr, row)
		out[r] = nr
	}
	return out
}

// ---------------------------------------------------------------------------
// Rotation bag: a shuffled order of every variant, advanced once per
// bannerAdvanceFrames home frames, so every variant plays once before any
// repeats and the same variant never plays twice in a row.
// ---------------------------------------------------------------------------

// newBannerBag returns a fresh random permutation of all variant indices.
func newBannerBag(rng *rand.Rand) []int {
	n := len(bannerVariants)
	bag := make([]int, n)
	for i := range bag {
		bag[i] = i
	}
	rng.Shuffle(n, func(i, j int) { bag[i], bag[j] = bag[j], bag[i] })
	return bag
}

// newBannerSession picks the session's random starting variant index, seed,
// and initial bag (for the variant after the starting one).
func newBannerSession() (startIndex int, bag []int, seed uint64) {
	seed = rand.Uint64()
	rng := rand.New(rand.NewPCG(seed, seed^0xD1B54A32D192ED03))
	startIndex = rng.IntN(len(bannerVariants))
	bag = newBannerBag(rng)
	// Never start on the start index immediately again at the front of the
	// bag: swap it to the end if it is first and there is more than one
	// variant, so the next advance cannot repeat.
	if len(bag) > 1 && bag[0] == startIndex {
		bag[0], bag[len(bag)-1] = bag[len(bag)-1], bag[0]
	}
	return
}

// nextBannerVariant pops the next index off the bag, refilling with a fresh
// shuffle (never repeating the just-played variant immediately) when empty.
func nextBannerVariant(bag []int, prevIndex int, rng *rand.Rand) (next int, rest []int) {
	if len(bag) == 0 {
		bag = newBannerBag(rng)
		if len(bag) > 1 && bag[0] == prevIndex {
			// avoid an immediate repeat across a bag boundary
			bag[0], bag[len(bag)-1] = bag[len(bag)-1], bag[0]
		}
	}
	return bag[0], bag[1:]
}

// advanceBanner moves the rotation on once the playing variant has had its
// bannerAdvanceFrames. Called from the animMsg case, after homeFrame++.
func (m *Model) advanceBanner() {
	if m.bannerRng == nil || m.homeFrame-m.bannerStart < bannerAdvanceFrames {
		return
	}
	m.bannerIndex, m.bannerBag = nextBannerVariant(m.bannerBag, m.bannerIndex, m.bannerRng)
	m.bannerStart = m.homeFrame
}

// bannerView renders the home banner stage. below is the number of body
// lines the home screen needs under the banner, so the stage can shrink on
// short terminals instead of pushing the menu off screen. Too narrow a
// terminal gets the static, centred wordmark instead.
func (m Model) bannerView(below int) string {
	avail := m.width - 3 // shell's 1-col margin + the home body's 2-col padding
	bodyH := m.height - 3
	cols, rows, staticOnly := bannerStageSize(avail, bodyH, below)
	ss := m.data.StartScreen
	if staticOnly || len(ss.Banner.Glyphs) == 0 {
		return m.wordmarkView(ss.Wordmark, m.homeFrame)
	}
	ctx := newBannerCtx(ss.Banner, ss.Wordmark, m.st, cols, rows, m.bannerSeed)
	ctx.sim = m.bannerSim
	idx := m.bannerIndex
	if idx < 0 || idx >= len(bannerVariants) {
		idx = 0
	}
	frame := (m.homeFrame - m.bannerStart) / bannerFrameDiv
	return strings.Join(bannerVariants[idx].render(ctx, frame), "\n")
}
