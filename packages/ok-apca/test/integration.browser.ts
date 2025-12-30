/**
 * Browser integration tests for CSS color generation.
 *
 * These tests verify that the generated CSS produces correct computed colors
 * when CSS variables are manipulated in a real browser environment.
 */

import Color from 'colorjs.io'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { generateColorCss } from '../src/index.ts'

/**
 * Test configuration matching the playground app.
 */
const TEST_HUE = 240
const TEST_CONFIG = {
	hue: TEST_HUE,
	selector: '.test-element',
	contrastColors: [{ label: 'text' }],
}

describe('CSS Color Generation Integration', () => {
	let styleElement: HTMLStyleElement
	let testElement: HTMLDivElement
	let textElement: HTMLSpanElement

	beforeEach(() => {
		// Generate and inject CSS
		const css = generateColorCss(TEST_CONFIG)

		styleElement = document.createElement('style')
		styleElement.textContent = css
		document.head.appendChild(styleElement)

		// Create test elements
		testElement = document.createElement('div')
		testElement.className = 'test-element'
		testElement.style.width = '100px'
		testElement.style.height = '100px'

		textElement = document.createElement('span')
		textElement.textContent = 'Test'
		testElement.appendChild(textElement)

		document.body.appendChild(testElement)
	})

	afterEach(() => {
		styleElement.remove()
		testElement.remove()
	})

	function getColor() {
		const colorStr = getComputedStyle(testElement).getPropertyValue('--o-color').trim()
		return new Color(colorStr)
	}

	function getTextColor() {
		const colorStr = getComputedStyle(testElement).getPropertyValue('--o-color-text').trim()
		return new Color(colorStr)
	}

	describe('Base color computation', () => {
		it('produces a valid oklch color at default values', () => {
			const bgColorStr = getComputedStyle(testElement).getPropertyValue('--o-color').trim()

			expect(bgColorStr).toMatch(/oklch\(/)
			const lightness = getColor().get('oklch.l')
			expect(lightness).toBeGreaterThanOrEqual(0)
			expect(lightness).toBeLessThanOrEqual(1)
		})

		it('updates lightness when --lightness variable changes', () => {
			// Set low lightness
			testElement.style.setProperty('--lightness', '20')
			const lowLightness = getColor().get('oklch.l')

			// Set high lightness
			testElement.style.setProperty('--lightness', '80')
			const highLightness = getColor().get('oklch.l')

			expect(highLightness).toBeGreaterThan(lowLightness)
		})

		it('updates chroma when --chroma variable changes', () => {
			testElement.style.setProperty('--lightness', '50')

			// Set low chroma
			testElement.style.setProperty('--chroma', '10')
			const lowChroma = getColor().get('oklch.c')

			// Set high chroma
			testElement.style.setProperty('--chroma', '90')
			const highChroma = getColor().get('oklch.c')

			expect(highChroma).toBeGreaterThan(lowChroma)
		})

		it('maintains correct hue across lightness values', () => {
			const hueValues: number[] = []

			for (const lightness of [20, 40, 60, 80]) {
				testElement.style.setProperty('--lightness', String(lightness))
				hueValues.push(getColor().get('oklch.h'))
			}

			// All hue values should be the same (240)
			for (const h of hueValues) {
				expect(h).toBeCloseTo(TEST_HUE, 0)
			}
		})
	})

	describe('Contrast color computation with polarity inversion enabled', () => {
		it('produces dark text on light background with positive contrast', () => {
			// Light background
			testElement.style.setProperty('--lightness', '80')
			testElement.style.setProperty('--chroma', '50')
			// Positive contrast = dark text (normal polarity)
			testElement.style.setProperty('--contrast-text', '60')
			testElement.style.setProperty('--allow-polarity-inversion-text', '1')

			const bgLightness = getColor().get('oklch.l')
			const textLightness = getTextColor().get('oklch.l')

			// Text should be darker than background
			expect(textLightness).toBeLessThan(bgLightness)
		})

		it('produces light text on dark background with negative contrast', () => {
			// Dark background
			testElement.style.setProperty('--lightness', '20')
			testElement.style.setProperty('--chroma', '50')
			// Negative contrast = light text (reverse polarity)
			testElement.style.setProperty('--contrast-text', '-60')
			testElement.style.setProperty('--allow-polarity-inversion-text', '1')

			const bgLightness = getColor().get('oklch.l')
			const textLightness = getTextColor().get('oklch.l')

			// Text should be lighter than background
			expect(textLightness).toBeGreaterThan(bgLightness)
		})

		it('increases contrast difference as contrast value increases', () => {
			testElement.style.setProperty('--lightness', '70')
			testElement.style.setProperty('--chroma', '50')
			testElement.style.setProperty('--allow-polarity-inversion-text', '1')

			const differences: number[] = []

			for (const contrast of [30, 60, 90]) {
				testElement.style.setProperty('--contrast-text', String(contrast))

				const bgLightness = getColor().get('oklch.l')
				const textLightness = getTextColor().get('oklch.l')

				differences.push(Math.abs(bgLightness - textLightness))
			}

			expect.assert(differences[0] !== undefined)
			expect.assert(differences[1] !== undefined)
			expect.assert(differences[2] !== undefined)

			// Higher contrast values should produce larger or equal lightness differences
			// (equal when hitting the L=0 or L=1 boundary)
			expect(differences[1]).toBeGreaterThanOrEqual(differences[0])
			expect(differences[2]).toBeGreaterThanOrEqual(differences[1])
			// But at least some increase should happen between 30 and 90
			expect(differences[2]).toBeGreaterThan(differences[0])
		})

		it('preserves chroma percentage in contrast color', () => {
			testElement.style.setProperty('--lightness', '50')
			testElement.style.setProperty('--contrast-text', '60')
			testElement.style.setProperty('--allow-polarity-inversion-text', '1')

			// Low chroma
			testElement.style.setProperty('--chroma', '20')
			const lowChromaText = getTextColor().get('oklch.c')

			// High chroma
			testElement.style.setProperty('--chroma', '80')
			const highChromaText = getTextColor().get('oklch.c')

			// Higher chroma input should produce higher chroma contrast color
			expect(highChromaText).toBeGreaterThan(lowChromaText)
		})
	})

	describe('Contrast color computation WITHOUT polarity inversion', () => {
		it('produces dark text on light background with positive contrast', () => {
			// Light background
			testElement.style.setProperty('--lightness', '80')
			testElement.style.setProperty('--chroma', '50')
			// Positive contrast = dark text (normal polarity)
			testElement.style.setProperty('--contrast-text', '60')
			testElement.style.setProperty('--allow-polarity-inversion-text', '0')

			const bgLightness = getColor().get('oklch.l')
			const textLightness = getTextColor().get('oklch.l')

			// Text should be darker than background
			expect(textLightness).toBeLessThan(bgLightness)
		})

		it('produces light text on dark background with negative contrast', () => {
			// Dark background
			testElement.style.setProperty('--lightness', '20')
			testElement.style.setProperty('--chroma', '50')
			// Negative contrast = light text (reverse polarity)
			testElement.style.setProperty('--contrast-text', '-60')
			testElement.style.setProperty('--allow-polarity-inversion-text', '0')

			const bgLightness = getColor().get('oklch.l')
			const textLightness = getTextColor().get('oklch.l')

			// Text should be lighter than background
			expect(textLightness).toBeGreaterThan(bgLightness)
		})

		it('increases contrast difference as contrast value increases', () => {
			testElement.style.setProperty('--lightness', '70')
			testElement.style.setProperty('--chroma', '50')
			testElement.style.setProperty('--allow-polarity-inversion-text', '0')

			const differences: number[] = []

			for (const contrast of [30, 60, 90]) {
				testElement.style.setProperty('--contrast-text', String(contrast))

				const bgLightness = getColor().get('oklch.l')
				const textLightness = getTextColor().get('oklch.l')

				differences.push(Math.abs(bgLightness - textLightness))
			}

			expect.assert(differences[0] !== undefined)
			expect.assert(differences[1] !== undefined)
			expect.assert(differences[2] !== undefined)

			// Higher contrast values should produce larger or equal lightness differences
			// (equal when hitting the L=0 or L=1 boundary)
			expect(differences[1]).toBeGreaterThanOrEqual(differences[0])
			expect(differences[2]).toBeGreaterThanOrEqual(differences[1])
			// But at least some increase should happen between 30 and 90
			expect(differences[2]).toBeGreaterThan(differences[0])
		})

		it('handles maximum contrast values', () => {
			testElement.style.setProperty('--lightness', '50')
			testElement.style.setProperty('--chroma', '50')
			testElement.style.setProperty('--contrast-text', '108')
			testElement.style.setProperty('--allow-polarity-inversion-text', '0')

			const textLightness = getTextColor().get('oklch.l')

			// Max positive contrast should produce very dark text
			expect(textLightness).toBeLessThan(0.2)
		})

		it('handles minimum contrast values', () => {
			testElement.style.setProperty('--lightness', '50')
			testElement.style.setProperty('--chroma', '50')
			testElement.style.setProperty('--contrast-text', '-108')
			testElement.style.setProperty('--allow-polarity-inversion-text', '0')

			const textLightness = getTextColor().get('oklch.l')

			// Max negative contrast should produce very light text
			expect(textLightness).toBeGreaterThan(0.8)
		})

		it('does not invert polarity even when preferred is out of gamut', () => {
			// Very dark background
			testElement.style.setProperty('--lightness', '5')
			testElement.style.setProperty('--chroma', '50')
			testElement.style.setProperty('--contrast-text', '60') // Positive = prefer dark
			testElement.style.setProperty('--allow-polarity-inversion-text', '0')

			const bgLightness = getColor().get('oklch.l')
			const textLightness = getTextColor().get('oklch.l')

			// Without inversion, should still try to get dark text (will be clamped to 0)
			expect(textLightness).toBeLessThanOrEqual(bgLightness + 0.01)
		})
	})

	describe('Polarity inversion behavior', () => {
		it('inverts polarity when preferred is out of gamut and inversion allowed', () => {
			// Very dark background where positive contrast (darker text) would be out of gamut
			testElement.style.setProperty('--lightness', '5')
			testElement.style.setProperty('--chroma', '50')
			testElement.style.setProperty('--contrast-text', '60') // Positive = prefer dark
			testElement.style.setProperty('--allow-polarity-inversion-text', '1')

			const bgLightness = getColor().get('oklch.l')
			const textLightness = getTextColor().get('oklch.l')

			// With inversion allowed, should get light text even though positive contrast was requested
			expect(textLightness).toBeGreaterThan(bgLightness)
		})

		it('handles high lightness with negative contrast correctly', () => {
			// Very light background where negative contrast (lighter text) would be out of gamut
			testElement.style.setProperty('--lightness', '95')
			testElement.style.setProperty('--chroma', '50')
			testElement.style.setProperty('--contrast-text', '-60') // Negative = prefer light
			testElement.style.setProperty('--allow-polarity-inversion-text', '1')

			const bgLightness = getColor().get('oklch.l')
			const textLightness = getTextColor().get('oklch.l')

			// With inversion allowed, should get dark text since light is out of gamut
			expect(textLightness).toBeLessThan(bgLightness)
		})
	})

	describe('Edge cases', () => {
		it('handles zero contrast', () => {
			testElement.style.setProperty('--lightness', '50')
			testElement.style.setProperty('--chroma', '50')
			testElement.style.setProperty('--contrast-text', '0')

			const bgLightness = getColor().get('oklch.l')
			const textLightness = getTextColor().get('oklch.l')

			// Zero contrast should produce a color close to the background
			expect(Math.abs(bgLightness - textLightness)).toBeLessThan(0.1)
		})

		it('handles zero chroma', () => {
			testElement.style.setProperty('--lightness', '50')
			testElement.style.setProperty('--chroma', '0')
			testElement.style.setProperty('--contrast-text', '60')

			const textChroma = getTextColor().get('oklch.c')

			// Zero chroma should produce zero chroma contrast color
			expect(textChroma).toBeCloseTo(0, 3)
		})

		it('handles extreme lightness values', () => {
			// Very dark
			testElement.style.setProperty('--lightness', '0')
			testElement.style.setProperty('--chroma', '50')

			const darkBgLightness = getColor().get('oklch.l')
			expect(darkBgLightness).toBeCloseTo(0, 2)

			// Very light
			testElement.style.setProperty('--lightness', '100')

			const lightBgLightness = getColor().get('oklch.l')
			expect(lightBgLightness).toBeCloseTo(1, 2)
		})
	})
})
