/**
 * Contrast color computation using APCA.
 * Uses simplified Y = L³ approximation to match CSS generator behavior.
 */

import { solveTargetY } from './apca.ts'
import { type Color, createColor, findGamutSlice, gamutMap } from './color.ts'
import type { GamutSlice } from './types.ts'
import { clamp } from './util.ts'

function computeMaxChroma(L: number, slice: GamutSlice): number {
	const { apex, curvature } = slice

	if (L <= 0 || L >= 1) {
		return 0
	}
	if (apex.lightness <= 0 || apex.lightness >= 1) {
		return 0
	}

	if (L <= apex.lightness) {
		// Left half: linear from origin to apex
		return (apex.chroma * L) / apex.lightness
	}

	// Right half: linear with quadratic curvature correction
	const linearChroma = (apex.chroma * (1 - L)) / (1 - apex.lightness)
	const t = (L - apex.lightness) / (1 - apex.lightness)
	const correction = curvature * t * (1 - t) * apex.chroma

	return linearChroma + correction
}

/**
 * Compute contrast color achieving target APCA Lc value.
 * Positive contrast = lighter text, negative = darker text.
 */
export function applyContrast(
	color: Color,
	signedContrast: number,
	allowPolarityInversion: boolean,
) {
	const { hue } = color

	const clampedContrast = -1 * clamp(-108, signedContrast, 108)

	const baseColor = gamutMap(color)
	const L = baseColor.lightness

	const Y = L ** 3

	const targetY = solveTargetY(Y, clampedContrast, allowPolarityInversion)
	const contrastL = clamp(0, targetY ** (1 / 3), 1)

	// Preserve chroma percentage from base lightness to contrast lightness
	// Use gamut-mapped chroma to compute percentage (matching CSS behavior)
	const slice = findGamutSlice(hue)
	const maxChromaAtBase = computeMaxChroma(L, slice)
	const chromaPct = maxChromaAtBase > 0 ? clamp(0, baseColor.chroma / maxChromaAtBase, 1) : 0
	const maxChromaAtContrast = computeMaxChroma(contrastL, slice)
	const contrastC = maxChromaAtContrast * chromaPct

	return createColor(hue, contrastC, contrastL)
}
