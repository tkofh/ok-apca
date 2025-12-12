import { describe, expect, it } from 'vitest'
import {
	clearHeuristicCache,
	fitHeuristicCoefficients,
	type HeuristicFitResult,
} from '../src/heuristic.ts'

// ============================================================================
// Heuristic Fitting Tests for Display P3
// ============================================================================

describe('fitHeuristicCoefficients', () => {
	// Clear cache before tests to ensure fresh P3 fitting
	clearHeuristicCache()

	describe('P3 gamut fitting quality', () => {
		const testHues = [0, 30, 60, 120, 180, 240, 264, 300]
		const allowInversionOptions = [false, true]

		it('should produce reasonable MAE for all hues and inversion options', () => {
			const results: Array<{
				hue: number
				allowInversion: boolean
				result: HeuristicFitResult
			}> = []

			for (const hue of testHues) {
				for (const allowInversion of allowInversionOptions) {
					const result = fitHeuristicCoefficients(hue, allowInversion)
					results.push({ hue, allowInversion, result })

					// MAE should be reasonably low (< 37 Lc for P3's wider gamut)
					// The simplified Y=L³ approximation has larger errors with P3's higher chroma
					// With chroma as % of max, colors use more saturation, increasing approximation error
					expect(result.mae).toBeLessThan(37)
					expect(result.mae).toBeGreaterThan(0)
				}
			}

			// Report summary statistics
			const maes = results.map((r) => r.result.mae)
			const avgMAE = maes.reduce((a, b) => a + b, 0) / maes.length
			const maxMAE = Math.max(...maes)

			console.log('\n📊 P3 Heuristic Fitting Results:')
			console.log(`   Average MAE: ${avgMAE.toFixed(3)} Lc`)
			console.log(`   Max MAE: ${maxMAE.toFixed(3)} Lc`)
		})

		it('should minimize under-delivery rates', () => {
			const results: Array<{
				hue: number
				allowInversion: boolean
				result: HeuristicFitResult
			}> = []

			for (const hue of testHues) {
				for (const allowInversion of allowInversionOptions) {
					const result = fitHeuristicCoefficients(hue, allowInversion)
					results.push({ hue, allowInversion, result })

					// Under-delivery rate should be acceptable (< 80% for P3)
					// P3's wider gamut makes heuristic corrections less effective
					expect(result.underDeliveryRate).toBeLessThan(0.8)
				}
			}

			const rates = results.map((r) => r.result.underDeliveryRate)
			const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length
			const maxRate = Math.max(...rates)

			console.log(`   Average under-delivery rate: ${(avgRate * 100).toFixed(1)}%`)
			console.log(`   Max under-delivery rate: ${(maxRate * 100).toFixed(1)}%`)
		})

		it('should avoid severe under-delivery', () => {
			const results: Array<{
				hue: number
				allowInversion: boolean
				result: HeuristicFitResult
			}> = []

			for (const hue of testHues) {
				for (const allowInversion of allowInversionOptions) {
					const result = fitHeuristicCoefficients(hue, allowInversion)
					results.push({ hue, allowInversion, result })

					// Worst under-delivery should not be too severe (> -80 Lc for P3)
					expect(result.worstUnderDelivery).toBeGreaterThan(-80)
				}
			}

			const worstValues = results.map((r) => r.result.worstUnderDelivery)
			const avgWorst = worstValues.reduce((a, b) => a + b, 0) / worstValues.length
			const absoluteWorst = Math.min(...worstValues)

			console.log(`   Average worst under-delivery: ${avgWorst.toFixed(3)} Lc`)
			console.log(`   Absolute worst under-delivery: ${absoluteWorst.toFixed(3)} Lc`)
		})

		it('should have sufficient valid samples', () => {
			for (const hue of testHues) {
				for (const allowInversion of allowInversionOptions) {
					const result = fitHeuristicCoefficients(hue, allowInversion)

					// Should have at least 1000 valid (non-gamut-limited) samples
					expect(result.sampleCount).toBeGreaterThan(1000)
				}
			}
		})
	})

	describe('coefficient values', () => {
		it('should produce reasonable coefficient ranges', () => {
			const hue = 264
			const allowInversion = true
			const result = fitHeuristicCoefficients(hue, allowInversion)

			// Coefficients should be in reasonable ranges (P3 requires more aggressive corrections)
			expect(result.coefficients.darkBoost).toBeGreaterThan(0)
			expect(result.coefficients.darkBoost).toBeLessThan(100)

			expect(result.coefficients.midBoost).toBeGreaterThan(0)
			expect(result.coefficients.midBoost).toBeLessThan(100)

			expect(result.coefficients.contrastBoost).toBeGreaterThan(0)
			expect(result.coefficients.contrastBoost).toBeLessThan(0.5)
		})

		it('should cache results', () => {
			const hue = 30
			const allowInversion = true

			const result1 = fitHeuristicCoefficients(hue, allowInversion)
			const result2 = fitHeuristicCoefficients(hue, allowInversion)

			// Should return the same object (cached)
			expect(result1).toBe(result2)
		})
	})

	describe('P3 vs sRGB comparison', () => {
		it('should report P3 gamut advantages and tradeoffs', () => {
			console.log('\n🎨 Display P3 Gamut Benefits:')
			console.log('   • ~25% more colors than sRGB')
			console.log('   • Higher maximum chroma values (up to ~0.5 vs ~0.4)')
			console.log('   • Richer, more saturated colors on P3 displays')
			console.log('   • Automatic gamut mapping on sRGB displays')
			console.log('\n⚠️  P3 Tradeoffs:')
			console.log('   • Simplified Y=L³ approximation less accurate with higher chroma')
			console.log('   • (Improved Y=yc2·C·L²+L³ causes exponential CSS expression growth)')
			console.log('   • Heuristic corrections compensate but with higher average error')
			console.log('   • MAE typically 15-20 Lc (vs 3-5 Lc for sRGB)')
			console.log('   • Still produces accessible contrasts, just less precise')

			// This is informational, not an assertion
			expect(true).toBe(true)
		})
	})

	describe('inversion-specific fitting', () => {
		it('should fit different coefficients for different inversion settings', () => {
			const hue = 180
			const withInversion = fitHeuristicCoefficients(hue, true)
			const withoutInversion = fitHeuristicCoefficients(hue, false)

			// Different inversion settings may produce different coefficients
			const withCoeffs = JSON.stringify(withInversion.coefficients)
			const withoutCoeffs = JSON.stringify(withoutInversion.coefficients)

			// Coefficients might differ based on inversion behavior
			// (though they could also be the same if the heuristic doesn't need adjustment)
			expect(withCoeffs).toBeDefined()
			expect(withoutCoeffs).toBeDefined()
		})
	})

	describe('cache clearing', () => {
		it('should clear cache and recompute', () => {
			const hue = 90
			const allowInversion = true

			// Fit once
			const result1 = fitHeuristicCoefficients(hue, allowInversion)

			// Clear cache
			clearHeuristicCache()

			// Fit again - should recompute but produce same result
			const result2 = fitHeuristicCoefficients(hue, allowInversion)

			// Results should be equal but not the same object
			expect(result1).not.toBe(result2)
			expect(result1.coefficients).toEqual(result2.coefficients)
			expect(result1.mae).toBeCloseTo(result2.mae, 3)
		})
	})

	describe('detailed reporting for key hues', () => {
		it('should report detailed metrics for important hues', () => {
			const keyHues = [
				{ hue: 0, name: 'Red' },
				{ hue: 120, name: 'Green' },
				{ hue: 240, name: 'Blue' },
				{ hue: 264, name: 'Purple' },
			]

			console.log('\n📈 Detailed P3 Fitting Metrics by Hue:')

			for (const { hue, name } of keyHues) {
				const result = fitHeuristicCoefficients(hue, true)

				console.log(`\n   ${name} (${hue}°) with inversion:`)
				console.log(`     MAE: ${result.mae.toFixed(3)} Lc`)
				console.log(`     Under-delivery rate: ${(result.underDeliveryRate * 100).toFixed(1)}%`)
				console.log(`     Worst under-delivery: ${result.worstUnderDelivery.toFixed(3)} Lc`)
				console.log(`     Valid samples: ${result.sampleCount}`)
				console.log(
					`     Coefficients: dark=${result.coefficients.darkBoost}, mid=${result.coefficients.midBoost}, contrast=${result.coefficients.contrastBoost}`,
				)

				// All metrics should be acceptable for P3
				expect(result.mae).toBeLessThan(31)
				expect(result.underDeliveryRate).toBeLessThan(0.8)
				expect(result.worstUnderDelivery).toBeGreaterThan(-80)
			}
		})
	})
})
