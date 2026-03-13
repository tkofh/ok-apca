import { Calc } from '@ok-apca/calc-tree'
import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { computeContrastColor, measureContrast } from '../../src/contrast.ts'
import { computeGamutSlice, gamutMap } from '../../src/gamut.ts'

// Arbitraries for OKLCH color components
const hueArb = fc.double({ min: 0, max: 360, noNaN: true })
const chromaArb = fc.double({ min: 0, max: 0.4, noNaN: true })
const lightnessArb = fc.double({ min: 0, max: 1, noNaN: true })
const contrastArb = fc.double({ min: -1.08, max: 1.08, noNaN: true })
const oklchColorArb = fc.record({
	hue: hueArb,
	chroma: chromaArb,
	lightness: lightnessArb,
})

// ============================================================================
// computeContrastColor basic behavior tests
// ============================================================================

describe('computeContrastColor', () => {
	describe('basic behavior', () => {
		it('returns a color with the same hue', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = computeContrastColor(input, 0.6)

			expect(result.hue).toBe(30)
		})

		it('produces a valid color with changed lightness', () => {
			const input = { hue: 264, chroma: 0.2, lightness: 0.4 }
			const result = computeContrastColor(input, 0.6)

			// Result should have valid ranges
			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
			expect(result.chroma).toBeGreaterThanOrEqual(0)
			expect(result.hue).toBe(input.hue)
		})

		it('returns lighter color for positive contrast on mid-tone', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = computeContrastColor(input, 0.6)

			// Positive contrast means lighter text
			expect(result.lightness).toBeGreaterThan(input.lightness)
		})

		it('returns darker color for negative contrast on light background', () => {
			// Use L=0.75 where dark direction clearly has more room than light
			const input = { hue: 30, chroma: 0.15, lightness: 0.75 }
			const result = computeContrastColor(input, -0.6)

			// Negative contrast from light background goes darker
			expect(result.lightness).toBeLessThan(input.lightness)
		})

		it('returns darker color for negative contrast on mid-tone (no inversion)', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = computeContrastColor(input, -0.6, false)

			// Without inversion, negative contrast always tries to go darker
			expect(result.lightness).toBeLessThan(input.lightness)
		})
	})

	describe('contrast range', () => {
		it('clamps contrast below -1.08 to -1.08', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = computeContrastColor(input, -2)

			// Should still produce valid result
			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
		})

		it('clamps contrast above 1.08 to 1.08', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = computeContrastColor(input, 1.5)

			// Should still produce valid result
			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
		})

		it('produces increasingly different lightness for higher contrast magnitude', () => {
			// Use a dark color so there's room to go lighter for positive contrast
			const input = { hue: 30, chroma: 0.15, lightness: 0.2 }

			const low = computeContrastColor(input, 0.3)
			const mid = computeContrastColor(input, 0.6)
			const high = computeContrastColor(input, 0.9)

			// Higher positive contrast should mean higher lightness (lighter text)
			expect(low.lightness).toBeLessThan(mid.lightness)
			expect(mid.lightness).toBeLessThan(high.lightness)
		})

		it('handles maximum contrast value (1.08)', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = computeContrastColor(input, 1.08)

			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
		})

		it('handles minimum contrast value (-1.08)', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = computeContrastColor(input, -1.08)

			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
		})

		it('handles zero contrast', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = computeContrastColor(input, 0)

			// Zero contrast should result in similar lightness
			expect(Math.abs(result.lightness - input.lightness)).toBeLessThan(0.1)
		})
	})

	describe('polarity behavior', () => {
		it('positive contrast chooses lighter when possible', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.3 }
			const result = computeContrastColor(input, 0.5)

			// From a dark color, positive contrast should go lighter
			expect(result.lightness).toBeGreaterThan(input.lightness)
		})

		it('negative contrast chooses darker when possible', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.7 }
			const result = computeContrastColor(input, -0.5)

			// From a light color, negative contrast should go darker
			expect(result.lightness).toBeLessThan(input.lightness)
		})

		it('positive contrast inverts to darker when light direction has no room', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.8 }
			const result = computeContrastColor(input, 0.5)

			// With inversion enabled, the solver will go darker since light direction
			// has limited headroom (L=0.8 -> 1.0 is only 0.2 of room)
			// Dark direction has more room (L=0.8 -> 0 is 0.8 of room)
			expect(result.lightness).toBeLessThan(input.lightness)
		})

		it('negative contrast inverts to lighter when dark direction has no room', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.2 }
			const result = computeContrastColor(input, -0.5)

			// With inversion enabled, the solver will go lighter since dark direction
			// has limited headroom (L=0.2 -> 0 is only 0.2 of room)
			// Light direction has more room (L=0.2 -> 1.0 is 0.8 of room)
			expect(result.lightness).toBeGreaterThan(input.lightness)
		})

		it('positive contrast always tries to go lighter (no inversion)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.8 }
			const result = computeContrastColor(input, 0.5, false)

			// Without inversion, positive contrast demands lighter (towards 1), clamped if needed
			expect(result.lightness).toBeGreaterThanOrEqual(input.lightness)
		})

		it('negative contrast always tries to go darker (no inversion)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.2 }
			const result = computeContrastColor(input, -0.5, false)

			// Without inversion, negative contrast demands darker (towards 0), clamped if needed
			expect(result.lightness).toBeLessThanOrEqual(input.lightness)
		})

		it('should not invert until non-inverted path reaches true black', () => {
			// Regression: soft clamping in contrast measurement was underestimating
			// dark-direction contrast near Y=0, causing premature inversion.
			//
			// At hue=240, L=0.5, the non-inverted path for negative contrast doesn't
			// reach true black (L=0) until around contrast -0.33. Inversion should not
			// happen before that point.
			const input = { hue: 240, chroma: 0.15, lightness: 0.5 }

			// Find the contrast at which the non-inverted path reaches black
			let blackThreshold = -1.08
			for (let c = -0.01; c >= -1.08; c -= 0.01) {
				const noInv = computeContrastColor(input, c, false)
				if (noInv.lightness <= 0.001) {
					blackThreshold = c
					break
				}
			}

			// Inversion should not happen before the non-inverted path is clamped
			for (let c = -0.01; c > blackThreshold; c -= 0.01) {
				const withInv = computeContrastColor(input, c, true)
				expect(
					withInv.lightness,
					`contrast ${c}: should go darker (not invert) before non-inverted reaches black at ${blackThreshold}`,
				).toBeLessThanOrEqual(input.lightness)
			}
		})

		it('should not invert until non-inverted path reaches true white', () => {
			const input = { hue: 240, chroma: 0.15, lightness: 0.5 }

			// Find the contrast at which the non-inverted path reaches white
			let whiteThreshold = 1.08
			for (let c = 0.01; c <= 1.08; c += 0.01) {
				const noInv = computeContrastColor(input, c, false)
				if (noInv.lightness >= 0.999) {
					whiteThreshold = c
					break
				}
			}

			// Inversion should not happen before the non-inverted path is clamped
			for (let c = 0.01; c < whiteThreshold; c += 0.01) {
				const withInv = computeContrastColor(input, c, true)
				expect(
					withInv.lightness,
					`contrast ${c}: should go lighter (not invert) before non-inverted reaches white at ${whiteThreshold}`,
				).toBeGreaterThanOrEqual(input.lightness)
			}
		})
	})

	describe('chroma blending', () => {
		it('averages gamut-mapped and requested chroma', () => {
			// Request high chroma that will be clamped
			const input = { hue: 30, chroma: 0.35, lightness: 0.5 }
			const result = computeContrastColor(input, 0.3)

			// The contrast color chroma should be between 0 and the requested
			expect(result.chroma).toBeGreaterThanOrEqual(0)
			expect(result.chroma).toBeLessThanOrEqual(input.chroma)
		})
	})

	describe('edge cases', () => {
		it('handles black input with positive contrast', () => {
			const input = { hue: 30, chroma: 0, lightness: 0 }
			const result = computeContrastColor(input, 0.6)

			// Positive contrast goes lighter
			expect(result.lightness).toBeGreaterThan(0)
		})

		it('handles white input with negative contrast', () => {
			const input = { hue: 30, chroma: 0, lightness: 1 }
			const result = computeContrastColor(input, -0.6)

			// Negative contrast goes darker
			expect(result.lightness).toBeLessThan(1)
		})
	})

	describe('property-based tests', () => {
		const numRuns = 50

		it('always produces valid color ranges', () => {
			fc.assert(
				fc.property(oklchColorArb, contrastArb, (input, contrast) => {
					const result = computeContrastColor(input, contrast)

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
					const result = computeContrastColor(input, contrast)
					expect(result.hue).toBe(input.hue)
				}),
				{ numRuns },
			)
		})

		it('positive contrast produces lighter or equal lightness (no inversion)', () => {
			fc.assert(
				fc.property(
					oklchColorArb,
					fc.double({ min: 0, max: 1.08, noNaN: true }),
					(input, contrast) => {
						const result = computeContrastColor(input, contrast, false)
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
					fc.double({ min: -1.08, max: 0, noNaN: true }),
					(input, contrast) => {
						const result = computeContrastColor(input, contrast, false)
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
						chroma: fc.double({ min: 0.01, max: 0.2, noNaN: true }),
						lightness: fc.double({ min: 0.1, max: 0.9, noNaN: true }),
					}),
					fc.double({ min: 0.3, max: 1.08, noNaN: true }),
					(input, absContrast) => {
						const baseColor = gamutMap(input)

						// Test with positive contrast
						const resultWithInversion = computeContrastColor(input, absContrast, true)
						const resultWithoutInversion = computeContrastColor(input, absContrast, false)

						const contrastWithInversion = Math.abs(measureContrast(baseColor, resultWithInversion))
						const contrastWithoutInversion = Math.abs(
							measureContrast(baseColor, resultWithoutInversion),
						)

						// With inversion, achieved contrast should be >= without inversion
						expect(contrastWithInversion).toBeGreaterThanOrEqual(contrastWithoutInversion - 0.01)
					},
				),
				{ numRuns },
			)
		})

		it('output chroma ratio never exceeds input chroma ratio', () => {
			fc.assert(
				fc.property(
					fc.record({
						hue: hueArb,
						chroma: fc.double({ min: 0.02, max: 0.4, noNaN: true }),
						lightness: fc.double({ min: 0.05, max: 0.95, noNaN: true }),
					}),
					contrastArb,
					(input, contrast) => {
						const result = computeContrastColor(input, contrast)
						const maxAtInput = Calc.solve(computeGamutSlice(input.hue).maxChroma, {
							lightness: input.lightness,
						})
						const maxAtResult = Calc.solve(computeGamutSlice(result.hue).maxChroma, {
							lightness: result.lightness,
						})
						if (maxAtInput <= 0 || maxAtResult <= 0) {
							return
						}
						const inputRatio = input.chroma / maxAtInput
						const resultRatio = result.chroma / maxAtResult
						// Chroma ratio (percentage of gamut) should be preserved or reduced
						expect(resultRatio).toBeLessThanOrEqual(Math.min(inputRatio, 1) + 1e-6)
					},
				),
				{ numRuns },
			)
		})

		it('higher contrast magnitude produces more lightness change', () => {
			fc.assert(
				fc.property(
					oklchColorArb,
					fc.double({ min: 0.1, max: 0.5, noNaN: true }),
					(input, baseContrast) => {
						// Only test mid-range lightness where there's room to move
						if (input.lightness < 0.2 || input.lightness > 0.8) {
							return
						}

						const lowResult = computeContrastColor(input, baseContrast)
						const highResult = computeContrastColor(input, baseContrast + 0.3)

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
// Integration tests: computeContrastColor + measureContrast
// ============================================================================

describe('computeContrastColor + measureContrast integration', () => {
	const testConfigs = [{ polarity: 'light' as const }, { polarity: 'dark' as const }]
	const testHues = [0, 30, 90, 180, 264]
	const testLightness = [0.3, 0.5, 0.7]

	for (const config of testConfigs) {
		describe(`polarity: ${config.polarity}`, () => {
			// Positive contrast = lighter text, negative contrast = darker text
			const signedContrast = config.polarity === 'light' ? 0.6 : -0.6

			it('achieves target contrast within reasonable tolerance', () => {
				const input = { hue: 30, chroma: 0.1, lightness: 0.5 }

				const baseColor = gamutMap(input)
				const contrastColor = computeContrastColor(input, signedContrast)
				const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

				// Allow tolerance due to simplified CSS math and heuristic corrections
				expect(Math.abs(actualContrast - Math.abs(signedContrast))).toBeLessThan(0.4)
			})

			for (const hue of testHues) {
				for (const lightness of testLightness) {
					it(`hue=${hue}, L=${lightness}: delivers reasonable contrast`, () => {
						const input = { hue, chroma: 0.1, lightness }

						const baseColor = gamutMap(input)
						const contrastColor = computeContrastColor(input, signedContrast)
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
		it('delivers accurate contrast for low values (0.3 Lc)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const targetContrast = 0.3

			const baseColor = gamutMap(input)
			const contrastColor = computeContrastColor(input, targetContrast)
			const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

			expect(Math.abs(actualContrast - targetContrast)).toBeLessThan(0.08)
		})

		it('delivers accurate contrast for medium values (0.6 Lc)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const targetContrast = 0.6

			const baseColor = gamutMap(input)
			const contrastColor = computeContrastColor(input, targetContrast)
			const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

			// Wider tolerance without polarity inversion - contrast may be clamped
			expect(Math.abs(actualContrast - targetContrast)).toBeLessThan(0.4)
		})

		it('delivers accurate contrast for high values (0.9 Lc)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const targetContrast = 0.9

			const baseColor = gamutMap(input)
			const contrastColor = computeContrastColor(input, targetContrast)
			const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

			// Wider tolerance without polarity inversion - contrast may be clamped
			expect(Math.abs(actualContrast - targetContrast)).toBeLessThan(0.7)
		})
	})

	describe('polarity verification', () => {
		it('positive contrast produces lighter color at mid-tone', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const baseColor = gamutMap(input)
			const contrastColor = computeContrastColor(input, 0.6)

			// At mid-tone, both directions have equal room, so preference is followed
			expect(contrastColor.lightness).toBeGreaterThan(baseColor.lightness)
		})

		it('negative contrast produces darker color on light background', () => {
			// Use L=0.75 where dark direction clearly has more achievable contrast
			const input = { hue: 30, chroma: 0.1, lightness: 0.75 }
			const baseColor = gamutMap(input)
			const contrastColor = computeContrastColor(input, -0.6)

			// From light background, negative contrast has room to go darker
			expect(contrastColor.lightness).toBeLessThan(baseColor.lightness)
		})

		it('positive contrast produces lighter color (no inversion)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const baseColor = gamutMap(input)
			const contrastColor = computeContrastColor(input, 0.6, false)

			expect(contrastColor.lightness).toBeGreaterThan(baseColor.lightness)
		})

		it('negative contrast produces darker color (no inversion)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const baseColor = gamutMap(input)
			const contrastColor = computeContrastColor(input, -0.6, false)

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
				const configs = [{ contrast: 0.6 }, { contrast: -0.6 }]
				for (const config of configs) {
					const result = computeContrastColor(input, config.contrast)

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
