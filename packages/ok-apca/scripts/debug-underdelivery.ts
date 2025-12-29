/**
 * Debug the worst under-delivery cases to understand what's happening.
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

clearHeuristicCache()

function applyHeuristicBoost(target: number, baseL: number, coeffs: HeuristicCoefficients): number {
	const darkTerm = coeffs.darkBoost * Math.max(0, 0.3 - baseL)
	const midTerm = coeffs.midBoost * Math.max(0, 1 - Math.abs(baseL - 0.5) * 2.5)
	const boostPct = (darkTerm + midTerm) / 100

	const multiplicativeBoost = target * boostPct
	const absoluteBoost = coeffs.contrastBoost * Math.max(0, target - 30)

	return target + multiplicativeBoost + absoluteBoost
}

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

function computeContrastColorWithHeuristic(
	hue: number,
	chroma: number,
	lightness: number,
	targetContrast: number,
	coeffs: HeuristicCoefficients,
	slice: GamutSlice,
): { contrastL: number; contrastC: number; boostedContrast: number } {
	const baseColor = gamutMap(createColor(hue, chroma, lightness))
	const L = baseColor.lightness

	const boostedContrast = applyHeuristicBoost(targetContrast, L, coeffs)
	const clampedContrast = clamp(-108, -boostedContrast, 108)

	const Y = L ** 3
	const targetY = solveTargetY(Y, clampedContrast, true)
	const contrastL = clamp(0, targetY ** (1 / 3), 1)

	const maxChromaAtBase = computeMaxChroma(L, slice)
	const chromaPct = maxChromaAtBase > 0 ? clamp(0, baseColor.chroma / maxChromaAtBase, 1) : 0
	const maxChromaAtContrast = computeMaxChroma(contrastL, slice)
	const contrastC = maxChromaAtContrast * chromaPct

	return { contrastL, contrastC, boostedContrast }
}

// Test hue 150 which showed -105 worst case
const hue = 150
const { coefficients } = fitHeuristicCoefficients(hue, true)
const slice = findGamutSlice(hue)

console.log(
	`Hue ${hue} - Coefficients: dark=${coefficients.darkBoost}, mid=${coefficients.midBoost}, contrast=${coefficients.contrastBoost.toFixed(2)}`,
)
console.log(
	`Apex: L=${slice.apex.lightness.toFixed(3)}, C=${slice.apex.chroma.toFixed(3)}, curvature=${slice.curvature.toFixed(3)}`,
)
console.log()

console.log('Finding worst under-delivery cases...\n')

interface WorstCase {
	lightness: number
	chroma: number
	target: number
	actual: number
	error: number
	boostedContrast: number
	maxPossible: number
}

const worstCases: WorstCase[] = []

const lightnessSteps = 51
const chromaSteps = 11
const contrastSteps = 31

for (let lIdx = 0; lIdx < lightnessSteps; lIdx++) {
	const lightness = lIdx / (lightnessSteps - 1)

	for (let cIdx = 0; cIdx < chromaSteps; cIdx++) {
		const chroma = (cIdx / (chromaSteps - 1)) * 0.5

		for (let contIdx = 0; contIdx < contrastSteps; contIdx++) {
			const targetContrast = 30 + (contIdx / (contrastSteps - 1)) * 75

			const baseColor = gamutMap(createColor(hue, chroma, lightness))

			const black = gamutMap(createColor(hue, 0, 0))
			const white = gamutMap(createColor(hue, 0, 1))
			const toBlack = Math.abs(measureContrast(baseColor, black))
			const toWhite = Math.abs(measureContrast(baseColor, white))
			const maxPossible = Math.max(toBlack, toWhite)

			if (maxPossible < targetContrast - 0.5) {
				continue
			}

			const { contrastL, contrastC, boostedContrast } = computeContrastColorWithHeuristic(
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

			if (error < -30) {
				worstCases.push({
					lightness,
					chroma,
					target: targetContrast,
					actual,
					error,
					boostedContrast,
					maxPossible,
				})
			}
		}
	}
}

// Sort by error (most negative first)
worstCases.sort((a, b) => a.error - b.error)

console.log('Top 20 worst under-delivery cases:')
console.log('L\tC\tTarget\tActual\tError\tBoosted\tMaxPoss')
console.log('---\t---\t------\t------\t-----\t-------\t-------')

for (const c of worstCases.slice(0, 20)) {
	console.log(
		`${c.lightness.toFixed(2)}\t${c.chroma.toFixed(2)}\t${c.target.toFixed(0)}\t${c.actual.toFixed(1)}\t${c.error.toFixed(1)}\t${c.boostedContrast.toFixed(1)}\t${c.maxPossible.toFixed(1)}`,
	)
}
