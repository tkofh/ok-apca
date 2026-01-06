/**
 * Parity tests between TypeScript color functions and browser CSS behavior.
 *
 * These tests verify that the color.ts and contrast.ts functions produce
 * results that match the CSS computed by the browser.
 *
 * The CSS is the source of truth - it computes:
 * - Base color chroma as: maxChroma(lightness) * chromaPercentage
 * - Contrast color chroma as: maxChroma(contrastLightness) * chromaPercentage
 *
 * The TypeScript functions should be used to match this behavior.
 */

import { afterEach, describe, expect, it } from 'vitest'
import { getMaxChroma } from '../../src/color.ts'
import { applyContrast } from '../../src/contrast.ts'
import { cleanupAll, createTestHarness } from './harness.ts'

/**
 * Compute the expected color matching CSS behavior:
 * chroma = maxChroma(lightness) * chromaPercentage
 */
function computeExpectedColor(hue: number, lightness: number, chromaPct: number) {
	const L = Math.max(0, Math.min(1, lightness / 100))
	const maxC = getMaxChroma(L, hue)
	const C = maxC * Math.max(0, Math.min(1, chromaPct / 100))
	return { hue, lightness: L, chroma: C }
}

describe('gamutMap parity with CSS', () => {
	afterEach(() => cleanupAll())

	const testCases = [
		{ hue: 30, lightness: 50, chroma: 100, label: 'orange at L=50, max chroma' },
		{ hue: 30, lightness: 70, chroma: 100, label: 'orange at L=70, max chroma' },
		{ hue: 30, lightness: 30, chroma: 100, label: 'orange at L=30, max chroma' },
		{ hue: 240, lightness: 50, chroma: 100, label: 'blue at L=50, max chroma' },
		{ hue: 120, lightness: 60, chroma: 80, label: 'green at L=60, 80% chroma' },
		{ hue: 0, lightness: 50, chroma: 50, label: 'red at L=50, 50% chroma' },
		{ hue: 180, lightness: 70, chroma: 60, label: 'cyan at L=70, 60% chroma' },
		{ hue: 270, lightness: 40, chroma: 100, label: 'purple at L=40, max chroma' },
		{ hue: 60, lightness: 80, chroma: 100, label: 'yellow at L=80, max chroma' },
	]

	for (const { hue, lightness, chroma, label } of testCases) {
		it(`matches for ${label}`, () => {
			// Compute expected result matching CSS behavior
			const expected = computeExpectedColor(hue, lightness, chroma)

			// Get result from CSS in browser
			const harness = createTestHarness({
				hue,
				selector: '.test-element',
			})
			harness.setVar('lightness', lightness)
			harness.setVar('chroma', chroma)

			const cssColor = harness.getColor()
			const cssLightness = cssColor.get('oklch.l')
			const cssChroma = cssColor.get('oklch.c')

			// Compare lightness
			expect(expected.lightness).toBeCloseTo(cssLightness, 2)

			// Compare chroma
			expect(expected.chroma).toBeCloseTo(cssChroma, 2)

			harness.cleanup()
		})
	}
})

describe('findGamutSlice parity with CSS gamut clamping', () => {
	afterEach(() => cleanupAll())

	const hues = [0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330]
	const lightnessLevels = [20, 40, 60, 80]

	for (const hue of hues) {
		it(`produces correct max chroma curve for hue ${hue}`, () => {
			const harness = createTestHarness({
				hue,
				selector: '.test-element',
			})

			for (const lightness of lightnessLevels) {
				harness.setVar('lightness', lightness)
				harness.setVar('chroma', 100) // Request max chroma

				const cssColor = harness.getColor()
				const cssChroma = cssColor.get('oklch.c')

				// Compute expected max chroma from TypeScript
				const expectedMaxChroma = getMaxChroma(lightness / 100, hue)

				expect(cssChroma).toBeCloseTo(expectedMaxChroma, 2)
			}

			harness.cleanup()
		})
	}
})

describe('applyContrast parity with CSS', () => {
	afterEach(() => cleanupAll())

	const testCases = [
		{ lightness: 30, chroma: 50, contrast: 60, label: 'dark base, positive contrast' },
		{ lightness: 70, chroma: 50, contrast: -60, label: 'light base, negative contrast' },
		{ lightness: 50, chroma: 50, contrast: 40, label: 'mid base, moderate positive' },
		{ lightness: 50, chroma: 50, contrast: -40, label: 'mid base, moderate negative' },
		{ lightness: 20, chroma: 80, contrast: 80, label: 'very dark, high contrast' },
		{ lightness: 80, chroma: 80, contrast: -80, label: 'very light, high negative' },
		{ lightness: 50, chroma: 50, contrast: 10, label: 'mid base, low contrast' },
		{ lightness: 50, chroma: 50, contrast: -10, label: 'mid base, low negative' },
	]

	for (const { lightness, chroma, contrast, label } of testCases) {
		it(`matches for ${label} (hue=240)`, () => {
			const hue = 240

			// First compute the base color as CSS does
			const baseColor = computeExpectedColor(hue, lightness, chroma)

			// Then apply contrast using the TS function
			const tsResult = applyContrast(baseColor, contrast)

			// Get result from CSS in browser
			const harness = createTestHarness({
				hue,
				selector: '.test-element',
				contrastColors: [{ label: 'text' }],
			})
			harness.setVar('lightness', lightness)
			harness.setVar('chroma', chroma)
			harness.setVar('contrast-text', contrast)

			const cssColor = harness.getColor('text')
			const cssLightness = cssColor.get('oklch.l')
			const cssChroma = cssColor.get('oklch.c')

			// Compare lightness (this is the APCA calculation result)
			expect(tsResult.lightness).toBeCloseTo(cssLightness, 1)

			// Compare chroma - CSS computes: maxChroma(contrastL) * chromaPct
			// The TS applyContrast preserves chroma percentage, so we need to
			// compute what the CSS would produce
			const expectedContrastChroma = getMaxChroma(cssLightness, hue) * (chroma / 100)
			expect(cssChroma).toBeCloseTo(expectedContrastChroma, 1)

			harness.cleanup()
		})
	}

	// Test across multiple hues
	const hues = [30, 120, 240, 330]
	for (const hue of hues) {
		it(`matches for hue ${hue} with L=40, C=60, contrast=50`, () => {
			const lightness = 40
			const chroma = 60
			const contrast = 50

			// Compute base color as CSS does
			const baseColor = computeExpectedColor(hue, lightness, chroma)

			// Apply contrast
			const tsResult = applyContrast(baseColor, contrast)

			const harness = createTestHarness({
				hue,
				selector: '.test-element',
				contrastColors: [{ label: 'text' }],
			})
			harness.setVar('lightness', lightness)
			harness.setVar('chroma', chroma)
			harness.setVar('contrast-text', contrast)

			const cssColor = harness.getColor('text')

			// Compare lightness
			expect(tsResult.lightness).toBeCloseTo(cssColor.get('oklch.l'), 1)

			// CSS computes chroma as: maxChroma(contrastL) * chromaPct
			const cssL = cssColor.get('oklch.l')
			const expectedChroma = getMaxChroma(cssL, hue) * (chroma / 100)
			expect(cssColor.get('oklch.c')).toBeCloseTo(expectedChroma, 1)

			harness.cleanup()
		})
	}
})

describe('chroma percentage preservation parity', () => {
	afterEach(() => cleanupAll())

	it('preserves chroma percentage from base to contrast color', () => {
		const hue = 240
		const lightness = 40
		const chroma = 50 // 50% of max chroma
		const contrast = 60

		// CSS computation
		const harness = createTestHarness({
			hue,
			selector: '.test-element',
			contrastColors: [{ label: 'text' }],
		})
		harness.setVar('lightness', lightness)
		harness.setVar('chroma', chroma)
		harness.setVar('contrast-text', contrast)

		const cssBaseColor = harness.getColor()
		const cssContrastColor = harness.getColor('text')

		// Verify base chroma is ~50% of max at that lightness
		const baseL = cssBaseColor.get('oklch.l')
		const baseMaxChroma = getMaxChroma(baseL, hue)
		const baseChromaPct = cssBaseColor.get('oklch.c') / baseMaxChroma

		expect(baseChromaPct).toBeCloseTo(0.5, 1) // 50%

		// Verify contrast chroma is also ~50% of max at contrast lightness
		const contrastL = cssContrastColor.get('oklch.l')
		const contrastMaxChroma = getMaxChroma(contrastL, hue)
		const contrastChromaPct = cssContrastColor.get('oklch.c') / contrastMaxChroma

		expect(contrastChromaPct).toBeCloseTo(0.5, 1) // 50%

		// The percentages should be equal (CSS preserves chroma percentage)
		expect(baseChromaPct).toBeCloseTo(contrastChromaPct, 1)

		harness.cleanup()
	})
})

describe('edge case parity', () => {
	afterEach(() => cleanupAll())

	it('handles zero chroma identically', () => {
		const hue = 240
		const lightness = 50
		const chroma = 0
		const contrast = 60

		// Base color with zero chroma
		const baseColor = computeExpectedColor(hue, lightness, chroma)
		const tsResult = applyContrast(baseColor, contrast)

		const harness = createTestHarness({
			hue,
			selector: '.test-element',
			contrastColors: [{ label: 'text' }],
		})
		harness.setVar('lightness', lightness)
		harness.setVar('chroma', chroma)
		harness.setVar('contrast-text', contrast)

		const cssColor = harness.getColor('text')

		expect(tsResult.chroma).toBe(0)
		expect(cssColor.get('oklch.c')).toBeCloseTo(0, 3)
		expect(tsResult.lightness).toBeCloseTo(cssColor.get('oklch.l'), 1)

		harness.cleanup()
	})

	it('handles zero contrast identically', () => {
		const hue = 240
		const lightness = 50
		const chroma = 50
		const contrast = 0

		const baseColor = computeExpectedColor(hue, lightness, chroma)
		const tsResult = applyContrast(baseColor, contrast)

		const harness = createTestHarness({
			hue,
			selector: '.test-element',
			contrastColors: [{ label: 'text' }],
		})
		harness.setVar('lightness', lightness)
		harness.setVar('chroma', chroma)
		harness.setVar('contrast-text', contrast)

		const cssColor = harness.getColor('text')

		// Zero contrast should produce same lightness as base
		expect(tsResult.lightness).toBeCloseTo(cssColor.get('oklch.l'), 1)

		// CSS computes chroma as maxChroma(L) * pct
		const cssL = cssColor.get('oklch.l')
		const expectedChroma = getMaxChroma(cssL, hue) * (chroma / 100)
		expect(cssColor.get('oklch.c')).toBeCloseTo(expectedChroma, 1)

		harness.cleanup()
	})

	it('handles extreme lightness values identically', () => {
		const hue = 240
		const chroma = 50

		// Very dark
		{
			const expected = computeExpectedColor(hue, 5, chroma)
			const harness = createTestHarness({ hue, selector: '.test-element' })
			harness.setVar('lightness', 5)
			harness.setVar('chroma', chroma)
			const cssColor = harness.getColor()

			expect(expected.lightness).toBeCloseTo(cssColor.get('oklch.l'), 2)
			expect(expected.chroma).toBeCloseTo(cssColor.get('oklch.c'), 2)
			harness.cleanup()
		}

		// Very light
		{
			const expected = computeExpectedColor(hue, 95, chroma)
			const harness = createTestHarness({ hue, selector: '.test-element' })
			harness.setVar('lightness', 95)
			harness.setVar('chroma', chroma)
			const cssColor = harness.getColor()

			expect(expected.lightness).toBeCloseTo(cssColor.get('oklch.l'), 2)
			expect(expected.chroma).toBeCloseTo(cssColor.get('oklch.c'), 2)
			harness.cleanup()
		}
	})
})
