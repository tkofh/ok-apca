import { findGamutBoundary } from './gamut.ts'
import type { ContrastMode, GamutBoundary } from './types.ts'

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
class ColorImpl implements Color {
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
function computeTent(L: number, lMax: number): number {
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
export function gamutMap(color: Color, boundary?: GamutBoundary): Color {
	const { hue, chroma, lightness } = color
	const { lMax, cPeak } = boundary ?? findGamutBoundary(hue)

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

// -----------------------------------------------------------------------------
// CSS-matching implementations (predict generated CSS behavior)
// -----------------------------------------------------------------------------

/**
 * Solve for target Y based on contrast mode (CSS-matching version).
 * No soft-toe adjustment, uses simplified Y = L³.
 */
function solveTargetY(Y: number, x: number, apcaT: number, mode: ContrastMode): number {
	if (mode === 'force-light') {
		return solveApcaReverse(Y, x, apcaT).targetY
	}
	if (mode === 'force-dark') {
		return solveApcaNormal(Y, x, apcaT).targetY
	}
	if (mode === 'prefer-light') {
		return solvePreferLight(Y, x, apcaT)
	}
	// prefer-dark
	return solvePreferDark(Y, x, apcaT)
}

/**
 * Solve for prefer-light mode: try reverse (lighter) first, fall back to normal.
 */
function solvePreferLight(Y: number, x: number, apcaT: number): number {
	const { targetY: YR, inGamut: xrg } = solveApcaReverse(Y, x, apcaT)
	if (xrg) {
		return YR
	}
	const { targetY: YN, inGamut: xng } = solveApcaNormal(Y, x, apcaT)
	return xng ? YN : YR
}

/**
 * Solve for prefer-dark mode: try normal (darker) first, fall back to reverse.
 */
function solvePreferDark(Y: number, x: number, apcaT: number): number {
	const { targetY: YN, inGamut: xng } = solveApcaNormal(Y, x, apcaT)
	if (xng) {
		return YN
	}
	const { targetY: YR, inGamut: xrg } = solveApcaReverse(Y, x, apcaT)
	return xrg ? YR : YN
}

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
): Color {
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

// -----------------------------------------------------------------------------
// Precise implementations (accurate color math)
// -----------------------------------------------------------------------------

/**
 * Solve for target Y adjusted value based on contrast mode (precise version).
 * Uses soft-toe adjustment for accurate low-luminance handling.
 */
function solveTargetYadjPrecise(
	Yadj: number,
	x: number,
	apcaT: number,
	mode: ContrastMode,
): number {
	if (mode === 'force-light') {
		return solveApcaReverse(Yadj, x, apcaT).targetY
	}
	if (mode === 'force-dark') {
		return solveApcaNormal(Yadj, x, apcaT).targetY
	}
	if (mode === 'prefer-light') {
		return solvePreferLight(Yadj, x, apcaT)
	}
	// prefer-dark
	return solvePreferDark(Yadj, x, apcaT)
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
): Color {
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

// -----------------------------------------------------------------------------
// Error measurement utilities
// -----------------------------------------------------------------------------

/**
 * Result of comparing CSS-matching and precise contrast calculations.
 */
export interface ContrastError {
	/** Lightness from CSS-matching implementation */
	readonly cssLightness: number
	/** Lightness from precise implementation */
	readonly preciseLightness: number
	/** Absolute difference in lightness (0-1 scale) */
	readonly absoluteError: number
	/** Relative error as a fraction of precise lightness */
	readonly relativeError: number
	/** Chroma from CSS-matching implementation */
	readonly cssChroma: number
	/** Chroma from precise implementation */
	readonly preciseChroma: number
}

/**
 * Measure the error between CSS-matching and precise contrast calculations.
 *
 * This is useful for understanding how much the CSS simplifications
 * deviate from accurate color math for specific inputs.
 *
 * @param color - The input color
 * @param contrast - Target APCA Lc value (0-108)
 * @param mode - How to select between lighter/darker contrast colors
 * @param boundary - Optional pre-computed gamut boundary for the hue
 * @returns Error metrics comparing the two implementations
 */
export function measureContrastError(
	color: Color,
	contrast: number,
	mode: ContrastMode,
	boundary?: GamutBoundary,
): ContrastError {
	const gamutBoundary = boundary ?? findGamutBoundary(color.hue)

	const cssResult = applyContrast(color, contrast, mode, gamutBoundary)
	const preciseResult = applyContrastPrecise(color, contrast, mode, gamutBoundary)

	const absoluteError = Math.abs(cssResult.lightness - preciseResult.lightness)
	const relativeError =
		preciseResult.lightness > 0 ? absoluteError / preciseResult.lightness : absoluteError

	return {
		cssLightness: cssResult.lightness,
		preciseLightness: preciseResult.lightness,
		absoluteError,
		relativeError,
		cssChroma: cssResult.chroma,
		preciseChroma: preciseResult.chroma,
	}
}

// -----------------------------------------------------------------------------
// Shared helper functions
// -----------------------------------------------------------------------------

/**
 * Solve APCA equation for normal polarity (darker contrast color).
 * Normal: Lc = 1.14 * (Ybg^0.56 - Yfg^0.57) - 0.027
 */
function solveApcaNormal(
	Y: number,
	x: number,
	apcaT: number,
): { targetY: number; inGamut: boolean } {
	// Solve for target Y at the threshold first (for Bézier smoothing)
	const xnmin = signedPow(Y ** 0.56 - (apcaT + 0.027) / 1.14, 1 / 0.57)
	const xnv = -Math.abs((Math.abs(xnmin) ** 0.43 * apcaT) / 0.6498)

	let targetY: number
	if (x >= apcaT) {
		// Direct APCA inverse
		targetY = signedPow(Y ** 0.56 - (x + 0.027) / 1.14, 1 / 0.57)
	} else {
		// Bézier smoothing for low contrast values
		const t = x / apcaT
		const t2 = t * t
		const t3 = t2 * t
		targetY = Y + (-3 * Y + 3 * xnmin - xnv) * t2 + (2 * Y - 2 * xnmin + xnv) * t3
	}

	// Check if result is in gamut (0 <= Y <= 1)
	const epsilon = 0.0001
	const inGamut = targetY >= -epsilon && targetY <= 1 + epsilon

	return { targetY: Math.max(0, Math.min(1, targetY)), inGamut }
}

/**
 * Solve APCA equation for reverse polarity (lighter contrast color).
 * Reverse: Lc = 1.14 * (Yfg^0.62 - Ybg^0.65) - 0.027
 */
function solveApcaReverse(
	Y: number,
	x: number,
	apcaT: number,
): { targetY: number; inGamut: boolean } {
	// Solve for target Y at the threshold first (for Bézier smoothing)
	const xrmin = signedPow(Y ** 0.65 + (apcaT + 0.027) / 1.14, 1 / 0.62)
	const xrv = -Math.abs((Math.abs(xrmin) ** 0.38 * -apcaT) / 0.7068)

	let targetY: number
	if (x >= apcaT) {
		// Direct APCA inverse
		// Reverse formula: need to solve for Yfg where Lc = 1.14 * (Yfg^0.62 - Ybg^0.65) - 0.027
		// Yfg^0.62 = (Lc + 0.027) / 1.14 + Ybg^0.65
		targetY = (Y ** 0.65 + (x + 0.027) / 1.14) ** (1 / 0.62)
	} else {
		// Bézier smoothing for low contrast values
		const t = x / apcaT
		const t2 = t * t
		const t3 = t2 * t
		targetY = Y + (-3 * Y + 3 * xrmin - xrv) * t2 + (2 * Y - 2 * xrmin + xrv) * t3
	}

	// Check if result is in gamut (0 <= Y <= 1)
	const epsilon = 0.0001
	const inGamut = targetY >= -epsilon && targetY <= 1 + epsilon

	return { targetY: Math.max(0, Math.min(1, targetY)), inGamut }
}

// -----------------------------------------------------------------------------
// Precise-only helper functions
// -----------------------------------------------------------------------------

/**
 * Compute Y-conversion coefficients for a specific hue and chroma.
 *
 * These coefficients allow converting OKLCH lightness to CIE luminance Y
 * via: Y = yc0 + yc1*L + yc2*L² + L³
 */
function computeYCoefficients(
	hue: number,
	chroma: number,
): { yc0: number; yc1: number; yc2: number } {
	const hRad = (hue * Math.PI) / 180
	const cosH = Math.cos(hRad)
	const sinH = Math.sin(hRad)

	// OKLab a,b direction coefficients scaled by chroma
	const ydl = chroma * (0.3963377773761749 * cosH + 0.2158037573099136 * sinH)
	const ydm = chroma * (-0.1055613458156586 * cosH + -0.0638541728258133 * sinH)
	const yds = chroma * (-0.0894841775298119 * cosH + -1.2914855480194092 * sinH)

	// LMS to XYZ Y-row coefficients
	const yFromL = -0.04077452336091804
	const yFromM = 1.1124921587493157
	const yFromS = -0.07171763538839791

	// Y-conversion polynomial coefficients
	const yc0 = yFromL * ydl ** 3 + yFromM * ydm ** 3 + yFromS * yds ** 3
	const yc1 = yFromL * ydl ** 2 + yFromM * ydm ** 2 + yFromS * yds ** 2
	const yc2 = yFromL * ydl + yFromM * ydm + yFromS * yds

	return { yc0, yc1, yc2 }
}

/**
 * Apply APCA soft-toe adjustment for low luminance values.
 * This smooths the perception curve where human vision becomes nonlinear.
 */
function applySoftToe(Y: number): number {
	if (Y < 0.022) {
		const t = Y / 0.022
		return 0.0045272 + 0.0150728 * t + 0.0024 * t * t
	}
	return Y
}

/**
 * Invert the APCA soft-toe adjustment.
 * Given an adjusted Y, recover the original Y.
 */
function invertSoftToe(Yadj: number): number {
	if (Yadj < 0.022) {
		// Solve: Yadj = 0.0045272 + 0.0150728*(Y/0.022) + 0.0024*(Y/0.022)²
		// This is a quadratic in (Y/0.022), solve using quadratic formula
		// 0.0024*t² + 0.0150728*t + (0.0045272 - Yadj) = 0
		const a = 0.0024
		const b = 0.0150728
		const c = 0.0045272 - Yadj
		const discriminant = b * b - 4 * a * c
		if (discriminant < 0) {
			return Yadj // Fallback
		}
		const t = (-b + Math.sqrt(discriminant)) / (2 * a)
		return t * 0.022
	}
	return Yadj
}

/**
 * Solve the cubic equation Y = yc0 + yc1*L + yc2*L² + L³ for L using Cardano's formula.
 */
function solveCubicForL(yc0: number, yc1: number, yc2: number, targetY: number): number {
	// Rearrange to standard form: L³ + yc2*L² + yc1*L + (yc0 - targetY) = 0
	// Use depressed cubic substitution: L = t - yc2/3
	// Gives: t³ + pt + q = 0

	const p = (3 * yc1 - yc2 * yc2) / 3
	const q = (2 * yc2 * yc2 * yc2 - 9 * yc2 * yc1 + 27 * (yc0 - targetY)) / 27

	// Discriminant
	const d = (p / 3) ** 3 + (q / 2) ** 2

	let L: number
	if (d >= 0) {
		// One real root (or three with multiplicity)
		const sqrtD = Math.sqrt(d)
		const u = signedCbrt(-q / 2 + sqrtD)
		const v = signedCbrt(-q / 2 - sqrtD)
		L = u + v - yc2 / 3
	} else {
		// Three distinct real roots - use trigonometric method
		// For this application, we want the root in [0, 1]
		const r = Math.sqrt((-p / 3) ** 3)
		const theta = Math.acos(-q / (2 * r)) / 3
		const m = 2 * Math.cbrt(r)

		// The three roots
		const L1 = m * Math.cos(theta) - yc2 / 3
		const L2 = m * Math.cos(theta + (2 * Math.PI) / 3) - yc2 / 3
		const L3 = m * Math.cos(theta + (4 * Math.PI) / 3) - yc2 / 3

		// Select the root closest to [0, 1] range
		const roots = [L1, L2, L3]
		const validRoots = roots.filter((r) => r >= -0.001 && r <= 1.001)

		if (validRoots.length > 0) {
			// Pick the one closest to the center of the valid range
			L = validRoots.reduce((best, r) => {
				const distBest = Math.min(Math.abs(best), Math.abs(best - 1))
				const distR = Math.min(Math.abs(r), Math.abs(r - 1))
				return distR < distBest ? r : best
			})
		} else {
			// Fallback: pick the one closest to [0, 1]
			L = roots.reduce((best, r) => {
				const clamped = Math.max(0, Math.min(1, r))
				const clampedBest = Math.max(0, Math.min(1, best))
				return Math.abs(r - clamped) < Math.abs(best - clampedBest) ? r : best
			})
		}
	}

	// Clamp to valid range
	return Math.max(0, Math.min(1, L))
}

/**
 * Compute x^(1/n) preserving sign (for odd roots of negative numbers).
 */
function signedPow(x: number, exp: number): number {
	return Math.sign(x) * Math.abs(x) ** exp
}

/**
 * Compute cube root preserving sign.
 */
function signedCbrt(x: number): number {
	return Math.sign(x) * Math.cbrt(Math.abs(x))
}
