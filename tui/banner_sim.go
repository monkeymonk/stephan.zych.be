package main

import (
	"fmt"
	"math"

	"github.com/charmbracelet/lipgloss"
)

// Stepped-simulation variants of the home banner (rain, plasma, fire,
// life). Mirrors web/src/layouts/banners/rain.ts, plasma.ts, fire.ts, life.ts.

// ---------------------------------------------------------------------------
// rain: matrix-style rain carving the name out of falling characters, then
// holding fully revealed, then looping. Mirrors rain.ts, but on a fixed
// loop (web stops and waits for a click; the TUI banner rotates on anyway,
// so it loops every bannerRainCycleFrames and finishes revealing well
// inside the rotation window).
// ---------------------------------------------------------------------------

const (
	bannerRainChars        = "0123456789abcdef<>*+=:"
	bannerRainCycleFrames  = 150 // ~12.5s at 12fps: full loop including hold
	bannerRainRevealFrames = 60  // ~5s: must finish revealing well before the
	// 20s rotation advances, per the framework's timing note.
)

// bannerRainRunes is bannerRainChars as runes, built once rather than per
// cell.
var bannerRainRunes = []rune(bannerRainChars)

// rainState is the incremental state for one loop of the rain simulation:
// one falling drop per column, plus which art cells have been revealed so
// far this loop.
type rainState struct {
	loopIdx  int
	revealed [][]bool // rows x cols, char resolution (matches stage art)
	head     []float64
	speed    []float64
	trail    []int
}

// initRainState seeds one drop per column, deterministic from (seed, loop).
func initRainState(seed uint64, loopIdx, cols, rows int) rainState {
	s := rainState{
		loopIdx:  loopIdx,
		revealed: make([][]bool, rows),
		head:     make([]float64, cols),
		speed:    make([]float64, cols),
		trail:    make([]int, cols),
	}
	for r := range s.revealed {
		s.revealed[r] = make([]bool, cols)
	}
	for c := 0; c < cols; c++ {
		s.head[c] = -bannerHashFloat(seed, loopIdx*7919+c, 1, 0) * float64(rows)
		s.speed[c] = 0.6 + bannerHashFloat(seed, loopIdx*7919+c, 2, 0)*1.0
		s.trail[c] = 3 + int(bannerHash(seed, loopIdx*7919+c, 3, 0)%4)
	}
	return s
}

// renderBannerRain draws the matrix rain over the centered art, revealing
// art cells as drop heads pass over them, within bannerRainRevealFrames of
// each loop; after that it holds the fully revealed name until the loop
// restarts.
func renderBannerRain(ctx *bannerCtx, frame int) []string {
	cols, rows := ctx.cols, ctx.rows
	stageArt := centerLinesInStage(ctx.art, cols, rows)
	stageArtRunes := make([][]rune, len(stageArt))
	for i, line := range stageArt {
		stageArtRunes[i] = []rune(line)
	}
	isArtCell := func(row, col int) bool {
		line := stageArtRunes[row]
		return col < len(line) && line[col] != ' '
	}

	tag := fmt.Sprintf("rain:%d:%d:%d", cols, rows, ctx.seed)
	st := bannerSimAt(ctx, tag, frame,
		func() rainState { return initRainState(ctx.seed, 0, cols, rows) },
		func(s rainState, f int) rainState {
			loopIdx := f / bannerRainCycleFrames
			t := f % bannerRainCycleFrames
			if t == 0 || loopIdx != s.loopIdx {
				s = initRainState(ctx.seed, loopIdx, cols, rows)
			}
			if t < bannerRainRevealFrames {
				for c := 0; c < cols; c++ {
					s.head[c] += s.speed[c]
					headRow := int(s.head[c])
					if headRow >= 0 && headRow < rows && isArtCell(headRow, c) {
						s.revealed[headRow][c] = true
					}
					if s.head[c]-float64(s.trail[c]) > float64(rows) {
						s.head[c] = -bannerHashFloat(ctx.seed, loopIdx*7919+c, 5, t) * 4
					}
				}
			}
			if t == bannerRainRevealFrames-1 {
				// Safety net: guarantee the name is fully legible before
				// the hold phase, regardless of per-column RNG luck.
				for r := 0; r < rows; r++ {
					for c := 0; c < cols; c++ {
						if isArtCell(r, c) {
							s.revealed[r][c] = true
						}
					}
				}
			}
			return s
		},
	)

	t := frame % bannerRainCycleFrames
	raining := t < bannerRainRevealFrames
	ramp := ctx.st.BannerRain
	nRamp := len(ramp)

	out := make([]string, rows)
	for row := 0; row < rows; row++ {
		artLine := []rune(stageArt[row])
		cells := make([]rune, cols)
		styles := make([]*lipgloss.Style, cols)
		for col := 0; col < cols; col++ {
			cells[col] = ' '
			if row < len(st.revealed) && col < len(st.revealed[row]) && st.revealed[row][col] && col < len(artLine) {
				cells[col] = artLine[col]
				if nRamp > 2 {
					styles[col] = &ramp[2]
				}
			}
		}
		if raining && nRamp > 0 {
			for col := 0; col < cols; col++ {
				head := st.head[col]
				headRow := int(head)
				dist := row - headRow
				switch {
				case dist == 0 && headRow >= 0 && headRow < rows:
					ch := bannerRainRunes[bannerHash(ctx.seed, frame, col, row)%uint64(len(bannerRainRunes))]
					cells[col] = ch
					styles[col] = &ramp[nRamp-1]
				case dist > 0 && dist <= st.trail[col]:
					ch := bannerRainRunes[bannerHash(ctx.seed, frame, col, row)%uint64(len(bannerRainRunes))]
					if cells[col] == ' ' {
						cells[col] = ch
						if dist == 1 && nRamp > 1 {
							styles[col] = &ramp[1]
						} else {
							styles[col] = &ramp[0]
						}
					}
				}
			}
		}
		out[row] = renderRuns(cells, func(col int) *lipgloss.Style { return styles[col] })
	}
	return out
}

// ---------------------------------------------------------------------------
// plasma: colour-cycling plasma field (sum of sines) filling the name, with
// a faint background field outside it. Mirrors plasma.ts; purely a function
// of (frame, x, y), so no sim state is needed.
// ---------------------------------------------------------------------------

const bannerPlasmaRamp = ".:-=+*#%@"

func renderBannerPlasma(ctx *bannerCtx, frame int) []string {
	cols, rows := ctx.cols, ctx.rows
	stageArt := centerLinesInStage(ctx.art, cols, rows)
	ramp := []rune(bannerPlasmaRamp)
	palette := ctx.st.BannerRainbow
	nPal := len(palette)
	t := float64(frame) * 0.1
	cx, cy := float64(cols)/2, float64(rows)/2

	out := make([]string, rows)
	for row := 0; row < rows; row++ {
		artLine := []rune(stageArt[row])
		cells := make([]rune, cols)
		styles := make([]*lipgloss.Style, cols)
		for col := 0; col < cols; col++ {
			isArt := col < len(artLine) && artLine[col] != ' '
			x, y := float64(col), float64(row)
			v := (math.Sin(x*0.16+t) +
				math.Sin(y*0.35-t*1.3) +
				math.Sin((x+y)*0.09+t*0.7) +
				math.Sin(math.Hypot(x-cx, y-cy)*0.22-t*1.6)) / 4
			norm := (v + 1) / 2
			if isArt {
				cells[col] = artLine[col]
				if nPal > 0 {
					bucket := int(((norm+t*0.05)-math.Floor(norm+t*0.05))*5) % nPal
					if bucket < 0 {
						bucket += nPal
					}
					styles[col] = &palette[bucket]
				}
				continue
			}
			if norm > 0.55 {
				idx := int((norm - 0.55) / 0.45 * float64(len(ramp)))
				if idx >= len(ramp) {
					idx = len(ramp) - 1
				}
				cells[col] = ramp[idx]
				styles[col] = &ctx.st.BannerNoise
			} else {
				cells[col] = ' '
			}
		}
		out[row] = renderRuns(cells, func(col int) *lipgloss.Style { return styles[col] })
	}
	return out
}

// ---------------------------------------------------------------------------
// fire: doom-fire style heat field rising from the name's silhouette, name
// drawn solid over it. Mirrors fire.ts; stepped twice per TUI frame since
// the web version advects at roughly double the TUI's 12fps.
// ---------------------------------------------------------------------------

const bannerFireStepsPerFrame = 2

// fireState is the heat buffer, rows*cols ints clamped to [0,36].
type fireState struct {
	heat []int
}

func initFireState(cols, rows int) fireState {
	return fireState{heat: make([]int, cols*rows)}
}

// fireStep advances the heat field one web-tick: refuels the name
// silhouette and the ground row, then advects every other row's heat
// upward with random drift and decay. stepIdx disambiguates the two inner
// steps taken per TUI frame so their randomness differs.
func fireStep(ctx *bannerCtx, s fireState, isArtCell func(row, col int) bool, cols, rows int, stepIdx int) fireState {
	heat := s.heat
	for col := 0; col < cols; col++ {
		for row := 0; row < rows; row++ {
			if isArtCell(row, col) {
				if bannerHashFloat(ctx.seed, stepIdx, col, row) < 0.15 {
					heat[row*cols+col] = 30
				} else {
					heat[row*cols+col] = 36
				}
			}
		}
		if !isArtCell(rows-1, col) {
			if bannerHashFloat(ctx.seed, stepIdx, col, rows+1) < 0.6 {
				heat[(rows-1)*cols+col] = int(bannerHashFloat(ctx.seed, stepIdx, col, rows+2) * 18)
			} else {
				heat[(rows-1)*cols+col] = 0
			}
		}
	}
	for y := rows - 1; y >= 1; y-- {
		for x := 0; x < cols; x++ {
			src := heat[y*cols+x]
			drift := int(bannerHashFloat(ctx.seed, stepIdx, x, y+rows)*3) - 1
			dstX := x + drift
			if dstX < 0 {
				dstX = 0
			}
			if dstX >= cols {
				dstX = cols - 1
			}
			if isArtCell(y-1, dstX) {
				continue
			}
			decay := int(bannerHashFloat(ctx.seed, stepIdx, x, y+2*rows) * 9)
			v := src - decay
			if v < 0 {
				v = 0
			}
			heat[(y-1)*cols+dstX] = v
		}
	}
	s.heat = heat
	return s
}

func renderBannerFire(ctx *bannerCtx, frame int) []string {
	cols, rows := ctx.cols, ctx.rows
	artWidth := 0
	if len(ctx.art) > 0 {
		artWidth = lipgloss.Width(ctx.art[0])
	}
	artHeight := len(ctx.art)
	if artHeight == 0 {
		return centerLinesInStage(nil, cols, rows)
	}
	fireCol := (cols - artWidth) / 2
	if fireCol < 0 {
		fireCol = 0
	}
	fireRow := rows - artHeight - 2
	if fireRow < 0 {
		fireRow = 0
	}
	// Precompute the art as a rune grid once: converting ctx.art[row] to
	// []rune inside the per-cell closures below would allocate cols*rows
	// times per frame, which is the dominant cost at this stage size.
	artRunes := make([][]rune, len(ctx.art))
	for i, line := range ctx.art {
		artRunes[i] = []rune(line)
	}
	isArtCell := func(row, col int) bool {
		ar, ac := row-fireRow, col-fireCol
		if ar < 0 || ar >= len(artRunes) {
			return false
		}
		line := artRunes[ar]
		return ac >= 0 && ac < len(line) && line[ac] != ' '
	}
	artChar := func(row, col int) rune {
		return artRunes[row-fireRow][col-fireCol]
	}

	tag := fmt.Sprintf("fire:%d:%d:%d", cols, rows, ctx.seed)
	st := bannerSimAt(ctx, tag, frame,
		func() fireState { return initFireState(cols, rows) },
		func(s fireState, f int) fireState {
			for i := 0; i < bannerFireStepsPerFrame; i++ {
				s = fireStep(ctx, s, isArtCell, cols, rows, f*bannerFireStepsPerFrame+i)
			}
			return s
		},
	)

	heatLevels := ctx.st.BannerHeat
	nLevels := len(heatLevels)
	out := make([]string, rows)
	for row := 0; row < rows; row++ {
		cells := make([]rune, cols)
		styles := make([]*lipgloss.Style, cols)
		for col := 0; col < cols; col++ {
			if isArtCell(row, col) {
				cells[col] = artChar(row, col)
				styles[col] = &ctx.st.BannerLock
				continue
			}
			h := st.heat[row*cols+col]
			switch {
			case h >= 30 && nLevels > 5:
				cells[col] = '#'
				styles[col] = &heatLevels[5]
			case h >= 22 && nLevels > 4:
				cells[col] = '@'
				styles[col] = &heatLevels[4]
			case h >= 14 && nLevels > 3:
				cells[col] = '*'
				styles[col] = &heatLevels[3]
			case h >= 8 && nLevels > 2:
				cells[col] = '+'
				styles[col] = &heatLevels[2]
			case h >= 3 && nLevels > 1:
				cells[col] = ':'
				styles[col] = &heatLevels[1]
			case h >= 1 && nLevels > 0:
				cells[col] = '.'
				styles[col] = &heatLevels[0]
			default:
				cells[col] = ' '
			}
		}
		out[row] = renderRuns(cells, func(col int) *lipgloss.Style { return styles[col] })
	}
	return out
}

// ---------------------------------------------------------------------------
// life: Conway's Game of Life seeded with the name's bitmap: holds the
// name, runs life for a while, then reassembles back into the name.
// Mirrors life.ts.
// ---------------------------------------------------------------------------

const (
	bannerLifeHoldFrames       = 30 // ~2.5s
	bannerLifeStepEveryFrames  = 2  // one generation every 2 TUI frames (~166ms)
	bannerLifeGenerations      = 36
	bannerLifeReassembleFrames = 14 // ~1.2s
)

// lifePhase enumerates the hold/life/reassemble cycle.
type lifePhase int

const (
	lifePhaseHold lifePhase = iota
	lifePhaseRun
	lifePhaseReassemble
)

type lifeState struct {
	grid       [][]bool // pixel rows x cols, matches ctx.bitmap shape
	phase      lifePhase
	phaseFrame int
}

func cloneBoolGrid(g [][]bool) [][]bool {
	out := make([][]bool, len(g))
	for r, row := range g {
		out[r] = append([]bool(nil), row...)
	}
	return out
}

// lifeNextGen computes one Game of Life generation on a wrapping grid.
func lifeNextGen(grid [][]bool) [][]bool {
	rows := len(grid)
	cols := 0
	if rows > 0 {
		cols = len(grid[0])
	}
	next := make([][]bool, rows)
	for r := range next {
		next[r] = make([]bool, cols)
	}
	for y := 0; y < rows; y++ {
		for x := 0; x < cols; x++ {
			n := 0
			for dy := -1; dy <= 1; dy++ {
				for dx := -1; dx <= 1; dx++ {
					if dx == 0 && dy == 0 {
						continue
					}
					ny := (y + dy + rows) % rows
					nx := (x + dx + cols) % cols
					if grid[ny][nx] {
						n++
					}
				}
			}
			if grid[y][x] {
				next[y][x] = n == 2 || n == 3
			} else {
				next[y][x] = n == 3
			}
		}
	}
	return next
}

func renderBannerLife(ctx *bannerCtx, frame int) []string {
	cols, rows := ctx.cols, ctx.rows
	target := ctx.bitmap
	if len(target) == 0 {
		return centerLinesInStage(nil, cols, rows)
	}

	tag := fmt.Sprintf("life:%d:%d:%d", cols, rows, ctx.seed)
	st := bannerSimAt(ctx, tag, frame,
		func() lifeState {
			return lifeState{grid: cloneBoolGrid(target), phase: lifePhaseHold, phaseFrame: 0}
		},
		func(s lifeState, f int) lifeState {
			s.phaseFrame++
			switch s.phase {
			case lifePhaseHold:
				if s.phaseFrame >= bannerLifeHoldFrames {
					s.phase, s.phaseFrame = lifePhaseRun, 0
					s.grid = cloneBoolGrid(target)
				}
			case lifePhaseRun:
				if s.phaseFrame%bannerLifeStepEveryFrames == 0 {
					s.grid = lifeNextGen(s.grid)
				}
				if s.phaseFrame >= bannerLifeGenerations*bannerLifeStepEveryFrames {
					s.phase, s.phaseFrame = lifePhaseReassemble, 0
				}
			case lifePhaseReassemble:
				pixelRows := len(target)
				pixelCols := 0
				if pixelRows > 0 {
					pixelCols = len(target[0])
				}
				next := make([][]bool, pixelRows)
				for r := range next {
					next[r] = make([]bool, pixelCols)
					for c := 0; c < pixelCols; c++ {
						isTarget := target[r][c]
						wasAlive := r < len(s.grid) && c < len(s.grid[r]) && s.grid[r][c]
						if isTarget {
							onAt := int(bannerHashFloat(ctx.seed, r*pixelCols+c, 101, 0) * float64(bannerLifeReassembleFrames))
							next[r][c] = wasAlive || s.phaseFrame >= onAt
						} else {
							offAt := int(bannerHashFloat(ctx.seed, r*pixelCols+c, 103, 0) * float64(bannerLifeReassembleFrames))
							next[r][c] = wasAlive && s.phaseFrame < offAt
						}
					}
				}
				s.grid = next
				if s.phaseFrame >= bannerLifeReassembleFrames {
					s.phase, s.phaseFrame = lifePhaseHold, 0
					s.grid = cloneBoolGrid(target)
				}
			}
			return s
		},
	)

	lines := padLines(halfBlock(st.grid))
	stage := centerLinesInStage(lines, cols, rows)
	out := make([]string, rows)
	for row := 0; row < rows; row++ {
		line := []rune(stage[row])
		out[row] = renderRuns(line, func(col int) *lipgloss.Style {
			if col < len(line) && line[col] != ' ' {
				return &ctx.st.BannerLock
			}
			return nil
		})
	}
	return out
}
