/**
 * Error measurement and correction coefficient computation.
 *
 * This module provides utilities to measure the difference between
 * CSS-matching and precise contrast implementations, and to compute
 * polynomial correction coefficients that minimize that error.
 */

import { Matrix, solve } from 'ml-matrix'
import { type Color, ColorImpl, gamutMap } from './color.ts'
import { applyContrast, applyContrastPrecise } from './contrast.ts'
import { findGamutBoundary } from './gamut.ts'
import type { ContrastMode, CorrectionCoefficients, GamutBoundary } from './types.ts'

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
 * Apply correction coefficients to a target lightness value.
 *
 * @param baseL - The base color lightness (0-1)
 * @param targetL - The uncorrected target lightness (0-1)
 * @param coeffs - The correction coefficients
 * @returns The corrected lightness value
 */
function applyCorrectionToL(baseL: number, targetL: number, coeffs: CorrectionCoefficients) {
	const correction =
		coeffs.a +
		coeffs.b * baseL +
		coeffs.c * targetL +
		coeffs.d * baseL * targetL +
		coeffs.e * baseL * baseL +
		coeffs.f * targetL * targetL

	return Math.max(0, Math.min(1, targetL - correction))
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
 * @param correction - Optional correction coefficients to apply
 * @returns Error metrics comparing the two implementations
 */
export function measureContrastError(
	color: Color,
	contrast: number,
	mode: ContrastMode,
	boundary?: GamutBoundary,
	correction?: CorrectionCoefficients,
): ContrastError {
	const gamutBoundary = boundary ?? findGamutBoundary(color.hue)

	let cssResult = applyContrast(color, contrast, mode, gamutBoundary)

	// Apply correction if provided
	if (correction) {
		const baseL = gamutMap(color, gamutBoundary).lightness
		const correctedL = applyCorrectionToL(baseL, cssResult.lightness, correction)
		cssResult = gamutMap(new ColorImpl(color.hue, cssResult.chroma, correctedL), gamutBoundary)
	}

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

interface ErrorSample {
	baseL: number
	targetL: number
	errorL: number
}

/**
 * Collect error samples across lightness × contrast space.
 */
function collectErrorSamples(hue: number, chroma: number, boundary: GamutBoundary) {
	const samples: ErrorSample[] = []
	const contrastLevels = [15, 30, 45, 60, 75, 90]
	const modes: ContrastMode[] = ['prefer-dark', 'prefer-light']

	for (let baseL = 0.05; baseL <= 0.95; baseL += 0.025) {
		for (const contrast of contrastLevels) {
			for (const mode of modes) {
				const color = { hue, chroma, lightness: baseL }
				const cssResult = applyContrast(color, contrast, mode, boundary)
				const preciseResult = applyContrastPrecise(color, contrast, mode, boundary)

				// Skip edge cases
				const isEdgeCase =
					cssResult.lightness < 0.02 ||
					cssResult.lightness > 0.98 ||
					Math.abs(cssResult.lightness - preciseResult.lightness) < 0.0001

				if (!isEdgeCase) {
					samples.push({
						baseL,
						targetL: cssResult.lightness,
						errorL: cssResult.lightness - preciseResult.lightness,
					})
				}
			}
		}
	}

	return samples
}

/**
 * Fit polynomial coefficients to error samples using least squares.
 */
function fitPolynomialCoefficients(samples: ErrorSample[]): CorrectionCoefficients {
	// Build design matrix X and response vector y
	// Features: [1, baseL, targetL, baseL*targetL, baseL², targetL²]
	const X = new Matrix(
		samples.map((s) => [1, s.baseL, s.targetL, s.baseL * s.targetL, s.baseL ** 2, s.targetL ** 2]),
	)
	const y = Matrix.columnVector(samples.map((s) => s.errorL))

	// Solve least squares: (X'X)β = X'y
	const XT = X.transpose()
	const coeffs = solve(XT.mmul(X), XT.mmul(y)).getColumn(0)

	return {
		a: coeffs[0] as number,
		b: coeffs[1] as number,
		c: coeffs[2] as number,
		d: coeffs[3] as number,
		e: coeffs[4] as number,
		f: coeffs[5] as number,
	}
}

/**
 * Compute correction coefficients for a specific hue and chroma.
 *
 * This function samples the error between CSS-matching and precise
 * implementations across the lightness×contrast space and fits a
 * polynomial correction function.
 *
 * @param hue - The hue angle (0-360)
 * @param chroma - The chroma value for sampling (typically 0.1-0.15)
 * @param boundary - Optional pre-computed gamut boundary
 * @returns Correction coefficients that minimize CSS approximation error
 */
export function computeCorrectionCoefficients(
	hue: number,
	chroma: number,
	boundary?: GamutBoundary,
): CorrectionCoefficients {
	const gamutBoundary = boundary ?? findGamutBoundary(hue)
	const samples = collectErrorSamples(hue, chroma, gamutBoundary)

	if (samples.length === 0) {
		return { a: 0, b: 0, c: 0, d: 0, e: 0, f: 0 }
	}

	return fitPolynomialCoefficients(samples)
}
