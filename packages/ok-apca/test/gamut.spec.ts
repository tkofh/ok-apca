import Color from 'colorjs.io'
import { describe, expect, it } from 'vitest'
import { computeYConversionCoefficients, findGamutBoundary } from '../src/index.ts'

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
