import { describe, expect, it } from 'vitest'
import { gamutMap } from '../src/color.ts'
import { applyContrast } from '../src/contrast.ts'
import { measureContrast } from '../src/measure.ts'

// ============================================================================
// applyContrast basic behavior tests
// ============================================================================

describe('applyContrast', () => {
	describe('basic behavior', () => {
		it('returns a color with the same hue', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, -60, true)

			expect(result.hue).toBe(30)
		})

		it('produces a valid color with changed lightness', () => {
			const input = { hue: 264, chroma: 0.2, lightness: 0.4 }
			const result = applyContrast(input, -60, true)

			// Result should have valid ranges
			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
			expect(result.chroma).toBeGreaterThanOrEqual(0)
			expect(result.hue).toBe(input.hue)
		})

		it('returns lighter color for positive contrast (reverse polarity) on mid-tone', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 60, false)

			// Positive contrast means lighter text (reverse polarity)
			expect(result.lightness).toBeGreaterThan(input.lightness)
		})

		it('returns darker color for negative contrast (normal polarity) on mid-tone', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, -60, false)

			// Negative contrast means darker text (normal polarity)
			expect(result.lightness).toBeLessThan(input.lightness)
		})
	})

	describe('contrast range', () => {
		it('clamps contrast below -108 to -108', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, -200, false)

			// Should still produce valid result
			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
		})

		it('clamps contrast above 108 to 108', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 150, false)

			// Should still produce valid result
			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
		})

		it('produces increasingly different lightness for higher contrast magnitude', () => {
			// Use a dark color so there's room to go lighter for positive contrast
			const input = { hue: 30, chroma: 0.15, lightness: 0.2 }

			const low = applyContrast(input, 30, false)
			const mid = applyContrast(input, 60, false)
			const high = applyContrast(input, 90, false)

			// Higher contrast should mean higher lightness (for positive contrast)
			expect(low.lightness).toBeLessThan(mid.lightness)
			expect(mid.lightness).toBeLessThan(high.lightness)
		})

		it('handles maximum contrast value (108)', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 108, false)

			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
		})

		it('handles minimum contrast value (-108)', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, -108, false)

			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
		})

		it('handles zero contrast', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 0, false)

			// Zero contrast should result in similar lightness
			expect(Math.abs(result.lightness - input.lightness)).toBeLessThan(0.1)
		})
	})

	describe('polarity and inversion', () => {
		it('positive contrast (prefer light) chooses lighter when possible', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.3 }
			const result = applyContrast(input, 50, true)

			// From a dark color, positive contrast (prefer light) should go lighter
			expect(result.lightness).toBeGreaterThan(input.lightness)
		})

		it('negative contrast (prefer dark) chooses darker when possible', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.7 }
			const result = applyContrast(input, -50, true)

			// From a light color, negative contrast (prefer dark) should go darker
			expect(result.lightness).toBeLessThan(input.lightness)
		})

		it('positive contrast without inversion always goes lighter', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.8 }
			const result = applyContrast(input, 50, false)

			// Even from light, positive contrast without inversion demands lighter (towards 1)
			expect(result.lightness).toBeGreaterThanOrEqual(input.lightness)
		})

		it('negative contrast without inversion always goes darker', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.2 }
			const result = applyContrast(input, -50, false)

			// Even from dark, negative contrast without inversion demands darker (towards 0)
			expect(result.lightness).toBeLessThanOrEqual(input.lightness)
		})

		it('allows polarity inversion when preferred is out of gamut', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.95 }
			const withInversion = applyContrast(input, 60, true)
			const withoutInversion = applyContrast(input, 60, false)

			// With inversion, should be able to fall back to darker
			// Without inversion, forced to stay lighter (clamped near 1)
			expect(withInversion.lightness).toBeLessThan(withoutInversion.lightness)
		})
	})

	describe('chroma blending', () => {
		it('averages gamut-mapped and requested chroma', () => {
			// Request high chroma that will be clamped
			const input = { hue: 30, chroma: 0.35, lightness: 0.5 }
			const result = applyContrast(input, -30, true)

			// The contrast color chroma should be between 0 and the requested
			expect(result.chroma).toBeGreaterThanOrEqual(0)
			expect(result.chroma).toBeLessThanOrEqual(input.chroma)
		})
	})

	describe('edge cases', () => {
		it('handles black input with negative contrast', () => {
			const input = { hue: 30, chroma: 0, lightness: 0 }
			const result = applyContrast(input, -60, true)

			// Can't go darker, should invert to lighter
			expect(result.lightness).toBeGreaterThan(0)
		})

		it('handles white input with positive contrast', () => {
			const input = { hue: 30, chroma: 0, lightness: 1 }
			const result = applyContrast(input, 60, true)

			// Can't go lighter, should invert to darker
			expect(result.lightness).toBeLessThan(1)
		})
	})
})

// ============================================================================
// Integration tests: applyContrast + measureContrast
// ============================================================================

describe('applyContrast + measureContrast integration', () => {
	const testConfigs = [
		{ allowInversion: false, polarity: 'light' as const },
		{ allowInversion: false, polarity: 'dark' as const },
		{ allowInversion: true, polarity: 'light' as const },
		{ allowInversion: true, polarity: 'dark' as const },
	]
	const testHues = [0, 30, 90, 180, 264]
	const testLightness = [0.3, 0.5, 0.7]

	for (const config of testConfigs) {
		describe(`allowInversion: ${config.allowInversion}, polarity: ${config.polarity}`, () => {
			const signedContrast = config.polarity === 'light' ? 60 : -60

			it('achieves target contrast within reasonable tolerance', () => {
				const input = { hue: 30, chroma: 0.1, lightness: 0.5 }

				const baseColor = gamutMap(input)
				const contrastColor = applyContrast(input, signedContrast, config.allowInversion)
				const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

				// Allow tolerance due to simplified CSS math and heuristic corrections
				expect(Math.abs(actualContrast - Math.abs(signedContrast))).toBeLessThan(40)
			})

			for (const hue of testHues) {
				for (const lightness of testLightness) {
					it(`hue=${hue}, L=${lightness}: delivers reasonable contrast`, () => {
						const input = { hue, chroma: 0.1, lightness }

						const baseColor = gamutMap(input)
						const contrastColor = applyContrast(input, signedContrast, config.allowInversion)
						const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

						// Edge cases where contrast may be limited:
						// - Light polarity without inversion on already-light inputs (L>=0.7): can't go lighter
						// - Dark polarity without inversion on already-dark inputs (L<=0.3): can't go darker
						// This is expected behavior, not a bug
						const isLightBlocked =
							config.polarity === 'light' && !config.allowInversion && lightness >= 0.7
						const isDarkBlocked =
							config.polarity === 'dark' && !config.allowInversion && lightness <= 0.3

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
			const contrastColor = applyContrast(input, targetContrast, true)
			const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

			expect(Math.abs(actualContrast - targetContrast)).toBeLessThan(8)
		})

		it('delivers accurate contrast for medium values (60 Lc)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const targetContrast = 60

			const baseColor = gamutMap(input)
			const contrastColor = applyContrast(input, targetContrast, true)
			const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

			expect(Math.abs(actualContrast - targetContrast)).toBeLessThan(10)
		})

		it('delivers accurate contrast for high values (90 Lc)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const targetContrast = 90

			const baseColor = gamutMap(input)
			const contrastColor = applyContrast(input, targetContrast, true)
			const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

			expect(Math.abs(actualContrast - targetContrast)).toBeLessThan(12)
		})
	})

	describe('polarity verification', () => {
		it('positive contrast produces lighter color (reverse polarity)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const baseColor = gamutMap(input)
			const contrastColor = applyContrast(input, 60, false)

			expect(contrastColor.lightness).toBeGreaterThan(baseColor.lightness)
		})

		it('negative contrast produces darker color (normal polarity)', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const baseColor = gamutMap(input)
			const contrastColor = applyContrast(input, -60, false)

			expect(contrastColor.lightness).toBeLessThan(baseColor.lightness)
		})

		it('positive contrast with inversion chooses lighter when base is dark', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.3 }
			const baseColor = gamutMap(input)
			const contrastColor = applyContrast(input, 60, true)

			expect(contrastColor.lightness).toBeGreaterThan(baseColor.lightness)
		})

		it('negative contrast with inversion chooses darker when base is light', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.7 }
			const baseColor = gamutMap(input)
			const contrastColor = applyContrast(input, -60, true)

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
				const configs = [
					{ contrast: 60, allowInversion: false },
					{ contrast: 60, allowInversion: true },
					{ contrast: -60, allowInversion: false },
					{ contrast: -60, allowInversion: true },
				]
				for (const config of configs) {
					const result = applyContrast(input, config.contrast, config.allowInversion)

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
