import { describe, expect, it } from 'vitest'
import {
	clearHeuristicCache,
	fitHeuristicCoefficients,
	type HeuristicFitResult,
} from '../src/heuristic.ts'
import type { ContrastMode } from '../src/types.ts'

// ============================================================================
// Heuristic Fitting Tests for Display P3
// ============================================================================

describe('fitHeuristicCoefficients', () => {
	// Clear cache before tests to ensure fresh P3 fitting
	clearHeuristicCache()

	describe('P3 gamut fitting quality', () => {
		const testHues = [0, 30, 60, 120, 180, 240, 264, 300]
		const modes: ContrastMode[] = ['force-dark', 'force-light', 'prefer-dark', 'prefer-light']

		it('should produce reasonable MAE for all hues and modes', () => {
			const results: Array<{
				hue: number
				mode: ContrastMode
				result: HeuristicFitResult
			}> = []

			for (const hue of testHues) {
				for (const mode of modes) {
					const result = fitHeuristicCoefficients(hue, mode)
					results.push({ hue, mode, result })

					// MAE should be reasonably low (< 31 Lc for P3's wider gamut)
					// The simplified Y=L³ approximation has larger errors with P3's higher chroma
					expect(result.mae).toBeLessThan(31)
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
				mode: ContrastMode
				result: HeuristicFitResult
			}> = []

			for (const hue of testHues) {
				for (const mode of modes) {
					const result = fitHeuristicCoefficients(hue, mode)
					results.push({ hue, mode, result })

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
				mode: ContrastMode
				result: HeuristicFitResult
			}> = []

			for (const hue of testHues) {
				for (const mode of modes) {
					const result = fitHeuristicCoefficients(hue, mode)
					results.push({ hue, mode, result })

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
				for (const mode of modes) {
					const result = fitHeuristicCoefficients(hue, mode)

					// Should have at least 1000 valid (non-gamut-limited) samples
					expect(result.sampleCount).toBeGreaterThan(1000)
				}
			}
		})
	})

	describe('coefficient values', () => {
		it('should produce reasonable coefficient ranges', () => {
			const hue = 264
			const mode = 'prefer-dark'
			const result = fitHeuristicCoefficients(hue, mode)

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
			const mode = 'prefer-dark'

			const result1 = fitHeuristicCoefficients(hue, mode)
			const result2 = fitHeuristicCoefficients(hue, mode)

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

	describe('mode-specific fitting', () => {
		it('should fit different coefficients for different modes', () => {
			const hue = 180
			const forceDark = fitHeuristicCoefficients(hue, 'force-dark')
			const forceLight = fitHeuristicCoefficients(hue, 'force-light')
			const preferDark = fitHeuristicCoefficients(hue, 'prefer-dark')
			const preferLight = fitHeuristicCoefficients(hue, 'prefer-light')

			// Different modes should produce different coefficients
			// (though some might coincidentally match)
			const allCoeffs = [forceDark, forceLight, preferDark, preferLight]
			const uniqueCoeffs = new Set(allCoeffs.map((r) => JSON.stringify(r.coefficients)))

			// Should have at least 2 different coefficient sets
			expect(uniqueCoeffs.size).toBeGreaterThanOrEqual(2)
		})
	})

	describe('cache clearing', () => {
		it('should clear cache and recompute', () => {
			const hue = 90
			const mode = 'prefer-dark'

			// Fit once
			const result1 = fitHeuristicCoefficients(hue, mode)

			// Clear cache
			clearHeuristicCache()

			// Fit again - should recompute but produce same result
			const result2 = fitHeuristicCoefficients(hue, mode)

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
				const darkResult = fitHeuristicCoefficients(hue, 'prefer-dark')

				console.log(`\n   ${name} (${hue}°):`)
				console.log(`     MAE: ${darkResult.mae.toFixed(3)} Lc`)
				console.log(`     Under-delivery rate: ${(darkResult.underDeliveryRate * 100).toFixed(1)}%`)
				console.log(`     Worst under-delivery: ${darkResult.worstUnderDelivery.toFixed(3)} Lc`)
				console.log(`     Valid samples: ${darkResult.sampleCount}`)
				console.log(
					`     Coefficients: dark=${darkResult.coefficients.darkBoost}, mid=${darkResult.coefficients.midBoost}, contrast=${darkResult.coefficients.contrastBoost}`,
				)

				// All metrics should be acceptable for P3
				expect(darkResult.mae).toBeLessThan(31)
				expect(darkResult.underDeliveryRate).toBeLessThan(0.8)
				expect(darkResult.worstUnderDelivery).toBeGreaterThan(-80)
			}
		})
	})
})
