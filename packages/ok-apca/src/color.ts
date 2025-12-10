/**
 * Core color types and gamut mapping functions.
 */

import { findGamutBoundary } from './gamut.ts'

/**
 * Represents an OKLCH color with hue, chroma, and lightness components.
 */
export interface Color {
	readonly hue: number // 0-360 degrees
	readonly chroma: number // 0-0.4 (OKLCH scale)
	readonly lightness: number // 0-1
}

/**
 * Internal class implementation of Color.
 */
export class ColorImpl implements Color {
	readonly hue: number
	readonly chroma: number
	readonly lightness: number

	constructor(hue: number, chroma: number, lightness: number) {
		this.hue = hue
		this.chroma = chroma
		this.lightness = lightness
	}
}

/**
 * Compute the tent function value for gamut mapping.
 *
 * The tent function scales from 0 at L=0, peaks at L=lMax, back to 0 at L=1.
 * Using min() instead of branching: min(L/lMax, (1-L)/(1-lMax))
 */
function computeTent(L: number, lMax: number) {
	// Handle edge cases
	if (L <= 0 || L >= 1) {
		return 0
	}
	if (lMax <= 0 || lMax >= 1) {
		return 0
	}

	// Simplified tent: min of both slopes
	return Math.min(L / lMax, (1 - L) / (1 - lMax))
}

/**
 * Clamp chroma to fit within the sRGB gamut boundary for the given hue and lightness.
 *
 * Uses the "tent function" approach: maximum chroma occurs at lMax (the lightness
 * where peak chroma exists for this hue), and decreases linearly to 0 at both
 * L=0 and L=1.
 *
 * This function matches the CSS implementation exactly.
 */
export function gamutMap(color: Color) {
	const { hue, chroma, lightness } = color
	const { lMax, cPeak } = findGamutBoundary(hue)

	// Clamp lightness to valid range
	const L = Math.max(0, Math.min(1, lightness))

	// Tent function: min(L/lMax, (1-L)/(1-lMax))
	const tent = computeTent(L, lMax)

	// Maximum chroma at this lightness
	const maxChroma = cPeak * tent

	// Clamp chroma to gamut boundary
	const clampedChroma = Math.min(Math.max(0, chroma), maxChroma)

	return new ColorImpl(hue, clampedChroma, L)
}
