package main

import (
	"fmt"
	"math"

	"github.com/charmbracelet/lipgloss"
)

// 3D lit variants of the home banner (spin, donut). Mirrors
// web/src/layouts/banners/spin.ts and donut.ts.

// bannerSpinShades is the luminance ramp used to pick a character for a lit
// voxel face, dimmest first. Mirrors spin.ts's SPIN_SHADES.
const bannerSpinShades = ".,-~:;=!*#$@"

// voxelPoint is one sampled point on a lit voxel face: position plus the
// face's outward normal, both in model space (name centered at origin).
type voxelPoint struct {
	x, y, z, nx, ny, nz float64
}

// buildCharBitmap collapses a pixel-resolution bitmap (rows*2 tall) down to
// char resolution (rows tall), a cell is on if either of its two pixel rows
// is on. Voxel geometry below works at char resolution, matching donut and
// plasma's own coordinate space (ctx.cols x ctx.rows).
func buildCharBitmap(bitmap [][]bool, cols, rows int) [][]bool {
	out := make([][]bool, rows)
	for r := range rows {
		out[r] = make([]bool, cols)
		r0 := r * 2
		for c := range cols {
			on := false
			if r0 < len(bitmap) && c < len(bitmap[r0]) {
				on = bitmap[r0][c]
			}
			if !on && r0+1 < len(bitmap) && c < len(bitmap[r0+1]) {
				on = bitmap[r0+1][c]
			}
			out[r][c] = on
		}
	}
	return out
}

// buildVoxelPoints extrudes an on/off char bitmap into a depth-deep voxel
// block and samples one point per visible face (front/back plus any side
// exposed to empty space), tagged with that face's normal for lighting.
// Mirrors spin.ts's buildVoxelPoints, but one sample per face instead of a
// 3x3 grid: the ASCII stage is far coarser than the web canvas, so the
// extra samples would cost time without changing what renders.
func buildVoxelPoints(bitmap [][]bool) []voxelPoint {
	rows := len(bitmap)
	cols := 0
	if rows > 0 {
		cols = len(bitmap[0])
	}
	const depth = 3
	isOn := func(x, y int) bool {
		return y >= 0 && y < rows && x >= 0 && x < cols && bitmap[y][x]
	}
	var pts []voxelPoint
	for y := range rows {
		for x := range cols {
			if !bitmap[y][x] {
				continue
			}
			for z := range depth {
				var normals [][3]float64
				if z == 0 {
					normals = append(normals, [3]float64{0, 0, -1})
				}
				if z == depth-1 {
					normals = append(normals, [3]float64{0, 0, 1})
				}
				if !isOn(x-1, y) {
					normals = append(normals, [3]float64{-1, 0, 0})
				}
				if !isOn(x+1, y) {
					normals = append(normals, [3]float64{1, 0, 0})
				}
				if !isOn(x, y-1) {
					normals = append(normals, [3]float64{0, -1, 0})
				}
				if !isOn(x, y+1) {
					normals = append(normals, [3]float64{0, 1, 0})
				}
				for _, n := range normals {
					nx, ny, nz := n[0], n[1], n[2]
					px := float64(x) + 0.5 - float64(cols)/2
					py := float64(y) + 0.5 - float64(rows)/2
					pz := float64(z) + 0.5 - float64(depth)/2
					if nx != 0 {
						if nx > 0 {
							px = float64(x) + 1 - float64(cols)/2
						} else {
							px = float64(x) - float64(cols)/2
						}
					}
					if ny != 0 {
						if ny > 0 {
							py = float64(y) + 1 - float64(rows)/2
						} else {
							py = float64(y) - float64(rows)/2
						}
					}
					if nz != 0 {
						if nz > 0 {
							pz = float64(z) + 1 - float64(depth)/2
						} else {
							pz = float64(z) - float64(depth)/2
						}
					}
					pts = append(pts, voxelPoint{px, py, pz, nx, ny, nz})
				}
			}
		}
	}
	return pts
}

// renderBannerSpin renders the extruded, rotating voxel wordmark. Mirrors
// spin.ts: light-shaded ASCII faces swaying around Y with a slight X tilt.
// The voxel point cloud only depends on stage size, so it is built once per
// size via the sim-state cache (ctx.sim survives across frames) instead of
// every frame.
func renderBannerSpin(ctx *bannerCtx, frame int) []string {
	cols, rows := ctx.cols, ctx.rows
	if cols <= 0 || rows <= 0 {
		return centerLinesInStage(ctx.art, cols, rows)
	}
	tag := fmt.Sprintf("spinpts:%d:%d:%d", cols, rows, ctx.seed)
	pts := bannerSimAt(ctx, tag, 0,
		func() []voxelPoint {
			return buildVoxelPoints(buildCharBitmap(ctx.bitmap, cols, rows))
		},
		func(p []voxelPoint, f int) []voxelPoint { return p },
	)
	if len(pts) == 0 {
		return centerLinesInStage(ctx.art, cols, rows)
	}

	t := float64(frame)
	ay := 0.4 * math.Sin(t*0.0916)
	ax := 0.12 + 0.08*math.Sin(t*0.0583)
	cosY, sinY := math.Cos(ay), math.Sin(ay)
	cosX, sinX := math.Cos(ax), math.Sin(ax)

	const lx, ly, lz = -0.3, -0.35, -0.89
	llen := math.Hypot(math.Hypot(lx, ly), lz)
	nlx, nly, nlz := lx/llen, ly/llen, lz/llen

	n := cols * rows
	zbuf := make([]float64, n)
	for i := range zbuf {
		zbuf[i] = math.Inf(1)
	}
	chars := make([]rune, n)
	for i := range chars {
		chars[i] = ' '
	}
	shadeIdx := make([]int, n)
	for i := range shadeIdx {
		shadeIdx[i] = -1
	}
	shades := []rune(bannerSpinShades)
	nShadeChars := len(shades)
	shadeLevels := len(ctx.st.BannerShade)

	for _, p := range pts {
		x1 := p.x*cosY + p.z*sinY
		z1 := -p.x*sinY + p.z*cosY
		y2 := p.y*cosX - z1*sinX
		z2 := p.y*sinX + z1*cosX

		nx1 := p.nx*cosY + p.nz*sinY
		nz1 := -p.nx*sinY + p.nz*cosY
		ny2 := p.ny*cosX - nz1*sinX
		nz2 := p.ny*sinX + nz1*cosX

		if nz2 > 0.05 {
			continue
		}

		f := 70 / (70 + z2)
		u := int(math.Floor(float64(cols)/2 + x1*1.6*f))
		v := int(math.Floor(float64(rows)/2 + y2*1.0*f))
		if u < 0 || u >= cols || v < 0 || v >= rows {
			continue
		}
		idx := v*cols + u
		if z2 >= zbuf[idx] {
			continue
		}
		zbuf[idx] = z2

		lum := nx1*nlx + ny2*nly + nz2*nlz
		if lum < 0 {
			lum = 0
		}
		if nShadeChars > 0 {
			ci := min(int(math.Round(lum*float64(nShadeChars-1))), nShadeChars-1)
			chars[idx] = shades[ci]
		}
		if shadeLevels > 0 {
			si := min(int(math.Round(lum*float64(shadeLevels-1))), shadeLevels-1)
			shadeIdx[idx] = si
		}
	}

	out := make([]string, rows)
	for row := range rows {
		rowChars := chars[row*cols : (row+1)*cols]
		rowShade := shadeIdx[row*cols : (row+1)*cols]
		out[row] = renderRuns(rowChars, func(col int) *lipgloss.Style {
			si := rowShade[col]
			if si < 0 {
				return nil
			}
			return &ctx.st.BannerShade[si]
		})
	}
	return out
}

// bannerDonutLum is the luminance ramp for the torus surface, dimmest
// first. Mirrors donut.ts's DONUT_LUM.
const bannerDonutLum = ".,-~:;=!*#$@"

// renderBannerDonut renders the classic spinning donut.c ASCII torus, no
// text (matches donut.ts: "classic donut.c spinning ASCII torus, no text").
// k1 is derived from stage height so the torus always fits vertically.
func renderBannerDonut(ctx *bannerCtx, frame int) []string {
	cols, rows := ctx.cols, ctx.rows
	if cols <= 0 || rows <= 0 {
		return centerLinesInStage(nil, cols, rows)
	}
	const r1, r2, k2 = 1.0, 2.0, 5.0
	k1 := (float64(rows) * k2 * 3) / (8 * (r1 + r2))

	t := float64(frame)
	A := t * 0.0833
	B := t * 0.04165
	cosA, sinA := math.Cos(A), math.Sin(A)
	cosB, sinB := math.Cos(B), math.Sin(B)

	n := cols * rows
	chars := make([]rune, n)
	for i := range chars {
		chars[i] = ' '
	}
	shadeIdx := make([]int, n)
	for i := range shadeIdx {
		shadeIdx[i] = -1
	}
	zbuf := make([]float64, n)
	lumRunes := []rune(bannerDonutLum)
	shadeLevels := len(ctx.st.BannerShade)

	for theta := 0.0; theta < 6.28; theta += 0.07 {
		cosT, sinT := math.Cos(theta), math.Sin(theta)
		for phi := 0.0; phi < 6.28; phi += 0.02 {
			cosP, sinP := math.Cos(phi), math.Sin(phi)
			circleX := r2 + r1*cosT
			circleY := r1 * sinT

			x := circleX*(cosB*cosP+sinA*sinB*sinP) - circleY*cosA*sinB
			y := circleX*(sinB*cosP-sinA*cosB*sinP) + circleY*cosA*cosB
			z := k2 + cosA*circleX*sinP + circleY*sinA
			ooz := 1 / z

			xp := int(math.Floor(float64(cols)/2 + k1*ooz*x*2))
			yp := int(math.Floor(float64(rows)/2 - k1*ooz*y))
			if xp < 0 || xp >= cols || yp < 0 || yp >= rows {
				continue
			}

			l := cosP*cosT*sinB - cosA*cosT*sinP - sinA*sinT + cosB*(cosA*sinT-cosT*sinA*sinP)
			idx := yp*cols + xp
			if ooz > zbuf[idx] {
				zbuf[idx] = ooz
				lumIdx := max(0, min(int(l*8), len(lumRunes)-1))
				chars[idx] = lumRunes[lumIdx]
				if shadeLevels > 0 {
					si := min(lumIdx*(shadeLevels-1)/8, shadeLevels-1)
					shadeIdx[idx] = si
				}
			}
		}
	}

	out := make([]string, rows)
	for row := range rows {
		rowChars := chars[row*cols : (row+1)*cols]
		rowShade := shadeIdx[row*cols : (row+1)*cols]
		out[row] = renderRuns(rowChars, func(col int) *lipgloss.Style {
			si := rowShade[col]
			if si < 0 {
				return nil
			}
			return &ctx.st.BannerShade[si]
		})
	}
	return out
}
