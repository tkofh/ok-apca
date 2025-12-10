/**
 * OKLCH color representation and sRGB gamut mapping.
 *
 * This module provides:
 * - The Color interface for OKLCH colors
 * - Gamut boundary computation for sRGB
 * - Gamut mapping using a tent function approximation
 * - Y-conversion coefficient computation for CSS generation
 */

import _Color from 'colorjs.io'
import type { GamutBoundary } from './types.ts'

// ============================================================================
// Color Types
// ============================================================================

/**
 * Represents an OKLCH color with hue, chroma, and lightness components.
 */
export interface Color {
	/** Hue angle in degrees (0-360) */
	readonly hue: number
	/** Chroma (saturation), typically 0-0.4 for sRGB */
	readonly chroma: number
	/** Perceptual lightness (0-1) */
	readonly lightness: number
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

// ============================================================================
// Gamut Boundary Computation
// ============================================================================

/**
 * Cache of gamut boundaries by hue.
 */
const gamutBoundaryCache = new Map<number, GamutBoundary>()

/**
 * Binary search to find the maximum chroma that stays within sRGB gamut
 * for a given lightness and hue.
 */
function findMaxChromaAtLightness(hue: number, lightness: number): number {
	let low = 0
	let high = 0.4
	const tolerance = 0.0001

	while (high - low > tolerance) {
		const mid = (low + high) / 2
		const color = new _Color('oklch', [lightness, mid, hue])

		if (color.inGamut('srgb')) {
			low = mid
		} else {
			high = mid
		}
	}

	return low
}

/**
 * Find the sRGB gamut boundary for a given hue.
 *
 * Samples lightness values to find:
 * - lMax: the lightness where maximum chroma occurs
 * - cPeak: the maximum chroma value at lMax
 *
 * Results are cached to avoid redundant computation.
 *
 * @param hue - Hue angle in degrees (0-360)
 * @returns The gamut boundary parameters for this hue
 */
export function findGamutBoundary(hue: number): GamutBoundary {
	const cached = gamutBoundaryCache.get(hue)
	if (cached !== undefined) {
		return cached
	}

	const samples = 1000
	let maxChroma = 0
	let lightnessAtMaxChroma = 0

	for (let i = 0; i <= samples; i++) {
		const l = i / samples
		const c = findMaxChromaAtLightness(hue, l)

		if (c > maxChroma) {
			maxChroma = c
			lightnessAtMaxChroma = l
		}
	}

	const boundary: GamutBoundary = {
		lMax: lightnessAtMaxChroma,
		cPeak: maxChroma,
	}

	gamutBoundaryCache.set(hue, boundary)
	return boundary
}

// ============================================================================
// Gamut Mapping
// ============================================================================

/**
 * Compute the tent function value for gamut mapping.
 *
 * The tent function scales from 0 at L=0, peaks at L=lMax, back to 0 at L=1.
 * Formula: min(L/lMax, (1-L)/(1-lMax))
 */
function computeTent(L: number, lMax: number): number {
	if (L <= 0 || L >= 1) {
		return 0
	}
	if (lMax <= 0 || lMax >= 1) {
		return 0
	}
	return Math.min(L / lMax, (1 - L) / (1 - lMax))
}

/**
 * Clamp a color's chroma to fit within the sRGB gamut boundary.
 *
 * Uses a "tent function" approximation: maximum chroma occurs at lMax
 * (the lightness where peak chroma exists for this hue), and decreases
 * linearly to 0 at both L=0 and L=1.
 *
 * This function matches the CSS implementation exactly.
 *
 * @param color - The OKLCH color to gamut-map
 * @returns A new color with chroma clamped to the sRGB boundary
 */
export function gamutMap(color: Color): Color {
	const { hue, chroma, lightness } = color
	const { lMax, cPeak } = findGamutBoundary(hue)

	// Clamp lightness to valid range
	const L = Math.max(0, Math.min(1, lightness))

	// Tent function determines max chroma at this lightness
	const tent = computeTent(L, lMax)
	const maxChroma = cPeak * tent

	// Clamp chroma to gamut boundary
	const clampedChroma = Math.min(Math.max(0, chroma), maxChroma)

	return new ColorImpl(hue, clampedChroma, L)
}

// ============================================================================
// Y-Conversion Coefficients (for CSS generation)
// ============================================================================

/**
 * Compute the Y-conversion coefficient formulas for a given hue.
 *
 * These coefficients express how chroma affects the OKLCH L → CIE Y
 * (luminance) conversion. For a fixed hue, the relationship is:
 *
 *   Y = yc0Coef·C³ + yc1Coef·C²·L + yc2Coef·C·L² + L³
 *
 * The CSS generator uses these to embed the conversion in static CSS,
 * where chroma (C) is a runtime variable.
 *
 * Note: This returns coefficient *formulas* (functions of C), not values.
 * For actual Y values at a specific chroma, multiply by the appropriate
 * power of chroma.
 *
 * @param hue - Hue angle in degrees (0-360)
 * @returns Coefficients for the Y-conversion polynomial
 */
export function computeYConversionCoefficients(hue: number) {
	const hRad = (hue * Math.PI) / 180
	const cosH = Math.cos(hRad)
	const sinH = Math.sin(hRad)

	// OKLab to LMS matrix coefficients for the L component contribution from a,b
	// These come from the oklab→lms matrix inverse
	const aCoef = 0.3963377773761749 * cosH + 0.2158037573099136 * sinH
	const bCoef = -0.1055613458156586 * cosH + -0.0638541728258133 * sinH
	const cCoef = -0.0894841775298119 * cosH + -1.2914855480194092 * sinH

	// LMS to XYZ Y-row coefficients (for computing luminance)
	const yFromL = -0.04077452336091804
	const yFromM = 1.1124921587493157
	const yFromS = -0.07171763538839791

	// Coefficients for how chroma affects Y at each power
	const yc0Coef = yFromL * aCoef ** 3 + yFromM * bCoef ** 3 + yFromS * cCoef ** 3
	const yc1Coef = yFromL * aCoef ** 2 + yFromM * bCoef ** 2 + yFromS * cCoef ** 2
	const yc2Coef = yFromL * aCoef + yFromM * bCoef + yFromS * cCoef

	return { yc0Coef, yc1Coef, yc2Coef }
}
