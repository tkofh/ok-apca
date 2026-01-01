import * as fc from 'fast-check'
import { describe, expect, it } from 'vitest'
import { measureContrast } from '../../src/measure.ts'

// Arbitraries for OKLCH color components
const hueArb = fc.double({ min: 0, max: 360, noNaN: true })
const chromaArb = fc.double({ min: 0, max: 0.3, noNaN: true })
const oklchColorArb = fc.record({
	hue: hueArb,
	chroma: chromaArb,
	lightness: fc.double({ min: 0, max: 1, noNaN: true }),
})

describe('measureContrast', () => {
	it('produces documented APCA values for black/white', () => {
		const white = { hue: 0, chroma: 0, lightness: 1 }
		const black = { hue: 0, chroma: 0, lightness: 0 }
		// APCA reference values: black on white = 106.04, white on black = -107.88
		expect(measureContrast(white, black)).toBeCloseTo(106.04, 1)
		expect(measureContrast(black, white)).toBeCloseTo(-107.88, 1)
	})

	it('identical colors produce zero contrast', () => {
		fc.assert(
			fc.property(oklchColorArb, (color) => {
				expect(measureContrast(color, color)).toBe(0)
			}),
		)
	})

	it('swapping background and foreground inverts the sign', () => {
		fc.assert(
			fc.property(oklchColorArb, oklchColorArb, (color1, color2) => {
				const LC1 = measureContrast(color1, color2)
				const LC2 = measureContrast(color2, color1)
				if (LC1 !== 0 && LC2 !== 0) {
					expect(Math.sign(LC1)).toBe(-Math.sign(LC2))
				}
			}),
		)
	})

	it('contrast is bounded to -108..106', () => {
		fc.assert(
			fc.property(oklchColorArb, oklchColorArb, (color1, color2) => {
				const LC = measureContrast(color1, color2)
				expect(LC).toBeGreaterThanOrEqual(-108)
				expect(LC).toBeLessThanOrEqual(106.1)
			}),
		)
	})

	it('lighter foreground on darker background produces negative contrast', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0, max: 0.4, noNaN: true }),
				fc.double({ min: 0.6, max: 1, noNaN: true }),
				hueArb,
				chromaArb,
				(darkL, lightL, hue, chroma) => {
					const LC = measureContrast(
						{ hue, chroma, lightness: darkL },
						{ hue, chroma, lightness: lightL },
					)
					expect(LC).toBeLessThanOrEqual(0)
				},
			),
		)
	})

	it('darker foreground on lighter background produces positive contrast', () => {
		fc.assert(
			fc.property(
				fc.double({ min: 0.6, max: 1, noNaN: true }),
				fc.double({ min: 0, max: 0.4, noNaN: true }),
				hueArb,
				chromaArb,
				(lightL, darkL, hue, chroma) => {
					const LC = measureContrast(
						{ hue, chroma, lightness: lightL },
						{ hue, chroma, lightness: darkL },
					)
					expect(LC).toBeGreaterThanOrEqual(0)
				},
			),
		)
	})
})
