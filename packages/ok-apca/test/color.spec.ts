import Color from 'colorjs.io'
import { describe, expect, it } from 'vitest'
import { gamutMap } from '../src/color.ts'

// ============================================================================
// gamutMap tests
// ============================================================================

describe('gamutMap', () => {
	describe('basic behavior', () => {
		it('returns the same color if already in gamut', () => {
			const color = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const result = gamutMap(color)

			expect(result.hue).toBe(30)
			expect(result.lightness).toBe(0.5)
			expect(result.chroma).toBeCloseTo(0.1, 4)
		})

		it('clamps chroma for out-of-gamut colors', () => {
			const color = { hue: 264, chroma: 0.4, lightness: 0.3 }
			const result = gamutMap(color)

			expect(result.hue).toBe(264)
			expect(result.lightness).toBe(0.3)
			expect(result.chroma).toBeLessThan(0.4)
			expect(result.chroma).toBeGreaterThan(0)
		})

		it('reduces chroma for out-of-gamut colors', () => {
			const testCases = [
				{ hue: 0, chroma: 0.3, lightness: 0.5 },
				{ hue: 90, chroma: 0.25, lightness: 0.9 },
				{ hue: 180, chroma: 0.2, lightness: 0.7 },
				{ hue: 264, chroma: 0.35, lightness: 0.4 },
			]

			for (const input of testCases) {
				const result = gamutMap(input)
				// Chroma should be reduced or unchanged
				expect(result.chroma).toBeLessThanOrEqual(input.chroma)
				// Result should be close to in-gamut (tent function is an approximation)
				const color = new Color('oklch', [result.lightness, result.chroma, result.hue])
				// Allow slight overshoot - tent function is a linear approximation
				expect(color.inGamut('srgb', { epsilon: 0.01 })).toBe(true)
			}
		})
	})

	describe('edge cases', () => {
		it('returns zero chroma for lightness 0', () => {
			const result = gamutMap({ hue: 30, chroma: 0.2, lightness: 0 })
			expect(result.chroma).toBe(0)
			expect(result.lightness).toBe(0)
		})

		it('returns zero chroma for lightness 1', () => {
			const result = gamutMap({ hue: 30, chroma: 0.2, lightness: 1 })
			expect(result.chroma).toBe(0)
			expect(result.lightness).toBe(1)
		})

		it('clamps negative lightness to 0', () => {
			const result = gamutMap({ hue: 30, chroma: 0.2, lightness: -0.5 })
			expect(result.lightness).toBe(0)
			expect(result.chroma).toBe(0)
		})

		it('clamps lightness > 1 to 1', () => {
			const result = gamutMap({ hue: 30, chroma: 0.2, lightness: 1.5 })
			expect(result.lightness).toBe(1)
			expect(result.chroma).toBe(0)
		})

		it('handles zero chroma input', () => {
			const result = gamutMap({ hue: 30, chroma: 0, lightness: 0.5 })
			expect(result.chroma).toBe(0)
		})

		it('handles negative chroma input by clamping to 0', () => {
			const result = gamutMap({ hue: 30, chroma: -0.1, lightness: 0.5 })
			expect(result.chroma).toBe(0)
		})
	})

	describe('tent function behavior', () => {
		it('allows higher chroma at mid-lightness than at extremes', () => {
			const hue = 30

			// Mid-lightness should allow more chroma
			const mid = gamutMap({ hue, chroma: 0.3, lightness: 0.5 })

			// Extremes should reduce chroma more
			const nearBlack = gamutMap({ hue, chroma: 0.3, lightness: 0.05 })
			const nearWhite = gamutMap({ hue, chroma: 0.3, lightness: 0.95 })

			expect(mid.chroma).toBeGreaterThan(nearBlack.chroma)
			expect(mid.chroma).toBeGreaterThan(nearWhite.chroma)
		})

		it('produces symmetric reduction away from peak', () => {
			const hue = 30

			// Request high chroma at symmetric points
			const lower = gamutMap({ hue, chroma: 0.3, lightness: 0.4 })
			const upper = gamutMap({ hue, chroma: 0.3, lightness: 0.6 })

			// Both should have chroma reduced, roughly symmetrically
			expect(lower.chroma).toBeLessThan(0.3)
			expect(upper.chroma).toBeLessThan(0.3)
			// Allow some asymmetry due to tent function peak position
			expect(Math.abs(lower.chroma - upper.chroma)).toBeLessThan(0.1)
		})
	})

	describe('hue normalization', () => {
		it('handles hue values greater than 360', () => {
			const normal = gamutMap({ hue: 30, chroma: 0.15, lightness: 0.5 })
			const wrapped = gamutMap({ hue: 390, chroma: 0.15, lightness: 0.5 })

			// Should produce identical results (30 = 390 - 360)
			expect(wrapped.hue).toBe(390) // Hue is preserved as-is
			expect(wrapped.chroma).toBeCloseTo(normal.chroma, 3)
			expect(wrapped.lightness).toBe(normal.lightness)
		})

		it('handles negative hue values', () => {
			const normal = gamutMap({ hue: 330, chroma: 0.15, lightness: 0.5 })
			const negative = gamutMap({ hue: -30, chroma: 0.15, lightness: 0.5 })

			// Should produce identical results (330 = -30 + 360)
			expect(negative.hue).toBe(-30) // Hue is preserved as-is
			expect(negative.chroma).toBeCloseTo(normal.chroma, 3)
			expect(negative.lightness).toBe(normal.lightness)
		})
	})

	describe('property-based tests', () => {
		it('always produces colors in valid ranges', () => {
			const testCases = [
				{ hue: 0, chroma: 0.5, lightness: 0.5 },
				{ hue: 90, chroma: 0.3, lightness: 0.9 },
				{ hue: 180, chroma: 0.4, lightness: 0.3 },
				{ hue: 270, chroma: 0.35, lightness: 0.7 },
				{ hue: -30, chroma: 0.2, lightness: 0.1 },
				{ hue: 400, chroma: 0.25, lightness: 0.95 },
			]

			for (const input of testCases) {
				const result = gamutMap(input)

				expect(result.lightness).toBeGreaterThanOrEqual(0)
				expect(result.lightness).toBeLessThanOrEqual(1)
				expect(result.chroma).toBeGreaterThanOrEqual(0)
				// Hue is preserved
				expect(result.hue).toBe(input.hue)
			}
		})

		it('output is always in sRGB gamut (with small tolerance)', () => {
			const testCases = [
				{ hue: 0, chroma: 0.5, lightness: 0.5 },
				{ hue: 30, chroma: 0.4, lightness: 0.6 },
				{ hue: 90, chroma: 0.3, lightness: 0.9 },
				{ hue: 180, chroma: 0.35, lightness: 0.3 },
				{ hue: 264, chroma: 0.4, lightness: 0.4 },
			]

			for (const input of testCases) {
				const result = gamutMap(input)
				const color = new Color('oklch', [result.lightness, result.chroma, result.hue])

				// Tent function is an approximation, so allow small epsilon
				expect(color.inGamut('srgb', { epsilon: 0.01 })).toBe(true)
			}
		})

		it('never increases chroma', () => {
			const testCases = [
				{ hue: 0, chroma: 0.1, lightness: 0.5 },
				{ hue: 30, chroma: 0.4, lightness: 0.6 },
				{ hue: 264, chroma: 0.35, lightness: 0.4 },
			]

			for (const input of testCases) {
				const result = gamutMap(input)
				expect(result.chroma).toBeLessThanOrEqual(input.chroma)
			}
		})
	})
})
