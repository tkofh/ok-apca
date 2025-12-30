/**
 * Heuristic corrections to compensate for Y = L³ approximation.
 *
 * CSS uses Y = L³ instead of full Y = yc0·C³ + yc1·C²·L + yc2·C·L² + L³ to avoid
 * exponential expression growth. This causes contrast under-delivery, especially
 * for dark/mid-lightness bases and high contrast targets.
 *
 * Correction formula:
 *   boostPct = (darkBoost * max(0, 0.3 - L) + midBoost * max(0, 1 - |L - 0.5| * 2.5)) / 100
 *   adjusted = target * (1 + boostPct) + contrastBoost * max(0, target - 30)
 */

import { gamutMap } from './color.ts'
import { applyContrast } from './contrast.ts'
import { measureContrast } from './measure.ts'
import type { HeuristicCoefficients, HeuristicFitResult } from './types.ts'

interface SamplePoint {
	readonly baseL: number
	readonly target: number
	readonly error: number
	readonly maxPossible: number
}

const fittedCoefficientsCache = new Map<string, HeuristicFitResult>()

export function clearHeuristicCache(): void {
	fittedCoefficientsCache.clear()
}

function computeSamplePoint(
	hue: number,
	chroma: number,
	lightness: number,
	targetContrast: number,
): SamplePoint {
	const baseColor = gamutMap({ hue, chroma, lightness })
	const contrastColor = applyContrast({ hue, chroma, lightness }, targetContrast)
	const actual = Math.abs(measureContrast(baseColor, contrastColor))
	const error = actual - targetContrast

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

function sampleErrors(hue: number): SamplePoint[] {
	const lightnessSteps = 21
	const chromaSteps = 5
	const contrastSteps = 16

	const samples: SamplePoint[] = []

	for (let lIdx = 0; lIdx < lightnessSteps; lIdx++) {
		const lightness = lIdx / (lightnessSteps - 1)

		for (let cIdx = 0; cIdx < chromaSteps; cIdx++) {
			const chroma = (cIdx / (chromaSteps - 1)) * 0.5

			for (let contIdx = 0; contIdx < contrastSteps; contIdx++) {
				const targetContrast = 30 + (contIdx / (contrastSteps - 1)) * 75
				samples.push(computeSamplePoint(hue, chroma, lightness, targetContrast))
			}
		}
	}

	return samples
}

function computeBoost(baseL: number, target: number, coeffs: HeuristicCoefficients): number {
	const darkTerm = coeffs.darkBoost * Math.max(0, 0.3 - baseL)
	const midTerm = coeffs.midBoost * Math.max(0, 1 - Math.abs(baseL - 0.5) * 2.5)
	const boostPercentage = (darkTerm + midTerm) / 100

	const multiplicativeBoost = target * boostPercentage
	const contrastTerm = coeffs.contrastBoost * Math.max(0, target - 30)

	return multiplicativeBoost + contrastTerm
}

function evaluateCoefficients(
	samples: SamplePoint[],
	coeffs: HeuristicCoefficients,
): { mae: number; worstUnderDelivery: number; underDeliveryRate: number; validCount: number } {
	let totalAbsError = 0
	let worstUnder = 0
	let underCount = 0
	let validCount = 0

	for (const s of samples) {
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

function scoreCoefficients(result: ReturnType<typeof evaluateCoefficients>): number {
	// Balance under-delivery rate, worst under-delivery severity, and MAE
	// Penalize severe under-delivery more heavily
	const worstPenalty = Math.max(0, -result.worstUnderDelivery - 30) * 2
	return result.underDeliveryRate * 500 + worstPenalty + result.mae
}

function coarseGridSearch(samples: SamplePoint[]): {
	coeffs: HeuristicCoefficients
	score: number
} {
	let bestCoeffs: HeuristicCoefficients = { darkBoost: 40, midBoost: 25, contrastBoost: 0.2 }
	let bestScore = Number.POSITIVE_INFINITY

	for (let darkBoost = 20; darkBoost <= 150; darkBoost += 10) {
		for (let midBoost = 10; midBoost <= 80; midBoost += 10) {
			for (let contrastBoost = 0.1; contrastBoost <= 0.8; contrastBoost += 0.05) {
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

function fineGridSearch(
	samples: SamplePoint[],
	coarseBest: HeuristicCoefficients,
): HeuristicCoefficients {
	let bestCoeffs = coarseBest
	let bestScore = Number.POSITIVE_INFINITY

	for (
		let darkBoost = Math.max(20, coarseBest.darkBoost - 10);
		darkBoost <= Math.min(150, coarseBest.darkBoost + 10);
		darkBoost += 2
	) {
		for (
			let midBoost = Math.max(10, coarseBest.midBoost - 10);
			midBoost <= Math.min(80, coarseBest.midBoost + 10);
			midBoost += 2
		) {
			for (
				let contrastBoost = Math.max(0.1, coarseBest.contrastBoost - 0.05);
				contrastBoost <= Math.min(0.8, coarseBest.contrastBoost + 0.05);
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
 * Fit heuristic coefficients via grid search.
 * Minimizes under-delivery while keeping average error reasonable.
 * Results are cached.
 *
 * @param hue - The hue angle (0-360)
 * @param _allowPolarityInversion - Deprecated, ignored. Kept for API compatibility.
 */
export function fitHeuristicCoefficients(
	hue: number,
	_allowPolarityInversion?: boolean,
): HeuristicFitResult {
	const cacheKey = `${hue}`
	const cached = fittedCoefficientsCache.get(cacheKey)
	if (cached) {
		return cached
	}

	const samples = sampleErrors(hue)

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
