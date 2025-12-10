/**
 * Contrast color computation using APCA (Accessible Perceptual Contrast Algorithm).
 *
 * This module computes contrast colors that achieve target APCA Lc values,
 * using simplified math that matches the generated CSS output.
 */

import { solveTargetY } from './apca.ts'
import { type Color, ColorImpl, gamutMap } from './color.ts'
import type { ContrastMode } from './types.ts'

/**
 * Compute a contrast color that achieves the target APCA contrast value.
 *
 * This function matches the CSS implementation exactly, using:
 * - Simplified Y = L³ (no chroma contribution)
 * - No soft-toe adjustment
 * - Simple cube root for L recovery
 *
 * @param color - The requested color (may be out of gamut)
 * @param contrast - Target APCA Lc value (0-108)
 * @param mode - How to select between lighter/darker contrast colors
 * @returns The contrast color, gamut-mapped to the sRGB boundary
 */
export function applyContrast(color: Color, contrast: number, mode: ContrastMode) {
	const { hue, chroma: requestedChroma } = color

	// Clamp contrast to valid APCA range
	const x = Math.max(0, Math.min(108, contrast)) / 100 // Normalize to 0-1.08

	// Gamut-map the input to get the base color for APCA calculations
	const baseColor = gamutMap(color)
	const L = baseColor.lightness
	const C = baseColor.chroma

	// Simplified Y = L³ (matches CSS, ignores chroma contribution)
	const Y = L ** 3

	// APCA threshold for Bézier smoothing
	const apcaT = 0.022

	// Solve for target Y based on contrast mode (no soft-toe)
	const targetY = solveTargetY(Y, x, apcaT, mode)

	// Simple cube root for L recovery (matches CSS)
	const contrastL = Math.max(0, Math.min(1, targetY ** (1 / 3)))

	// Compute contrast chroma: average of gamut-mapped and requested
	const contrastC = (C + requestedChroma) / 2

	// Gamut-map the result at the new lightness
	return gamutMap(new ColorImpl(hue, contrastC, contrastL))
}
