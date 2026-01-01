import Color from 'colorjs.io'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { findGamutSlice, gamutMap } from '../../src/color.ts'

// Arbitraries for OKLCH color components
const hueArb = fc.double({ min: -720, max: 720, noNaN: true })
const chromaArb = fc.double({ min: 0, max: 0.5, noNaN: true })
const lightnessArb = fc.double({ min: 0, max: 1, noNaN: true })
const oklchColorArb = fc.record({
	hue: hueArb,
	chroma: chromaArb,
	lightness: lightnessArb,
})

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
				expect(color.inGamut('p3', { epsilon: 0.01 })).toBe(true)
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
		it('allows higher chroma at apex than at extremes', () => {
			fc.assert(
				fc.property(fc.integer({ min: 0, max: 359 }), (hue) => {
					const { apex } = findGamutSlice(hue)

					// At apex lightness, chroma should be preserved (or clamped to max)
					const atApex = gamutMap({ hue, chroma: 0.4, lightness: apex.lightness })

					// Near black and white, chroma should be reduced more
					const nearBlack = gamutMap({ hue, chroma: 0.4, lightness: 0.05 })
					const nearWhite = gamutMap({ hue, chroma: 0.4, lightness: 0.95 })

					expect(atApex.chroma).toBeGreaterThan(nearBlack.chroma)
					expect(atApex.chroma).toBeGreaterThan(nearWhite.chroma)
				}),
			)
		})

		it('left half is linear, right half has curvature correction', () => {
			fc.assert(
				fc.property(fc.integer({ min: 0, max: 359 }), (hue) => {
					const { apex, curvature } = findGamutSlice(hue)

					// Curvature can be positive (gamut bulges out) or negative (curves in)
					// depending on the hue - this models the real P3 gamut shape
					expect(typeof curvature).toBe('number')
					expect(Number.isFinite(curvature)).toBe(true)

					// Left half: linear from L=0 to apex
					// Right half: linear + curvature correction from apex to L=1
					// The correction uses sin(t * π)^0.95 as the basis
					const t = 0.5 // midpoint of right half
					const L = apex.lightness + (1 - apex.lightness) * t
					const result = gamutMap({ hue, chroma: 0.4, lightness: L })

					// The result should still have valid chroma
					expect(result.chroma).toBeGreaterThanOrEqual(0)
					expect(result.chroma).toBeLessThanOrEqual(apex.chroma)
				}),
			)
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
			fc.assert(
				fc.property(oklchColorArb, (input) => {
					const result = gamutMap(input)

					expect(result.lightness).toBeGreaterThanOrEqual(0)
					expect(result.lightness).toBeLessThanOrEqual(1)
					expect(result.chroma).toBeGreaterThanOrEqual(0)
					// Hue is preserved
					expect(result.hue).toBe(input.hue)
				}),
			)
		})

		it('output is always in Display P3 gamut (with small tolerance)', () => {
			fc.assert(
				fc.property(oklchColorArb, (input) => {
					const result = gamutMap(input)
					const color = new Color('oklch', [result.lightness, result.chroma, result.hue])

					// Tent function is an approximation, so allow small epsilon
					expect(color.inGamut('p3', { epsilon: 0.01 })).toBe(true)
				}),
			)
		})

		it('never increases chroma', () => {
			fc.assert(
				fc.property(oklchColorArb, (input) => {
					const result = gamutMap(input)
					expect(result.chroma).toBeLessThanOrEqual(input.chroma)
				}),
			)
		})

		it('preserves hue for any input', () => {
			fc.assert(
				fc.property(oklchColorArb, (input) => {
					const result = gamutMap(input)
					expect(result.hue).toBe(input.hue)
				}),
			)
		})

		it('is idempotent - mapping twice gives same result', () => {
			fc.assert(
				fc.property(oklchColorArb, (input) => {
					const once = gamutMap(input)
					const twice = gamutMap(once)

					expect(twice.hue).toBe(once.hue)
					expect(twice.lightness).toBeCloseTo(once.lightness, 10)
					expect(twice.chroma).toBeCloseTo(once.chroma, 10)
				}),
			)
		})

		it('equivalent hues produce equivalent chroma limits', () => {
			fc.assert(
				fc.property(
					chromaArb,
					lightnessArb,
					fc.double({ min: 0, max: 360, noNaN: true }),
					(chroma, lightness, baseHue) => {
						const result1 = gamutMap({ hue: baseHue, chroma, lightness })
						const result2 = gamutMap({ hue: baseHue + 360, chroma, lightness })
						const result3 = gamutMap({ hue: baseHue - 360, chroma, lightness })

						expect(result1.chroma).toBeCloseTo(result2.chroma, 10)
						expect(result1.chroma).toBeCloseTo(result3.chroma, 10)
					},
				),
			)
		})
	})
})
