/**
 * Precise color math helpers for accurate OKLCH to luminance conversion.
 *
 * These functions are used by the precise contrast implementation and
 * include full polynomial Y conversion with chroma contribution,
 * APCA soft-toe adjustment, and Cardano's formula for cubic solving.
 */

import { signedCbrt } from './apca.ts'

/**
 * Y-conversion coefficients for a specific hue and chroma.
 */
export interface YCoefficients {
	readonly yc0: number
	readonly yc1: number
	readonly yc2: number
}

/**
 * Compute Y-conversion coefficients for a specific hue and chroma.
 *
 * These coefficients allow converting OKLCH lightness to CIE luminance Y
 * via: Y = yc0 + yc1*L + yc2*L² + L³
 */
export function computeYCoefficients(hue: number, chroma: number): YCoefficients {
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
export function applySoftToe(Y: number) {
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
export function invertSoftToe(Yadj: number) {
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
export function solveCubicForL(yc0: number, yc1: number, yc2: number, targetY: number) {
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
