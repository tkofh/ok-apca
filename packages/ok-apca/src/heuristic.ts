/**
 * Heuristic corrections for APCA contrast accuracy.
 *
 * The CSS implementation uses simplified math (Y = L³) that ignores chroma's
 * contribution to luminance. While Y = yc2·C·L² + L³ is 31% more accurate, it
 * causes exponential CSS expression growth. The simplified Y = L³ causes
 * under-delivery of contrast, especially for dark base colors, mid-lightness
 * colors, and high contrast targets.
 *
 * The correction formula uses multiplicative boost for smooth interpolation:
 *   boostPct = (darkBoost * max(0, 0.3 - L) + midBoost * max(0, 1 - |L - 0.5| * 2.5)) / 100
 *   adjusted = target * (1 + boostPct) + contrastBoost * max(0, target - 30)
 *
 * Where:
 *   - darkBoost: percentage boost for dark bases (L < 0.3)
 *   - midBoost: percentage boost for mid-lightness (peaks at L = 0.5)
 *   - contrastBoost: additional Lc boost for high contrast targets (> 30 Lc)
 *
 * The multiplicative approach ensures smooth interpolation from 0 Lc.
 */

import { gamutMap } from './color.ts'
import { applyContrast } from './contrast.ts'
import { measureContrast } from './measure.ts'
import type { ContrastMode } from './types.ts'

/**
 * Heuristic correction coefficients.
 */
export interface HeuristicCoefficients {
	/** Percentage boost for dark bases (L < 0.3): contributes darkBoost * max(0, 0.3 - L) to boost percentage */
	readonly darkBoost: number
	/** Percentage boost for mid-lightness (peaks at L=0.5): contributes midBoost * max(0, 1 - |L - 0.5| * 2.5) to boost percentage */
	readonly midBoost: number
	/** Absolute Lc boost for high contrast (> 30 Lc): adds contrastBoost * max(0, target - 30) to final result */
	readonly contrastBoost: number
}

/**
 * Result of fitting heuristic coefficients for a hue.
 */
export interface HeuristicFitResult {
	/** The fitted coefficients */
	readonly coefficients: HeuristicCoefficients
	/** Mean absolute error after correction */
	readonly mae: number
	/** Worst-case under-delivery (negative = under-delivered) */
	readonly worstUnderDelivery: number
	/** Percentage of samples that under-deliver after correction */
	readonly underDeliveryRate: number
	/** Number of valid (non-gamut-limited) samples */
	readonly sampleCount: number
}

/**
 * A sample point with error data.
 */
interface SamplePoint {
	readonly baseL: number
	readonly target: number
	readonly error: number // actual - target (negative = under-delivered)
	readonly maxPossible: number // maximum achievable contrast
}

/**
 * Cache for fitted heuristic coefficients by hue and mode.
 */
const fittedCoefficientsCache = new Map<string, HeuristicFitResult>()

/**
 * Clear the heuristic coefficients cache.
 *
 * This should be called when switching gamuts (e.g., from sRGB to P3)
 * to ensure coefficients are re-fitted for the new gamut boundaries.
 */
export function clearHeuristicCache(): void {
	fittedCoefficientsCache.clear()
}

/**
 * Compute a single sample point for error analysis.
 */
function computeSamplePoint(
	hue: number,
	chroma: number,
	lightness: number,
	targetContrast: number,
	mode: ContrastMode,
): SamplePoint {
	const baseColor = gamutMap({ hue, chroma, lightness })
	const contrastColor = applyContrast({ hue, chroma, lightness }, targetContrast, mode)
	const actual = Math.abs(measureContrast(baseColor, contrastColor))
	const error = actual - targetContrast

	// Compute maximum possible contrast (to black or white)
	const black = gamutMap({ hue, chroma: 0, lightness: 0 })
	const white = gamutMap({ hue, chroma: 0, lightness: 1 })
	const toBlack = Math.abs(measureContrast(baseColor, black))
	const toWhite = Math.abs(measureContrast(baseColor, white))
	const maxPossible = Math.max(toBlack, toWhite)

	return {
		baseL: baseColor.lightness,
		target: targetContrast,
		error,
		maxPossible,
	}
}

/**
 * Sample error data for a given hue and contrast mode.
 */
function sampleErrors(hue: number, mode: ContrastMode): SamplePoint[] {
	const lightnessSteps = 21
	const chromaSteps = 5
	const contrastSteps = 16

	const samples: SamplePoint[] = []

	for (let lIdx = 0; lIdx < lightnessSteps; lIdx++) {
		const lightness = lIdx / (lightnessSteps - 1)

		for (let cIdx = 0; cIdx < chromaSteps; cIdx++) {
			const chroma = (cIdx / (chromaSteps - 1)) * 0.5

			// Sample contrast from 30 to 105 (accessibility-relevant range)
			for (let contIdx = 0; contIdx < contrastSteps; contIdx++) {
				const targetContrast = 30 + (contIdx / (contrastSteps - 1)) * 75
				samples.push(computeSamplePoint(hue, chroma, lightness, targetContrast, mode))
			}
		}
	}

	return samples
}

/**
 * Compute the correction boost for given parameters.
 * Uses multiplicative correction to ensure smooth interpolation from 0.
 */
function computeBoost(baseL: number, target: number, coeffs: HeuristicCoefficients): number {
	// Compute percentage boost based on lightness
	const darkTerm = coeffs.darkBoost * Math.max(0, 0.3 - baseL)
	const midTerm = coeffs.midBoost * Math.max(0, 1 - Math.abs(baseL - 0.5) * 2.5)
	const boostPercentage = (darkTerm + midTerm) / 100

	// Apply multiplicative boost to target (naturally becomes 0 when target is 0)
	const multiplicativeBoost = target * boostPercentage

	// Add absolute boost for high contrast
	const contrastTerm = coeffs.contrastBoost * Math.max(0, target - 30)

	return multiplicativeBoost + contrastTerm
}

/**
 * Evaluate coefficients on sample data.
 */
function evaluateCoefficients(
	samples: SamplePoint[],
	coeffs: HeuristicCoefficients,
): { mae: number; worstUnderDelivery: number; underDeliveryRate: number; validCount: number } {
	let totalAbsError = 0
	let worstUnder = 0
	let underCount = 0
	let validCount = 0

	for (const s of samples) {
		// Skip gamut-limited cases (impossible to achieve target)
		if (s.maxPossible < s.target - 0.5) {
			continue
		}
		validCount++

		const boost = computeBoost(s.baseL, s.target, coeffs)
		const correctedError = s.error + boost

		totalAbsError += Math.abs(correctedError)
		if (correctedError < -0.5) {
			underCount++
			worstUnder = Math.min(worstUnder, correctedError)
		}
	}

	return {
		mae: validCount > 0 ? totalAbsError / validCount : 0,
		worstUnderDelivery: worstUnder,
		underDeliveryRate: validCount > 0 ? underCount / validCount : 0,
		validCount,
	}
}

/**
 * Score function for coefficient optimization.
 * Prioritizes minimizing under-delivery rate, then MAE.
 */
function scoreCoefficients(result: ReturnType<typeof evaluateCoefficients>): number {
	return result.underDeliveryRate * 1000 + result.mae
}

/**
 * Coarse grid search for best coefficient starting point.
 */
function coarseGridSearch(samples: SamplePoint[]): {
	coeffs: HeuristicCoefficients
	score: number
} {
	let bestCoeffs: HeuristicCoefficients = { darkBoost: 40, midBoost: 25, contrastBoost: 0.2 }
	let bestScore = Number.POSITIVE_INFINITY

	for (let darkBoost = 20; darkBoost <= 80; darkBoost += 10) {
		for (let midBoost = 10; midBoost <= 50; midBoost += 10) {
			for (let contrastBoost = 0.1; contrastBoost <= 0.4; contrastBoost += 0.05) {
				const coeffs = { darkBoost, midBoost, contrastBoost }
				const result = evaluateCoefficients(samples, coeffs)
				const score = scoreCoefficients(result)
				if (score < bestScore) {
					bestScore = score
					bestCoeffs = coeffs
				}
			}
		}
	}

	return { coeffs: bestCoeffs, score: bestScore }
}

/**
 * Fine-tune grid search around a coarse result.
 */
function fineGridSearch(
	samples: SamplePoint[],
	coarseBest: HeuristicCoefficients,
): HeuristicCoefficients {
	let bestCoeffs = coarseBest
	let bestScore = Number.POSITIVE_INFINITY

	for (
		let darkBoost = Math.max(20, coarseBest.darkBoost - 10);
		darkBoost <= Math.min(80, coarseBest.darkBoost + 10);
		darkBoost += 2
	) {
		for (
			let midBoost = Math.max(10, coarseBest.midBoost - 10);
			midBoost <= Math.min(50, coarseBest.midBoost + 10);
			midBoost += 2
		) {
			for (
				let contrastBoost = Math.max(0.1, coarseBest.contrastBoost - 0.05);
				contrastBoost <= Math.min(0.4, coarseBest.contrastBoost + 0.05);
				contrastBoost += 0.01
			) {
				const coeffs = { darkBoost, midBoost, contrastBoost }
				const result = evaluateCoefficients(samples, coeffs)
				const score = scoreCoefficients(result)
				if (score < bestScore) {
					bestScore = score
					bestCoeffs = coeffs
				}
			}
		}
	}

	return bestCoeffs
}

/**
 * Fit heuristic coefficients for a specific hue and contrast mode.
 *
 * Uses grid search to find coefficients that minimize under-delivery
 * while keeping average error reasonable. Results are cached internally
 * to avoid redundant computation.
 *
 * @param hue - The hue to fit (0-360)
 * @param mode - The contrast mode to fit
 * @returns Fitted coefficients and validation metrics
 */
export function fitHeuristicCoefficients(hue: number, mode: ContrastMode): HeuristicFitResult {
	const cacheKey = `${hue}:${mode}`
	const cached = fittedCoefficientsCache.get(cacheKey)
	if (cached) {
		return cached
	}

	const samples = sampleErrors(hue, mode)

	// Two-stage grid search: coarse then fine
	const coarseResult = coarseGridSearch(samples)
	const bestCoeffs = fineGridSearch(samples, coarseResult.coeffs)

	const validation = evaluateCoefficients(samples, bestCoeffs)

	const result: HeuristicFitResult = {
		coefficients: bestCoeffs,
		mae: validation.mae,
		worstUnderDelivery: validation.worstUnderDelivery,
		underDeliveryRate: validation.underDeliveryRate,
		sampleCount: validation.validCount,
	}

	fittedCoefficientsCache.set(cacheKey, result)
	return result
}

/**
 * Apply heuristic correction to target contrast value.
 *
 * @param targetContrast - Requested contrast value (0-108)
 * @param baseL - Base color lightness (0-1)
 * @param coeffs - Heuristic coefficients
 * @returns Adjusted contrast value
 */
export function applyHeuristicCorrection(
	targetContrast: number,
	baseL: number,
	coeffs: HeuristicCoefficients,
): number {
	const boost = computeBoost(baseL, targetContrast, coeffs)
	return targetContrast + boost
}
