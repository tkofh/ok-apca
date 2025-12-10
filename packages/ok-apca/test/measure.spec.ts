import { describe, expect, it } from 'vitest'
import { findGamutBoundary } from '../src/color.ts'
import { applyContrast } from '../src/contrast.ts'
import { measureContrast } from '../src/measure.ts'

describe('measureContrast', () => {
	it('computes contrast between two OKLCH colors', () => {
		const white = { hue: 0, chroma: 0, lightness: 1 }
		const black = { hue: 0, chroma: 0, lightness: 0 }

		const LC = measureContrast(white, black)
		expect(LC).toBeGreaterThan(100)
	})

	it('returns value close to target for applyContrast result', () => {
		const _boundary = findGamutBoundary(30)
		const base = { hue: 30, chroma: 0.1, lightness: 0.5 }
		const targetContrast = 60

		const contrast = applyContrast(base, targetContrast, 'prefer-dark')
		const verified = measureContrast(base, contrast)

		// The CSS-matching applyContrast uses simplified math,
		// so there may be some deviation from the target
		expect(Math.abs(Math.abs(verified) - targetContrast)).toBeLessThan(15)
	})

	it('handles chromatic colors', () => {
		const orange = { hue: 30, chroma: 0.15, lightness: 0.7 }
		const darkOrange = { hue: 30, chroma: 0.1, lightness: 0.2 }

		const LC = measureContrast(orange, darkOrange)
		// Should have significant contrast
		expect(Math.abs(LC)).toBeGreaterThan(30)
	})
})
