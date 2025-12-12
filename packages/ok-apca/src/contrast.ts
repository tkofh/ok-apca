/**
 * Contrast color computation using APCA (Accessible Perceptual Contrast Algorithm).
 *
 * This module computes contrast colors that achieve target APCA Lc values,
 * using simplified math that matches the generated CSS output.
 */

import { solveTargetY } from './apca.ts'
import { type Color, ColorImpl, gamutMap } from './color.ts'

/**
 * Compute a contrast color that achieves the target APCA contrast value.
 *
 * This function uses the same simplified Y = L³ approximation as the CSS generator
 * to accurately predict CSS behavior.
 *
 * @param color - The requested color (may be out of gamut)
 * @param signedContrast - Target APCA Lc value (-108 to 108)
 *   - Positive: Normal polarity (darker text)
 *   - Negative: Reverse polarity (lighter text)
 * @param allowPolarityInversion - Allow fallback to opposite polarity if out of gamut
 * @returns The contrast color, gamut-mapped to the Display P3 boundary
 */
export function applyContrast(
	color: Color,
	signedContrast: number,
	allowPolarityInversion: boolean,
) {
	const { hue, chroma: requestedChroma } = color

	// Clamp contrast to valid APCA range
	const clampedContrast = Math.max(-108, Math.min(108, signedContrast))

	// Gamut-map the input to get the base color for APCA calculations
	const baseColor = gamutMap(color)
	const L = baseColor.lightness
	const C = baseColor.chroma

	// Simplified Y approximation to match CSS generator (Y = L³)
	const Y = L ** 3

	// APCA threshold for Bézier smoothing
	const apcaT = 0.022

	// Solve for target Y
	const targetY = solveTargetY(Y, clampedContrast, apcaT, allowPolarityInversion)

	// Recover L from target Y using cube root (inverse of Y = L³)
	const contrastL = Math.max(0, Math.min(1, targetY ** (1 / 3)))

	// Compute contrast chroma: average of gamut-mapped and requested
	const contrastC = (C + requestedChroma) / 2

	// Gamut-map the result at the new lightness
	return gamutMap(new ColorImpl(hue, contrastC, contrastL))
}
