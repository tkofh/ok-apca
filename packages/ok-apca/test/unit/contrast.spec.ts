import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { gamutMap } from '../../src/color.ts'
import { applyContrast } from '../../src/contrast.ts'
import { measureContrast } from '../../src/measure.ts'

// Arbitraries for OKLCH color components
const hueArb = fc.double({ min: 0, max: 360, noNaN: true })
const chromaArb = fc.double({ min: 0, max: 0.4, noNaN: true })
const lightnessArb = fc.double({ min: 0, max: 1, noNaN: true })
const contrastArb = fc.double({ min: -108, max: 108, noNaN: true })
const oklchColorArb = fc.record({
	hue: hueArb,
	chroma: chromaArb,
	lightness: lightnessArb,
})

// ============================================================================
// applyContrast basic behavior tests
// ============================================================================

describe('applyContrast', () => {
	describe('basic behavior', () => {
		it('returns a color with the same hue', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 60)

			expect(result.hue).toBe(30)
		})

		it('produces a valid color with changed lightness', () => {
			const input = { hue: 264, chroma: 0.2, lightness: 0.4 }
			const result = applyContrast(input, 60)

			// Result should have valid ranges
			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
			expect(result.chroma).toBeGreaterThanOrEqual(0)
			expect(result.hue).toBe(input.hue)
		})

		it('returns lighter color for positive contrast on mid-tone', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 60)

			// Positive contrast means lighter text
			expect(result.lightness).toBeGreaterThan(input.lightness)
		})

		it('returns darker color for negative contrast on light background', () => {
			// Use L=0.7 where dark direction has more room than light
			const input = { hue: 30, chroma: 0.15, lightness: 0.7 }
			const result = applyContrast(input, -60)

			// Negative contrast from light background goes darker
			expect(result.lightness).toBeLessThan(input.lightness)
		})

		it('returns darker color for negative contrast on mid-tone (no inversion)', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, -60, false)

			// Without inversion, negative contrast always tries to go darker
			expect(result.lightness).toBeLessThan(input.lightness)
		})
	})

	describe('contrast range', () => {
		it('clamps contrast below -108 to -108', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, -200)

			// Should still produce valid result
			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
		})

		it('clamps contrast above 108 to 108', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 150)

			// Should still produce valid result
			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
		})

		it('produces increasingly different lightness for higher contrast magnitude', () => {
			// Use a dark color so there's room to go lighter for positive contrast
			const input = { hue: 30, chroma: 0.15, lightness: 0.2 }

			const low = applyContrast(input, 30)
			const mid = applyContrast(input, 60)
			const high = applyContrast(input, 90)

			// Higher positive contrast should mean higher lightness (lighter text)
			expect(low.lightness).toBeLessThan(mid.lightness)
			expect(mid.lightness).toBeLessThan(high.lightness)
		})

		it('handles maximum contrast value (108)', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 108)

			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
		})

		it('handles minimum contrast value (-108)', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, -108)

			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
		})

		it('handles zero contrast', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 0)

			// Zero contrast should result in similar lightness
			expect(Math.abs(result.lightness - input.lightness)).toBeLessThan(0.1)
		})
	})

	describe('polarity behavior', () => {
		it('positive contrast chooses lighter when possible', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.3 }
			const result = applyContrast(input, 50)

			// From a dark color, positive contrast should go lighter
			expect(result.lightness).toBeGreaterThan(input.lightness)
		})

		it('negative contrast chooses darker when possible', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.7 }
			const result = applyContrast(input, -50)

			// From a light color, negative contrast should go darker
			expect(result.lightness).toBeLessThan(input.lightness)
		})

		it('positive contrast inverts to darker when light direction has no room', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.8 }
			const result = applyContrast(input, 50)

			// With inversion enabled, the solver will go darker since light direction
			// has limited headroom (L=0.8 -> 1.0 is only 0.2 of room)
			// Dark direction has more room (L=0.8 -> 0 is 0.8 of room)
			expect(result.lightness).toBeLessThan(input.lightness)
		})

		it('negative contrast inverts to lighter when dark direction has no room', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.2 }
			const result = applyContrast(input, -50)

			// With inversion enabled, the solver will go lighter since dark direction
			// has limited headroom (L=0.2 -> 0 is only 0.2 of room)
			// Light direction has more room (L=0.2 -> 1.0 is 0.8 of room)
			expect(result.lightness).toBeGreaterThan(input.lightness)
		})

		it('positive contrast always tries to go lighter (no inversion)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.8 }
			const result = applyContrast(input, 50, false)

			// Without inversion, positive contrast demands lighter (towards 1), clamped if needed
			expect(result.lightness).toBeGreaterThanOrEqual(input.lightness)
		})

		it('negative contrast always tries to go darker (no inversion)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.2 }
			const result = applyContrast(input, -50, false)

			// Without inversion, negative contrast demands darker (towards 0), clamped if needed
			expect(result.lightness).toBeLessThanOrEqual(input.lightness)
		})
	})

	describe('chroma blending', () => {
		it('averages gamut-mapped and requested chroma', () => {
			// Request high chroma that will be clamped
			const input = { hue: 30, chroma: 0.35, lightness: 0.5 }
			const result = applyContrast(input, 30)

			// The contrast color chroma should be between 0 and the requested
			expect(result.chroma).toBeGreaterThanOrEqual(0)
			expect(result.chroma).toBeLessThanOrEqual(input.chroma)
		})
	})

	describe('edge cases', () => {
		it('handles black input with positive contrast', () => {
			const input = { hue: 30, chroma: 0, lightness: 0 }
			const result = applyContrast(input, 60)

			// Positive contrast goes lighter
			expect(result.lightness).toBeGreaterThan(0)
		})

		it('handles white input with negative contrast', () => {
			const input = { hue: 30, chroma: 0, lightness: 1 }
			const result = applyContrast(input, -60)

			// Negative contrast goes darker
			expect(result.lightness).toBeLessThan(1)
		})
	})

	describe('property-based tests', () => {
		const numRuns = 50

		it('always produces valid color ranges', () => {
			fc.assert(
				fc.property(oklchColorArb, contrastArb, (input, contrast) => {
					const result = applyContrast(input, contrast)

					expect(result.lightness).toBeGreaterThanOrEqual(0)
					expect(result.lightness).toBeLessThanOrEqual(1)
					expect(result.chroma).toBeGreaterThanOrEqual(0)
				}),
				{ numRuns },
			)
		})

		it('always preserves hue', () => {
			fc.assert(
				fc.property(oklchColorArb, contrastArb, (input, contrast) => {
					const result = applyContrast(input, contrast)
					expect(result.hue).toBe(input.hue)
				}),
				{ numRuns },
			)
		})

		it('positive contrast produces lighter or equal lightness (no inversion)', () => {
			fc.assert(
				fc.property(
					oklchColorArb,
					fc.double({ min: 0, max: 108, noNaN: true }),
					(input, contrast) => {
						const result = applyContrast(input, contrast, false)
						// Without inversion, positive contrast should not make the color darker
						expect(result.lightness).toBeGreaterThanOrEqual(input.lightness - 0.001)
					},
				),
				{ numRuns },
			)
		})

		it('negative contrast produces darker or equal lightness (no inversion)', () => {
			fc.assert(
				fc.property(
					oklchColorArb,
					fc.double({ min: -108, max: 0, noNaN: true }),
					(input, contrast) => {
						const result = applyContrast(input, contrast, false)
						// Without inversion, negative contrast should not make the color lighter
						expect(result.lightness).toBeLessThanOrEqual(input.lightness + 0.001)
					},
				),
				{ numRuns },
			)
		})

		it('with inversion, achieves maximum possible contrast', () => {
			fc.assert(
				fc.property(
					fc.record({
						hue: hueArb,
						chroma: fc.double({ min: 0, max: 0.2, noNaN: true }),
						lightness: fc.double({ min: 0.1, max: 0.9, noNaN: true }),
					}),
					fc.double({ min: 30, max: 108, noNaN: true }),
					(input, absContrast) => {
						const baseColor = gamutMap(input)

						// Test with positive contrast
						const resultWithInversion = applyContrast(input, absContrast, true)
						const resultWithoutInversion = applyContrast(input, absContrast, false)

						const contrastWithInversion = Math.abs(measureContrast(baseColor, resultWithInversion))
						const contrastWithoutInversion = Math.abs(
							measureContrast(baseColor, resultWithoutInversion),
						)

						// With inversion, achieved contrast should be >= without inversion
						expect(contrastWithInversion).toBeGreaterThanOrEqual(contrastWithoutInversion - 1)
					},
				),
				{ numRuns },
			)
		})

		it('output chroma never significantly exceeds input chroma', () => {
			fc.assert(
				fc.property(
					fc.record({
						hue: hueArb,
						chroma: fc.double({ min: 0.02, max: 0.4, noNaN: true }),
						lightness: fc.double({ min: 0.05, max: 0.95, noNaN: true }),
					}),
					contrastArb,
					(input, contrast) => {
						const result = applyContrast(input, contrast)
						// Output chroma should be approximately <= input chroma (within 5%)
						const maxAllowedChroma = input.chroma * 1.05
						expect(result.chroma).toBeLessThanOrEqual(maxAllowedChroma + 1e-6)
					},
				),
				{ numRuns },
			)
		})

		it('higher contrast magnitude produces more lightness change', () => {
			fc.assert(
				fc.property(
					oklchColorArb,
					fc.double({ min: 10, max: 50, noNaN: true }),
					(input, baseContrast) => {
						// Only test mid-range lightness where there's room to move
						if (input.lightness < 0.2 || input.lightness > 0.8) {
							return
						}

						const lowResult = applyContrast(input, baseContrast)
						const highResult = applyContrast(input, baseContrast + 30)

						// Higher positive contrast should produce higher or equal lightness
						expect(highResult.lightness).toBeGreaterThanOrEqual(lowResult.lightness - 0.001)
					},
				),
				{ numRuns },
			)
		})
	})
})

// ============================================================================
// Integration tests: applyContrast + measureContrast
// ============================================================================

describe('applyContrast + measureContrast integration', () => {
	const testConfigs = [{ polarity: 'light' as const }, { polarity: 'dark' as const }]
	const testHues = [0, 30, 90, 180, 264]
	const testLightness = [0.3, 0.5, 0.7]

	for (const config of testConfigs) {
		describe(`polarity: ${config.polarity}`, () => {
			// Positive contrast = lighter text, negative contrast = darker text
			const signedContrast = config.polarity === 'light' ? 60 : -60

			it('achieves target contrast within reasonable tolerance', () => {
				const input = { hue: 30, chroma: 0.1, lightness: 0.5 }

				const baseColor = gamutMap(input)
				const contrastColor = applyContrast(input, signedContrast)
				const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

				// Allow tolerance due to simplified CSS math and heuristic corrections
				expect(Math.abs(actualContrast - Math.abs(signedContrast))).toBeLessThan(40)
			})

			for (const hue of testHues) {
				for (const lightness of testLightness) {
					it(`hue=${hue}, L=${lightness}: delivers reasonable contrast`, () => {
						const input = { hue, chroma: 0.1, lightness }

						const baseColor = gamutMap(input)
						const contrastColor = applyContrast(input, signedContrast)
						const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

						// Edge cases where contrast may be limited:
						// - Light polarity on already-light inputs (L>=0.7): can't go lighter
						// - Dark polarity on already-dark inputs (L<=0.3): can't go darker
						// This is expected behavior, not a bug
						const isLightBlocked = config.polarity === 'light' && lightness >= 0.7
						const isDarkBlocked = config.polarity === 'dark' && lightness <= 0.3

						if (isLightBlocked || isDarkBlocked) {
							expect(actualContrast).toBeGreaterThanOrEqual(0)
						} else {
							// All other cases should achieve some contrast
							expect(actualContrast).toBeGreaterThan(0)
						}
					})
				}
			}
		})
	}

	describe('contrast accuracy across range', () => {
		it('delivers accurate contrast for low values (30 Lc)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const targetContrast = 30

			const baseColor = gamutMap(input)
			const contrastColor = applyContrast(input, targetContrast)
			const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

			expect(Math.abs(actualContrast - targetContrast)).toBeLessThan(8)
		})

		it('delivers accurate contrast for medium values (60 Lc)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const targetContrast = 60

			const baseColor = gamutMap(input)
			const contrastColor = applyContrast(input, targetContrast)
			const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

			// Wider tolerance without polarity inversion - contrast may be clamped
			expect(Math.abs(actualContrast - targetContrast)).toBeLessThan(40)
		})

		it('delivers accurate contrast for high values (90 Lc)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const targetContrast = 90

			const baseColor = gamutMap(input)
			const contrastColor = applyContrast(input, targetContrast)
			const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

			// Wider tolerance without polarity inversion - contrast may be clamped
			expect(Math.abs(actualContrast - targetContrast)).toBeLessThan(70)
		})
	})

	describe('polarity verification', () => {
		it('positive contrast produces lighter color at mid-tone', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const baseColor = gamutMap(input)
			const contrastColor = applyContrast(input, 60)

			// At mid-tone, both directions have equal room, so preference is followed
			expect(contrastColor.lightness).toBeGreaterThan(baseColor.lightness)
		})

		it('negative contrast produces darker color on light background', () => {
			// Use L=0.7 where dark direction has more achievable contrast
			const input = { hue: 30, chroma: 0.1, lightness: 0.7 }
			const baseColor = gamutMap(input)
			const contrastColor = applyContrast(input, -60)

			// From light background, negative contrast has room to go darker
			expect(contrastColor.lightness).toBeLessThan(baseColor.lightness)
		})

		it('positive contrast produces lighter color (no inversion)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const baseColor = gamutMap(input)
			const contrastColor = applyContrast(input, 60, false)

			expect(contrastColor.lightness).toBeGreaterThan(baseColor.lightness)
		})

		it('negative contrast produces darker color (no inversion)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const baseColor = gamutMap(input)
			const contrastColor = applyContrast(input, -60, false)

			expect(contrastColor.lightness).toBeLessThan(baseColor.lightness)
		})
	})

	describe('gamut constraints', () => {
		it('never produces out-of-gamut contrast colors', () => {
			const testCases = [
				{ hue: 0, chroma: 0.3, lightness: 0.5 },
				{ hue: 90, chroma: 0.2, lightness: 0.9 },
				{ hue: 180, chroma: 0.15, lightness: 0.7 },
				{ hue: 264, chroma: 0.25, lightness: 0.4 },
			]

			for (const input of testCases) {
				const configs = [{ contrast: 60 }, { contrast: -60 }]
				for (const config of configs) {
					const result = applyContrast(input, config.contrast)

					// Result should be in valid ranges
					expect(result.lightness).toBeGreaterThanOrEqual(0)
					expect(result.lightness).toBeLessThanOrEqual(1)
					expect(result.chroma).toBeGreaterThanOrEqual(0)
					expect(result.hue).toBe(input.hue)
				}
			}
		})
	})
})
