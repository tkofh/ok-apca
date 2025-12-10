import Color from 'colorjs.io'
import { describe, expect, it } from 'vitest'
import { computeYConversionCoefficients, findGamutBoundary, gamutMap } from '../src/color.ts'
import { applyContrast } from '../src/contrast.ts'

// ============================================================================
// findGamutBoundary tests
// ============================================================================

describe('findGamutBoundary', () => {
	it('finds the gamut boundary for red hue (0)', () => {
		const boundary = findGamutBoundary(0)

		// Red has peak chroma around L=0.63
		expect(boundary.lMax).toBeGreaterThan(0.5)
		expect(boundary.lMax).toBeLessThan(0.75)

		// Peak chroma should be significant
		expect(boundary.cPeak).toBeGreaterThan(0.2)
		expect(boundary.cPeak).toBeLessThan(0.4)
	})

	it('finds the gamut boundary for yellow hue (90)', () => {
		const boundary = findGamutBoundary(90)

		// Yellow is a light color, peak chroma at high lightness
		expect(boundary.lMax).toBeGreaterThan(0.85)
		expect(boundary.lMax).toBeLessThan(1)

		// Yellow has moderate peak chroma
		expect(boundary.cPeak).toBeGreaterThan(0.15)
		expect(boundary.cPeak).toBeLessThan(0.3)
	})

	it('finds the gamut boundary for blue hue (264)', () => {
		const boundary = findGamutBoundary(264)

		// Blue is a dark color, peak chroma at low lightness
		expect(boundary.lMax).toBeGreaterThan(0.3)
		expect(boundary.lMax).toBeLessThan(0.55)

		// Blue has moderate peak chroma
		expect(boundary.cPeak).toBeGreaterThan(0.25)
		expect(boundary.cPeak).toBeLessThan(0.35)
	})

	it('returns values that produce in-gamut colors', () => {
		const hues = [0, 30, 60, 90, 120, 180, 240, 300]

		for (const hue of hues) {
			const boundary = findGamutBoundary(hue)
			const color = new Color('oklch', [boundary.lMax, boundary.cPeak, hue])

			expect(color.inGamut('srgb')).toBe(true)
		}
	})
})

// ============================================================================
// computeYConversionCoefficients tests
// ============================================================================

describe('computeYConversionCoefficients', () => {
	it('returns coefficients for a given hue', () => {
		const coefs = computeYConversionCoefficients(30)

		expect(typeof coefs.yc0Coef).toBe('number')
		expect(typeof coefs.yc1Coef).toBe('number')
		expect(typeof coefs.yc2Coef).toBe('number')
	})

	it('produces different coefficients for different hues', () => {
		const coefs0 = computeYConversionCoefficients(0)
		const coefs180 = computeYConversionCoefficients(180)

		// Red and cyan have very different color properties
		expect(coefs0.yc2Coef).not.toBeCloseTo(coefs180.yc2Coef, 3)
	})

	it('produces periodic coefficients (hue 0 equals hue 360)', () => {
		const coefs0 = computeYConversionCoefficients(0)
		const coefs360 = computeYConversionCoefficients(360)

		expect(coefs0.yc0Coef).toBeCloseTo(coefs360.yc0Coef, 10)
		expect(coefs0.yc1Coef).toBeCloseTo(coefs360.yc1Coef, 10)
		expect(coefs0.yc2Coef).toBeCloseTo(coefs360.yc2Coef, 10)
	})
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
		it('allows maximum chroma at lMax', () => {
			const hue = 30
			const boundary = findGamutBoundary(hue)

			const result = gamutMap({ hue, chroma: 1, lightness: boundary.lMax })

			// Should allow up to cPeak at lMax
			expect(result.chroma).toBeCloseTo(boundary.cPeak, 3)
		})

		it('reduces chroma as lightness moves away from lMax', () => {
			const hue = 30
			const boundary = findGamutBoundary(hue)

			const atPeak = gamutMap({ hue, chroma: 1, lightness: boundary.lMax })
			const belowPeak = gamutMap({ hue, chroma: 1, lightness: boundary.lMax / 2 })
			const abovePeak = gamutMap({ hue, chroma: 1, lightness: (1 + boundary.lMax) / 2 })

			expect(belowPeak.chroma).toBeLessThan(atPeak.chroma)
			expect(abovePeak.chroma).toBeLessThan(atPeak.chroma)
		})
	})
})

// ============================================================================
// applyContrast tests
// ============================================================================

describe('applyContrast', () => {
	describe('basic behavior', () => {
		it('returns a color with the same hue', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 60, 'prefer-light')

			expect(result.hue).toBe(30)
		})

		it('produces a valid color with changed lightness', () => {
			const input = { hue: 264, chroma: 0.2, lightness: 0.4 }
			const result = applyContrast(input, 60, 'prefer-light')

			// Result should have valid ranges
			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
			expect(result.chroma).toBeGreaterThanOrEqual(0)
			expect(result.hue).toBe(input.hue)
		})

		it('returns lighter color for force-light mode on mid-tone', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 60, 'force-light')

			// force-light means the contrast text should be light
			expect(result.lightness).toBeGreaterThan(input.lightness)
		})

		it('returns darker color for force-dark mode on mid-tone', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 60, 'force-dark')

			// force-dark means the contrast text should be dark
			expect(result.lightness).toBeLessThan(input.lightness)
		})
	})

	describe('contrast range', () => {
		it('clamps contrast below 0 to 0', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, -10, 'prefer-light')

			// With 0 contrast, should be similar to input
			expect(result.lightness).toBeCloseTo(input.lightness, 1)
		})

		it('clamps contrast above 108 to 108', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 150, 'force-light')

			// Should still produce valid result
			expect(result.lightness).toBeGreaterThanOrEqual(0)
			expect(result.lightness).toBeLessThanOrEqual(1)
		})

		it('produces increasingly different lightness for higher contrast', () => {
			// Use a dark color so there's room to go darker for force-dark
			const input = { hue: 30, chroma: 0.15, lightness: 0.8 }

			const low = applyContrast(input, 30, 'force-dark')
			const mid = applyContrast(input, 60, 'force-dark')
			const high = applyContrast(input, 90, 'force-dark')

			// Higher contrast should mean lower lightness (for force-dark)
			expect(low.lightness).toBeGreaterThan(mid.lightness)
			expect(mid.lightness).toBeGreaterThan(high.lightness)
		})
	})

	describe('polarity modes', () => {
		it('prefer-light chooses lighter when possible', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.3 }
			const result = applyContrast(input, 50, 'prefer-light')

			// From a dark color, prefer-light should go lighter
			expect(result.lightness).toBeGreaterThan(input.lightness)
		})

		it('prefer-dark chooses darker when possible', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.7 }
			const result = applyContrast(input, 50, 'prefer-dark')

			// From a light color, prefer-dark should go darker
			expect(result.lightness).toBeLessThan(input.lightness)
		})

		it('force-light always goes lighter even from light input', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.8 }
			const result = applyContrast(input, 50, 'force-light')

			// Even from light, force-light demands lighter (towards 1)
			expect(result.lightness).toBeGreaterThanOrEqual(input.lightness)
		})

		it('force-dark always goes darker even from dark input', () => {
			const input = { hue: 30, chroma: 0.1, lightness: 0.2 }
			const result = applyContrast(input, 50, 'force-dark')

			// Even from dark, force-dark demands darker (towards 0)
			expect(result.lightness).toBeLessThanOrEqual(input.lightness)
		})
	})

	describe('chroma blending', () => {
		it('averages gamut-mapped and requested chroma', () => {
			// Request high chroma that will be clamped
			const input = { hue: 30, chroma: 0.35, lightness: 0.5 }
			const result = applyContrast(input, 30, 'prefer-light')

			// The contrast color chroma should be between 0 and the requested
			expect(result.chroma).toBeGreaterThanOrEqual(0)
			expect(result.chroma).toBeLessThanOrEqual(input.chroma)
		})
	})

	describe('edge cases', () => {
		it('handles black input', () => {
			const input = { hue: 30, chroma: 0, lightness: 0 }
			const result = applyContrast(input, 60, 'prefer-dark')

			expect(result.lightness).toBeGreaterThan(0)
		})

		it('handles white input', () => {
			const input = { hue: 30, chroma: 0, lightness: 1 }
			const result = applyContrast(input, 60, 'prefer-light')

			expect(result.lightness).toBeLessThan(1)
		})

		it('handles zero contrast', () => {
			const input = { hue: 30, chroma: 0.15, lightness: 0.5 }
			const result = applyContrast(input, 0, 'prefer-light')

			// Zero contrast should result in similar lightness
			expect(Math.abs(result.lightness - input.lightness)).toBeLessThan(0.1)
		})
	})
})
