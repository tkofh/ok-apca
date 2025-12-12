/**
 * Contrast color computation using APCA (Accessible Perceptual Contrast Algorithm).
 *
 * This module computes contrast colors that achieve target APCA Lc values,
 * using simplified math that matches the generated CSS output.
 */

import { solveTargetY } from './apca.ts'
import { type Color, ColorImpl, findGamutBoundary, gamutMap } from './color.ts'

/**
 * Compute a contrast color that achieves the target APCA contrast value.
 *
 * This function uses the same simplified Y = L³ approximation as the CSS generator
 * to accurately predict CSS behavior.
 *
 * @param color - The requested color (may be out of gamut)
 * @param signedContrast - Target APCA Lc value (-108 to 108)
 *   - Positive: Reverse polarity (lighter text)
 *   - Negative: Normal polarity (darker text)
 * @param allowPolarityInversion - Allow fallback to opposite polarity if out of gamut
 * @returns The contrast color, gamut-mapped to the Display P3 boundary
 */
export function applyContrast(
	color: Color,
	signedContrast: number,
	allowPolarityInversion: boolean,
) {
	const { hue, chroma: requestedChroma } = color

	// Clamp contrast to valid APCA range and invert to match CSS convention
	const clampedContrast = -1 * Math.max(-108, Math.min(108, signedContrast))

	// Gamut-map the input to get the base color for APCA calculations
	const baseColor = gamutMap(color)
	const L = baseColor.lightness

	// Simplified Y approximation to match CSS generator (Y = L³)
	const Y = L ** 3

	// APCA threshold for Bézier smoothing
	const apcaT = 0.022

	// Solve for target Y
	const targetY = solveTargetY(Y, clampedContrast, apcaT, allowPolarityInversion)

	// Recover L from target Y using cube root (inverse of Y = L³)
	const contrastL = Math.max(0, Math.min(1, targetY ** (1 / 3)))

	// Compute chroma percentage from requested chroma, apply at new lightness
	// This matches CSS behavior where --chroma is a % of max at current lightness
	const boundary = findGamutBoundary(hue)
	const tent = (l: number) => {
		if (l <= 0 || l >= 1 || boundary.lMax <= 0 || boundary.lMax >= 1) {
			return 0
		}
		return Math.min(l / boundary.lMax, (1 - l) / (1 - boundary.lMax))
	}
	const maxChromaAtBase = boundary.cPeak * tent(L)
	const chromaPct = maxChromaAtBase > 0 ? requestedChroma / maxChromaAtBase : 0
	const maxChromaAtContrast = boundary.cPeak * tent(contrastL)
	const contrastC = maxChromaAtContrast * chromaPct

	// Return color with computed chroma (already respects gamut boundary)
	return new ColorImpl(hue, contrastC, contrastL)
}
