/**
 * Contrast color computation using APCA.
 * Uses simplified Y = L³ approximation to match CSS generator behavior.
 */

import { solveTargetY } from './apca.ts'
import { type Color, createColor, findGamutBoundary, gamutMap } from './color.ts'

/**
 * Compute contrast color achieving target APCA Lc value.
 * Positive contrast = lighter text, negative = darker text.
 */
export function applyContrast(
	color: Color,
	signedContrast: number,
	allowPolarityInversion: boolean,
) {
	const { hue, chroma: requestedChroma } = color

	const clampedContrast = -1 * Math.max(-108, Math.min(108, signedContrast))

	const baseColor = gamutMap(color)
	const L = baseColor.lightness

	const Y = L ** 3
	const apcaT = 0.022

	const targetY = solveTargetY(Y, clampedContrast, apcaT, allowPolarityInversion)
	const contrastL = Math.max(0, Math.min(1, targetY ** (1 / 3)))

	// Preserve chroma percentage from base lightness to contrast lightness
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

	return createColor(hue, contrastC, contrastL)
}
