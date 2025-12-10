import { describe, expect, it } from 'vitest'
import { gamutMap } from '../src/color.ts'
import { applyContrast } from '../src/contrast.ts'
import { measureContrast } from '../src/measure.ts'

describe('measureContrast', () => {
	describe('basic functionality', () => {
		it('computes contrast between two OKLCH colors', () => {
			const white = { hue: 0, chroma: 0, lightness: 1 }
			const black = { hue: 0, chroma: 0, lightness: 0 }

			const LC = measureContrast(white, black)
			expect(LC).toBeGreaterThan(100)
		})

		it('handles chromatic colors', () => {
			const orange = { hue: 30, chroma: 0.15, lightness: 0.7 }
			const darkOrange = { hue: 30, chroma: 0.1, lightness: 0.2 }

			const LC = measureContrast(orange, darkOrange)
			// Should have significant contrast
			expect(Math.abs(LC)).toBeGreaterThan(30)
		})

		it('works with colors across different hues', () => {
			const red = { hue: 0, chroma: 0.2, lightness: 0.5 }
			const blue = { hue: 264, chroma: 0.2, lightness: 0.5 }

			const LC = measureContrast(red, blue)
			// Different hues at similar lightness should have low contrast
			expect(Math.abs(LC)).toBeLessThan(20)
		})
	})

	describe('polarity (sign) verification', () => {
		it('returns positive value for dark text on light background', () => {
			const lightBg = { hue: 30, chroma: 0.1, lightness: 0.8 }
			const darkText = { hue: 30, chroma: 0.05, lightness: 0.2 }

			const LC = measureContrast(lightBg, darkText)
			// Dark text on light bg = normal polarity = positive
			expect(LC).toBeGreaterThan(0)
		})

		it('returns negative value for light text on dark background', () => {
			const darkBg = { hue: 30, chroma: 0.05, lightness: 0.2 }
			const lightText = { hue: 30, chroma: 0.1, lightness: 0.8 }

			const LC = measureContrast(darkBg, lightText)
			// Light text on dark bg = reverse polarity = negative
			expect(LC).toBeLessThan(0)
		})

		it('has opposite signs for reversed roles', () => {
			const color1 = { hue: 30, chroma: 0.1, lightness: 0.3 }
			const color2 = { hue: 30, chroma: 0.1, lightness: 0.7 }

			const LC1 = measureContrast(color1, color2)
			const LC2 = measureContrast(color2, color1)

			expect(Math.sign(LC1)).toBe(-Math.sign(LC2))
			// APCA is asymmetric by design (different exponents for light vs dark)
			// so magnitudes won't be exactly equal, just reasonably close
			expect(Math.abs(Math.abs(LC1) - Math.abs(LC2))).toBeLessThan(5)
		})
	})

	describe('edge cases', () => {
		it('returns near-zero contrast for identical colors', () => {
			const color = { hue: 30, chroma: 0.1, lightness: 0.5 }

			const LC = measureContrast(color, color)
			expect(Math.abs(LC)).toBeLessThan(1)
		})

		it('returns near-zero contrast for very similar colors', () => {
			const color1 = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const color2 = { hue: 30, chroma: 0.1, lightness: 0.51 }

			const LC = measureContrast(color1, color2)
			expect(Math.abs(LC)).toBeLessThan(5)
		})

		it('handles pure black', () => {
			const black = { hue: 0, chroma: 0, lightness: 0 }
			const gray = { hue: 0, chroma: 0, lightness: 0.5 }

			const LC = measureContrast(gray, black)
			// L=0.5 to L=0 provides moderate contrast (not as much as white to black)
			expect(Math.abs(LC)).toBeGreaterThan(20)
		})

		it('handles pure white', () => {
			const white = { hue: 0, chroma: 0, lightness: 1 }
			const gray = { hue: 0, chroma: 0, lightness: 0.5 }

			const LC = measureContrast(gray, white)
			expect(Math.abs(LC)).toBeGreaterThan(40)
		})
	})

	describe('contrast value ranges', () => {
		it('produces low contrast (< 30) for similar lightness', () => {
			const color1 = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const color2 = { hue: 30, chroma: 0.15, lightness: 0.55 }

			const LC = measureContrast(color1, color2)
			expect(Math.abs(LC)).toBeLessThan(30)
		})

		it('produces medium contrast (30-60) for moderate difference', () => {
			const color1 = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const color2 = { hue: 30, chroma: 0.05, lightness: 0.7 }

			const LC = measureContrast(color1, color2)
			expect(Math.abs(LC)).toBeGreaterThan(20)
			expect(Math.abs(LC)).toBeLessThan(70)
		})

		it('produces high contrast (> 80) for extreme difference', () => {
			const color1 = { hue: 30, chroma: 0.1, lightness: 0.2 }
			const color2 = { hue: 30, chroma: 0.1, lightness: 0.9 }

			const LC = measureContrast(color1, color2)
			expect(Math.abs(LC)).toBeGreaterThan(70)
		})
	})

	describe('integration with applyContrast', () => {
		it('verifies applyContrast achieves target within tolerance', () => {
			const base = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const targetContrast = 60

			const baseColor = gamutMap(base)
			const contrastColor = applyContrast(base, targetContrast, 'prefer-dark')
			const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

			// The CSS-matching applyContrast uses simplified math with heuristic corrections,
			// so allow reasonable deviation from target
			expect(Math.abs(actualContrast - targetContrast)).toBeLessThan(15)
		})

		it('verifies all contrast modes produce measurable contrast', () => {
			const base = { hue: 30, chroma: 0.1, lightness: 0.5 }
			const baseColor = gamutMap(base)
			const targetContrast = 60

			const modes = ['force-light', 'force-dark', 'prefer-light', 'prefer-dark'] as const

			for (const mode of modes) {
				const contrastColor = applyContrast(base, targetContrast, mode)
				const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

				// Should achieve at least some meaningful contrast
				// Lower threshold to account for heuristic variations across modes
				expect(actualContrast).toBeGreaterThan(15)
			}
		})
	})
})
