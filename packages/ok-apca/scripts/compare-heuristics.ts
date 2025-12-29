/**
 * Compare heuristic performance with curvature-corrected gamut mapping.
 *
 * This measures contrast delivery WITH heuristic correction applied,
 * simulating what the CSS would actually produce at runtime.
 */

import { solveTargetY } from '../src/apca.ts'
import { createColor, findGamutSlice, gamutMap } from '../src/color.ts'
import {
	clearHeuristicCache,
	fitHeuristicCoefficients,
	type HeuristicCoefficients,
} from '../src/heuristic.ts'
import { measureContrast } from '../src/measure.ts'
import type { GamutSlice } from '../src/types.ts'
import { clamp } from '../src/util.ts'

// Clear cache to ensure fresh fitting
clearHeuristicCache()

interface TestResult {
	readonly hue: number
	readonly avgError: number
	readonly worstUnderDelivery: number
	readonly underDeliveryRate: number
	readonly overDeliveryRate: number
	readonly coefficients: HeuristicCoefficients
}

/**
 * Apply heuristic boost to target contrast (matching CSS generator logic).
 */
function applyHeuristicBoost(target: number, baseL: number, coeffs: HeuristicCoefficients): number {
	const darkTerm = coeffs.darkBoost * Math.max(0, 0.3 - baseL)
	const midTerm = coeffs.midBoost * Math.max(0, 1 - Math.abs(baseL - 0.5) * 2.5)
	const boostPct = (darkTerm + midTerm) / 100

	const multiplicativeBoost = target * boostPct
	const absoluteBoost = coeffs.contrastBoost * Math.max(0, target - 30)

	return target + multiplicativeBoost + absoluteBoost
}

/**
 * Compute max chroma using tent with curvature correction.
 */
function computeMaxChroma(L: number, slice: GamutSlice): number {
	const { apex, curvature } = slice

	if (L <= 0 || L >= 1) {
		return 0
	}
	if (apex.lightness <= 0 || apex.lightness >= 1) {
		return 0
	}

	if (L <= apex.lightness) {
		return (apex.chroma * L) / apex.lightness
	}

	const linearChroma = (apex.chroma * (1 - L)) / (1 - apex.lightness)
	const t = (L - apex.lightness) / (1 - apex.lightness)
	const correction = curvature * t * (1 - t) * apex.chroma

	return linearChroma + correction
}

/**
 * Simulate CSS contrast color computation with heuristic correction.
 */
function computeContrastColorWithHeuristic(
	hue: number,
	chroma: number,
	lightness: number,
	targetContrast: number,
	coeffs: HeuristicCoefficients,
	slice: GamutSlice,
): { contrastL: number; contrastC: number } {
	const baseColor = gamutMap(createColor(hue, chroma, lightness))
	const L = baseColor.lightness

	// Apply heuristic boost (matching CSS generator)
	const boostedContrast = applyHeuristicBoost(targetContrast, L, coeffs)
	const clampedContrast = clamp(-108, -boostedContrast, 108)

	// Y = L³ (simplified, matching CSS)
	const Y = L ** 3

	// Solve for target Y
	const targetY = solveTargetY(Y, clampedContrast, true)
	const contrastL = clamp(0, targetY ** (1 / 3), 1)

	// Compute chroma at contrast lightness (use gamut-mapped chroma, matching CSS)
	const maxChromaAtBase = computeMaxChroma(L, slice)
	const chromaPct = maxChromaAtBase > 0 ? clamp(0, baseColor.chroma / maxChromaAtBase, 1) : 0
	const maxChromaAtContrast = computeMaxChroma(contrastL, slice)
	const contrastC = maxChromaAtContrast * chromaPct

	return { contrastL, contrastC }
}

// biome-ignore lint/complexity/noExcessiveCognitiveComplexity: analysis script
function runTests(hue: number): TestResult {
	const { coefficients } = fitHeuristicCoefficients(hue, true)
	const slice = findGamutSlice(hue)

	const lightnessSteps = 21
	const chromaSteps = 5
	const contrastSteps = 16

	let totalError = 0
	let worstUnder = 0
	let underCount = 0
	let overCount = 0
	let validCount = 0

	for (let lIdx = 0; lIdx < lightnessSteps; lIdx++) {
		const lightness = lIdx / (lightnessSteps - 1)

		for (let cIdx = 0; cIdx < chromaSteps; cIdx++) {
			const chroma = (cIdx / (chromaSteps - 1)) * 0.5

			for (let contIdx = 0; contIdx < contrastSteps; contIdx++) {
				const targetContrast = 30 + (contIdx / (contrastSteps - 1)) * 75

				const baseColor = gamutMap(createColor(hue, chroma, lightness))

				// Check if target is achievable
				const black = gamutMap(createColor(hue, 0, 0))
				const white = gamutMap(createColor(hue, 0, 1))
				const toBlack = Math.abs(measureContrast(baseColor, black))
				const toWhite = Math.abs(measureContrast(baseColor, white))
				const maxPossible = Math.max(toBlack, toWhite)

				if (maxPossible < targetContrast - 0.5) {
					continue // Skip impossible targets
				}

				validCount++

				// Compute contrast color WITH heuristic correction
				const { contrastL, contrastC } = computeContrastColorWithHeuristic(
					hue,
					chroma,
					lightness,
					targetContrast,
					coefficients,
					slice,
				)

				const contrastColor = createColor(hue, contrastC, contrastL)
				const actual = Math.abs(measureContrast(baseColor, contrastColor))
				const error = actual - targetContrast

				totalError += error

				if (error < -0.5) {
					underCount++
					worstUnder = Math.min(worstUnder, error)
				}
				if (error > 0.5) {
					overCount++
				}
			}
		}
	}

	return {
		hue,
		avgError: validCount > 0 ? totalError / validCount : 0,
		worstUnderDelivery: worstUnder,
		underDeliveryRate: validCount > 0 ? underCount / validCount : 0,
		overDeliveryRate: validCount > 0 ? overCount / validCount : 0,
		coefficients,
	}
}

console.log('Testing contrast delivery WITH heuristic correction...\n')

// Show gamut slice info
console.log('Gamut Slice Info (with curvature correction):')
console.log('Hue\tApex L\tApex C\tCurvature\tCurve×C')
console.log('---\t------\t------\t---------\t-------')

const hues = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

for (const hue of hues) {
	const slice = findGamutSlice(hue)
	const curveScale = slice.curvature * slice.apex.chroma
	console.log(
		`${hue}\t${slice.apex.lightness.toFixed(3)}\t${slice.apex.chroma.toFixed(3)}\t${slice.curvature.toFixed(3)}\t\t${curveScale.toFixed(4)}`,
	)
}

console.log('\n\nHeuristic-Corrected Contrast Delivery:')
console.log('Hue\tDark\tMid\tContr\tAvg Err\tWorst\tUnder%\tOver%')
console.log('---\t----\t---\t-----\t-------\t-----\t------\t-----')

let totalAvgError = 0
let worstOverall = 0
let maxUnderRate = 0
let maxOverRate = 0

for (const hue of hues) {
	const result = runTests(hue)
	const c = result.coefficients

	console.log(
		`${result.hue}\t${c.darkBoost}\t${c.midBoost}\t${c.contrastBoost.toFixed(2)}\t${result.avgError.toFixed(2)}\t${result.worstUnderDelivery.toFixed(1)}\t${(result.underDeliveryRate * 100).toFixed(1)}%\t${(result.overDeliveryRate * 100).toFixed(1)}%`,
	)

	totalAvgError += result.avgError
	worstOverall = Math.min(worstOverall, result.worstUnderDelivery)
	maxUnderRate = Math.max(maxUnderRate, result.underDeliveryRate)
	maxOverRate = Math.max(maxOverRate, result.overDeliveryRate)
}

console.log('\n=== Summary ===')
console.log(`Average error: ${(totalAvgError / hues.length).toFixed(2)} (positive = over-delivery)`)
console.log(`Worst under-delivery: ${worstOverall.toFixed(2)}`)
console.log(`Max under-delivery rate: ${(maxUnderRate * 100).toFixed(1)}%`)
console.log(`Max over-delivery rate: ${(maxOverRate * 100).toFixed(1)}%`)
