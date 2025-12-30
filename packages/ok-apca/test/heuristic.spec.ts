import { describe, expect, it } from 'vitest'
import { clearHeuristicCache, fitHeuristicCoefficients } from '../src/heuristic.ts'
import type { HeuristicFitResult } from '../src/types.ts'

// ============================================================================
// Heuristic Fitting Tests for Display P3
// ============================================================================

describe('fitHeuristicCoefficients', () => {
	// Clear cache before tests to ensure fresh P3 fitting
	clearHeuristicCache()

	describe('P3 gamut fitting quality', () => {
		const testHues = [0, 30, 60, 120, 180, 240, 264, 300]

		it('should produce reasonable MAE for all hues', () => {
			const results: Array<{
				hue: number
				result: HeuristicFitResult
			}> = []

			for (const hue of testHues) {
				const result = fitHeuristicCoefficients(hue)
				results.push({ hue, result })

				// MAE is higher because we prioritize avoiding under-delivery over minimizing MAE
				// The simplified Y=L³ approximation has larger errors with P3's higher chroma
				// Over-delivery is safer for accessibility than under-delivery
				expect(result.mae).toBeLessThan(45)
				expect(result.mae).toBeGreaterThan(0)
			}

			// Summary statistics are computed but not logged during tests
			const maes = results.map((r) => r.result.mae)
			const avgMAE = maes.reduce((a, b) => a + b, 0) / maes.length
			const maxMAE = Math.max(...maes)

			// Verify summary statistics are reasonable
			expect(avgMAE).toBeLessThan(40)
			expect(maxMAE).toBeLessThan(45)
		})

		it('should minimize under-delivery rates', () => {
			const results: Array<{
				hue: number
				result: HeuristicFitResult
			}> = []

			for (const hue of testHues) {
				const result = fitHeuristicCoefficients(hue)
				results.push({ hue, result })

				// Under-delivery rate should be acceptable (< 80% for P3)
				// P3's wider gamut makes heuristic corrections less effective
				expect(result.underDeliveryRate).toBeLessThan(0.8)
			}

			const rates = results.map((r) => r.result.underDeliveryRate)
			const avgRate = rates.reduce((a, b) => a + b, 0) / rates.length
			const maxRate = Math.max(...rates)

			// Verify summary statistics are reasonable
			expect(avgRate).toBeLessThan(0.5)
			expect(maxRate).toBeLessThan(0.8)
		})

		it('should avoid severe under-delivery', () => {
			const results: Array<{
				hue: number
				result: HeuristicFitResult
			}> = []

			for (const hue of testHues) {
				const result = fitHeuristicCoefficients(hue)
				results.push({ hue, result })

				// Worst under-delivery should not be too severe (> -50 Lc with improved scoring)
				expect(result.worstUnderDelivery).toBeGreaterThan(-50)
			}

			const worstValues = results.map((r) => r.result.worstUnderDelivery)
			const avgWorst = worstValues.reduce((a, b) => a + b, 0) / worstValues.length
			const absoluteWorst = Math.min(...worstValues)

			// Verify summary statistics are reasonable
			expect(avgWorst).toBeGreaterThan(-50)
			expect(absoluteWorst).toBeGreaterThan(-50)
		})

		it('should have sufficient valid samples', () => {
			for (const hue of testHues) {
				const result = fitHeuristicCoefficients(hue)

				// Should have at least 1000 valid (non-gamut-limited) samples
				expect(result.sampleCount).toBeGreaterThan(1000)
			}
		})
	})

	describe('coefficient values', () => {
		it('should produce reasonable coefficient ranges', () => {
			const hue = 264
			const result = fitHeuristicCoefficients(hue)

			// Coefficients should be in reasonable ranges (P3 requires more aggressive corrections)
			expect(result.coefficients.darkBoost).toBeGreaterThan(0)
			expect(result.coefficients.darkBoost).toBeLessThan(160)

			expect(result.coefficients.midBoost).toBeGreaterThan(0)
			expect(result.coefficients.midBoost).toBeLessThan(100)

			expect(result.coefficients.contrastBoost).toBeGreaterThan(0)
			expect(result.coefficients.contrastBoost).toBeLessThan(1.0)
		})

		it('should cache results', () => {
			const hue = 30

			const result1 = fitHeuristicCoefficients(hue)
			const result2 = fitHeuristicCoefficients(hue)

			// Should return the same object (cached)
			expect(result1).toBe(result2)
		})
	})

	describe('P3 vs sRGB comparison', () => {
		it('should handle P3 gamut differences', () => {
			// P3 has ~25% more colors than sRGB and higher maximum chroma values
			// The simplified Y=L³ approximation has larger errors with P3's higher chroma
			// Heuristic corrections compensate but with higher average error
			// Over-delivery is preferred over under-delivery for accessibility

			const hue = 264
			const result = fitHeuristicCoefficients(hue)

			// Verify P3 fitting produces acceptable results
			expect(result.mae).toBeLessThan(45)
			expect(result.coefficients.darkBoost).toBeGreaterThan(0)
			expect(result.coefficients.midBoost).toBeGreaterThanOrEqual(0)
		})
	})

	describe('cache clearing', () => {
		it('should clear cache and recompute', () => {
			const hue = 90

			// Fit once
			const result1 = fitHeuristicCoefficients(hue)

			// Clear cache
			clearHeuristicCache()

			// Fit again - should recompute but produce same result
			const result2 = fitHeuristicCoefficients(hue)

			// Results should be equal but not the same object
			expect(result1).not.toBe(result2)
			expect(result1.coefficients).toEqual(result2.coefficients)
			expect(result1.mae).toBeCloseTo(result2.mae, 3)
		})
	})

	describe('key hue validation', () => {
		it('should produce acceptable metrics for key hues', () => {
			const keyHues = [0, 120, 240, 264]

			for (const hue of keyHues) {
				const result = fitHeuristicCoefficients(hue)

				// All metrics should be acceptable for P3
				expect(result.mae).toBeLessThan(45)
				expect(result.underDeliveryRate).toBeLessThan(0.8)
				expect(result.worstUnderDelivery).toBeGreaterThan(-50)
				expect(result.sampleCount).toBeGreaterThan(1000)

				// Coefficients should be reasonable
				expect(result.coefficients.darkBoost).toBeGreaterThan(0)
				expect(result.coefficients.darkBoost).toBeLessThan(160)
				expect(result.coefficients.midBoost).toBeGreaterThan(0)
				expect(result.coefficients.midBoost).toBeLessThan(100)
				expect(result.coefficients.contrastBoost).toBeGreaterThan(0)
				expect(result.coefficients.contrastBoost).toBeLessThan(1.0)
			}
		})
	})
})
