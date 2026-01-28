/**
 * Contrast color computation using APCA.
 * Uses simplified Y = L³ approximation to match CSS generator behavior.
 */

import { solveTargetY } from './apca.ts'
import { createColor, findGamutSlice, gamutMap } from './color.ts'
import { clamp, createMaxChromaExpr } from './expressions.ts'
import type { Color, GamutSlice } from './types.ts'

/**
 * Compute the maximum chroma at a given lightness.
 * Uses the shared expression tree from expressions.ts to ensure parity
 * with CSS generation.
 */
function computeMaxChroma(L: number, slice: GamutSlice): number {
	const { apex } = slice

	// Edge cases not handled by the expression (division by zero)
	if (L <= 0 || L >= 1) {
		return 0
	}
	if (apex.lightness <= 0 || apex.lightness >= 1) {
		return 0
	}

	return createMaxChromaExpr(slice).toNumber({ lightness: L })
}

/**
 * Compute contrast color achieving target APCA Lc value.
 * Positive contrast = lighter text, negative = darker text.
 *
 * @param color - The base color to compute contrast from
 * @param signedContrast - Signed contrast value (-108 to 108)
 * @param invert - Whether to enable automatic polarity inversion (default: true)
 *
 * When inversion is enabled (default), the solver computes both polarity solutions
 * and selects the one that achieves higher absolute contrast. The signed contrast
 * value acts as a preference that breaks ties when both directions achieve equal contrast.
 */
export function applyContrast(color: Color, signedContrast: number, invert = true) {
	const { hue } = color

	const clampedContrast = clamp(-108, signedContrast, 108)

	const baseColor = gamutMap(color)
	const L = baseColor.lightness

	// Simplified Y = L³ (matches CSS generator behavior)
	const Y = L ** 3

	const targetY = solveTargetY(Y, clampedContrast, invert)
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
