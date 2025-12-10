/**
 * Contrast color computation using APCA (Accessible Perceptual Contrast Algorithm).
 *
 * Provides both CSS-matching and precise implementations for computing
 * contrast colors that achieve target APCA Lc values.
 */

import { solveTargetY } from './apca.ts'
import { type Color, ColorImpl, gamutMap } from './color.ts'
import { findGamutBoundary } from './gamut.ts'
import { applySoftToe, computeYCoefficients, invertSoftToe, solveCubicForL } from './precise.ts'
import type { ContrastMode, GamutBoundary } from './types.ts'

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
 * @param boundary - Optional pre-computed gamut boundary for the hue
 * @returns The contrast color, gamut-mapped to the sRGB boundary
 */
export function applyContrast(
	color: Color,
	contrast: number,
	mode: ContrastMode,
	boundary?: GamutBoundary,
) {
	const { hue, chroma: requestedChroma } = color
	const gamutBoundary = boundary ?? findGamutBoundary(hue)

	// Clamp contrast to valid APCA range
	const x = Math.max(0, Math.min(108, contrast)) / 100 // Normalize to 0-1.08

	// Gamut-map the input to get the base color for APCA calculations
	const baseColor = gamutMap(color, gamutBoundary)
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
	return gamutMap(new ColorImpl(hue, contrastC, contrastL), gamutBoundary)
}

/**
 * Solve for target Y adjusted value based on contrast mode (precise version).
 * Uses soft-toe adjustment for accurate low-luminance handling.
 */
function solveTargetYadjPrecise(Yadj: number, x: number, apcaT: number, mode: ContrastMode) {
	return solveTargetY(Yadj, x, apcaT, mode)
}

/**
 * Compute a contrast color using precise color math.
 *
 * This function uses accurate OKLCH to luminance conversion including:
 * - Full polynomial Y conversion with chroma contribution
 * - APCA soft-toe adjustment for low luminance
 * - Cardano's formula for cubic root solving
 *
 * Use this when you need accurate color calculations rather than
 * predicting CSS output.
 *
 * @param color - The requested color (may be out of gamut)
 * @param contrast - Target APCA Lc value (0-108)
 * @param mode - How to select between lighter/darker contrast colors
 * @param boundary - Optional pre-computed gamut boundary for the hue
 * @returns The contrast color, gamut-mapped to the sRGB boundary
 */
export function applyContrastPrecise(
	color: Color,
	contrast: number,
	mode: ContrastMode,
	boundary?: GamutBoundary,
) {
	const { hue, chroma: requestedChroma } = color
	const gamutBoundary = boundary ?? findGamutBoundary(hue)

	// Clamp contrast to valid APCA range
	const x = Math.max(0, Math.min(108, contrast)) / 100 // Normalize to 0-1.08

	// Gamut-map the input to get the base color for APCA calculations
	const baseColor = gamutMap(color, gamutBoundary)
	const L = baseColor.lightness
	const C = baseColor.chroma

	// Compute Y-conversion coefficients for this hue and chroma
	const { yc0, yc1, yc2 } = computeYCoefficients(hue, C)

	// Convert base L,C to luminance Y using full polynomial
	const Y = yc0 + yc1 * L + yc2 * L * L + L * L * L

	// Apply APCA soft-toe adjustment for low luminance
	const YADJ = applySoftToe(Y)

	// APCA threshold for Bézier smoothing
	const apcaT = 0.022

	// Solve for target Y adjusted value based on contrast mode
	const targetYadj = solveTargetYadjPrecise(YADJ, x, apcaT, mode)

	// Invert soft-toe to get actual Y
	const targetY = invertSoftToe(targetYadj)

	// Solve cubic for L using Cardano's formula
	const contrastL = solveCubicForL(yc0, yc1, yc2, targetY)

	// Compute contrast chroma: average of gamut-mapped and requested
	const contrastC = (C + requestedChroma) / 2

	// Gamut-map the result at the new lightness
	return gamutMap(new ColorImpl(hue, contrastC, contrastL), gamutBoundary)
}
