import { describe, expect, it } from 'vitest'
import { clearHeuristicCache, fitHeuristicCoefficients } from '../src/heuristic.ts'

// ============================================================================
// Heuristic Coefficient Tests
//
// The heuristic system now returns zero coefficients because testing showed:
// 1. The CSS APCA solver is accurate without heuristic correction
// 2. The previous boost coefficients caused severe over-delivery (+25-30 Lc)
// 3. Under-delivery in negative contrast is mostly a gamut limitation (can't go darker than black)
// ============================================================================

describe('fitHeuristicCoefficients', () => {
	clearHeuristicCache()

	describe('zero coefficient behavior', () => {
		const testHues = [0, 30, 60, 120, 180, 240, 264, 300]

		it('should return zero coefficients for all hues', () => {
			for (const hue of testHues) {
				const result = fitHeuristicCoefficients(hue)

				expect(result.coefficients.darkBoost).toBe(0)
				expect(result.coefficients.midBoost).toBe(0)
				expect(result.coefficients.contrastBoost).toBe(0)
			}
		})

		it('should return zero metrics', () => {
			for (const hue of testHues) {
				const result = fitHeuristicCoefficients(hue)

				expect(result.mae).toBe(0)
				expect(result.worstUnderDelivery).toBe(0)
				expect(result.underDeliveryRate).toBe(0)
				expect(result.sampleCount).toBe(0)
			}
		})
	})

	describe('caching', () => {
		it('should cache results', () => {
			const hue = 30

			const result1 = fitHeuristicCoefficients(hue)
			const result2 = fitHeuristicCoefficients(hue)

			// Should return the same object (cached)
			expect(result1).toBe(result2)
		})

		it('should clear cache and return consistent results', () => {
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
			expect(result1.mae).toBe(result2.mae)
		})
	})
})
