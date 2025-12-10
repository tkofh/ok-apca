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
 * Clamp chroma to fit within the sRGB gamut boundary for the given hue and lightness.
 *
 * Uses the "tent function" approach: maximum chroma occurs at lMax (the lightness
 * where peak chroma exists for this hue), and decreases linearly to 0 at both
 * L=0 and L=1.
 */
export function gamutMap(color: Color, boundary?: GamutBoundary): Color {
	const { hue, chroma, lightness } = color
	const { lMax, cPeak } = boundary ?? findGamutBoundary(hue)

	// Clamp lightness to valid range
	const L = Math.max(0, Math.min(1, lightness))

	// Handle edge cases where tent function would divide by zero
	if (L <= 0 || L >= 1) {
		return new ColorImpl(hue, 0, L)
	}

	if (lMax <= 0 || lMax >= 1) {
		// Degenerate boundary - shouldn't happen for valid hues, but handle gracefully
		return new ColorImpl(hue, 0, L)
	}

	// Tent function: scales from 0 at L=0, peaks at L=lMax, back to 0 at L=1
	const tent = L <= lMax ? L / lMax : (1 - L) / (1 - lMax)

	// Maximum chroma at this lightness
	const maxChroma = cPeak * tent

	// Clamp chroma to gamut boundary
	const clampedChroma = Math.min(Math.max(0, chroma), maxChroma)

	return new ColorImpl(hue, clampedChroma, L)
}

/**
 * Compute a contrast color that achieves the target APCA contrast value.
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

	// Compute Y-conversion coefficients for this hue and chroma
	const { yc0, yc1, yc2 } = computeYCoefficients(hue, C)

	// Convert base L,C to luminance Y
	const Y = yc0 + yc1 * L + yc2 * L * L + L * L * L

	// Apply APCA soft-toe adjustment for low luminance
	const YADJ = applySoftToe(Y)

	// APCA threshold for Bézier smoothing
	const apcaT = 0.022

	// Solve APCA for target Y in both polarities
	const { targetY: YN, inGamut: xng } = solveApcaNormal(YADJ, x, apcaT)
	const { targetY: YR, inGamut: xrg } = solveApcaReverse(YADJ, x, apcaT)

	// Select which solution to use based on mode and gamut validity
	const targetYadj = selectContrastY(mode, YN, YR, xng, xrg)

	// Invert soft-toe to get actual Y
	const targetY = invertSoftToe(targetYadj)

	// Solve cubic for L using Cardano's formula
	const contrastL = solveCubicForL(yc0, yc1, yc2, targetY)

	// Compute contrast chroma: average of gamut-mapped and requested
	const contrastC = (C + requestedChroma) / 2

	// Gamut-map the result at the new lightness
	return gamutMap(new ColorImpl(hue, contrastC, contrastL), gamutBoundary)
}

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
 * Solve APCA equation for normal polarity (darker contrast color).
 * Normal: Lc = 1.14 * (Ybg^0.56 - Yfg^0.57) - 0.027
 */
function solveApcaNormal(
	Yadj: number,
	x: number,
	apcaT: number,
): { targetY: number; inGamut: boolean } {
	// Solve for target Y at the threshold first (for Bézier smoothing)
	const xnmin = signedPow(Yadj ** 0.56 - (apcaT + 0.027) / 1.14, 1 / 0.57)
	const xnv = -Math.abs((Math.abs(xnmin) ** 0.43 * apcaT) / 0.6498)

	let targetY: number
	if (x >= apcaT) {
		// Direct APCA inverse
		targetY = signedPow(Yadj ** 0.56 - (x + 0.027) / 1.14, 1 / 0.57)
	} else {
		// Bézier smoothing for low contrast values
		const t = x / apcaT
		const t2 = t * t
		const t3 = t2 * t
		targetY = Yadj + (-3 * Yadj + 3 * xnmin - xnv) * t2 + (2 * Yadj - 2 * xnmin + xnv) * t3
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
	Yadj: number,
	x: number,
	apcaT: number,
): { targetY: number; inGamut: boolean } {
	// Solve for target Y at the threshold first (for Bézier smoothing)
	const xrmin = signedPow(Yadj ** 0.65 + (apcaT + 0.027) / 1.14, 1 / 0.62)
	const xrv = -Math.abs((Math.abs(xrmin) ** 0.38 * -apcaT) / 0.7068)

	let targetY: number
	if (x >= apcaT) {
		// Direct APCA inverse
		// Reverse formula: need to solve for Yfg where Lc = 1.14 * (Yfg^0.62 - Ybg^0.65) - 0.027
		// Yfg^0.62 = (Lc + 0.027) / 1.14 + Ybg^0.65
		targetY = (Yadj ** 0.65 + (x + 0.027) / 1.14) ** (1 / 0.62)
	} else {
		// Bézier smoothing for low contrast values
		const t = x / apcaT
		const t2 = t * t
		const t3 = t2 * t
		targetY = Yadj + (-3 * Yadj + 3 * xrmin - xrv) * t2 + (2 * Yadj - 2 * xrmin + xrv) * t3
	}

	// Check if result is in gamut (0 <= Y <= 1)
	const epsilon = 0.0001
	const inGamut = targetY >= -epsilon && targetY <= 1 + epsilon

	return { targetY: Math.max(0, Math.min(1, targetY)), inGamut }
}

/**
 * Select which contrast Y to use based on mode and gamut validity.
 */
function selectContrastY(
	mode: ContrastMode,
	Yn: number,
	Yr: number,
	xng: boolean,
	xrg: boolean,
): number {
	switch (mode) {
		case 'force-light':
			// Always use normal polarity (darker contrast = lighter background perception)
			return Yn
		case 'force-dark':
			// Always use reverse polarity (lighter contrast = darker background perception)
			return Yr
		case 'prefer-light':
			// Use normal if valid, otherwise reverse
			if (xng) {
				return Yn
			}
			if (xrg) {
				return Yr
			}
			return Yn // Fallback to normal
		case 'prefer-dark':
			// Use reverse if valid, otherwise normal
			if (xrg) {
				return Yr
			}
			if (xng) {
				return Yn
			}
			return Yr // Fallback to reverse
	}
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
