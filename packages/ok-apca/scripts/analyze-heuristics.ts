/**
 * Analyze current heuristic performance and check if refitting improves results.
 */

import { clearHeuristicCache, fitHeuristicCoefficients } from '../src/heuristic.ts'

// Clear cache to force refitting with new gamut mapping
clearHeuristicCache()

console.log('Refitting heuristic coefficients with curvature-corrected gamut mapping...\n')

const hues = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]

console.log('Hue\tDark\tMid\tContrast\tMAE\tWorst Under\tUnder Rate')
console.log('---\t----\t---\t--------\t---\t-----------\t----------')

let totalMAE = 0
let worstOverall = 0
let maxUnderRate = 0

for (const hue of hues) {
	const result = fitHeuristicCoefficients(hue, true)
	const { coefficients: c, mae, worstUnderDelivery, underDeliveryRate } = result

	console.log(
		`${hue}\t${c.darkBoost}\t${c.midBoost}\t${c.contrastBoost.toFixed(2)}\t\t${mae.toFixed(2)}\t${worstUnderDelivery.toFixed(2)}\t\t${(underDeliveryRate * 100).toFixed(1)}%`,
	)

	totalMAE += mae
	worstOverall = Math.min(worstOverall, worstUnderDelivery)
	maxUnderRate = Math.max(maxUnderRate, underDeliveryRate)
}

console.log('\n=== Summary ===')
console.log(`Average MAE: ${(totalMAE / hues.length).toFixed(2)}`)
console.log(`Worst under-delivery: ${worstOverall.toFixed(2)}`)
console.log(`Max under-delivery rate: ${(maxUnderRate * 100).toFixed(1)}%`)
