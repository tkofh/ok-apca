/**
 * Browser integration tests for contrast color computation.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestHarness, type TestHarness } from './harness.ts'

describe('Contrast color computation', () => {
	let harness: TestHarness

	beforeEach(() => {
		harness = createTestHarness({
			hue: 240,
			selector: '.test-element',
			contrastColors: [{ label: 'text' }],
		})
	})

	afterEach(() => harness.cleanup())

	it('produces light text on dark background with positive contrast', () => {
		harness.setVar('lightness', 0.2)
		harness.setVar('chroma', 0.5)
		harness.setVar('contrast-text', 0.6)

		const bgLightness = harness.getColor().get('oklch.l')
		const textLightness = harness.getColor('text').get('oklch.l')

		expect(textLightness).toBeGreaterThan(bgLightness)
	})

	it('produces dark text on light background with negative contrast', () => {
		harness.setVar('lightness', 0.8)
		harness.setVar('chroma', 0.5)
		harness.setVar('contrast-text', -0.6)

		const bgLightness = harness.getColor().get('oklch.l')
		const textLightness = harness.getColor('text').get('oklch.l')

		expect(textLightness).toBeLessThan(bgLightness)
	})

	it('increases contrast difference as contrast value increases', () => {
		harness.setVar('lightness', 0.3)
		harness.setVar('chroma', 0.5)

		const differences: number[] = []

		for (const contrast of [0.3, 0.6, 0.9]) {
			harness.setVar('contrast-text', contrast)

			const bgLightness = harness.getColor().get('oklch.l')
			const textLightness = harness.getColor('text').get('oklch.l')

			differences.push(Math.abs(bgLightness - textLightness))
		}

		const [diff0, diff1, diff2] = differences as [number, number, number]

		// Higher contrast values should produce larger or equal lightness differences
		expect(diff1).toBeGreaterThanOrEqual(diff0)
		expect(diff2).toBeGreaterThanOrEqual(diff1)
		// At least some increase should happen between 0.3 and 0.9
		expect(diff2).toBeGreaterThan(diff0)
	})

	it('preserves chroma percentage in contrast color', () => {
		harness.setVar('lightness', 0.3)
		harness.setVar('contrast-text', 0.6)

		harness.setVar('chroma', 0.2)
		const lowChromaText = harness.getColor('text').get('oklch.c')

		harness.setVar('chroma', 0.8)
		const highChromaText = harness.getColor('text').get('oklch.c')

		expect(highChromaText).toBeGreaterThan(lowChromaText)
	})

	it('handles maximum contrast values', () => {
		harness.setVar('lightness', 0.5)
		harness.setVar('chroma', 0.5)
		harness.setVar('contrast-text', 1.08)

		const textLightness = harness.getColor('text').get('oklch.l')
		expect(textLightness).toBeGreaterThan(0.8)
	})

	it('handles minimum contrast values', () => {
		harness.setVar('lightness', 0.5)
		harness.setVar('chroma', 0.5)
		harness.setVar('contrast-text', -1.08)

		const bgLightness = harness.getColor().get('oklch.l')
		const textLightness = harness.getColor('text').get('oklch.l')

		// With inversion, minimum contrast (-1.08) from mid-tone may invert to light
		// if that achieves better contrast. The key is achieving high absolute contrast.
		const lightnessDiff = Math.abs(textLightness - bgLightness)
		expect(lightnessDiff).toBeGreaterThan(0.4) // Should have significant contrast
	})

	it('defaults to zero contrast when --contrast-* is not set', () => {
		harness.setVar('lightness', 0.5)
		harness.setVar('chroma', 0.5)
		// Do NOT set --contrast-text

		const bgLightness = harness.getColor().get('oklch.l')
		const textLightness = harness.getColor('text').get('oklch.l')

		// Zero contrast should produce nearly identical lightness
		expect(Math.abs(bgLightness - textLightness)).toBeLessThan(0.05)
	})
})

describe('Contrast inversion timing', () => {
	let harness: TestHarness
	let harnessNoInversion: TestHarness

	beforeEach(() => {
		harness = createTestHarness({
			hue: 240,
			selector: '.test-inv',
			contrastColors: [{ label: 'text' }],
		})
		harnessNoInversion = createTestHarness({
			hue: 240,
			selector: '.test-noinv',
			contrastColors: [{ label: 'text' }],
			noContrastInversion: true,
		})
	})

	afterEach(() => {
		harness.cleanup()
		harnessNoInversion.cleanup()
	})

	it('should not invert until non-inverted path reaches true black (CSS)', () => {
		// Regression: soft clamping in contrast measurement underestimated
		// dark-direction contrast near Y=0, causing premature polarity inversion.
		//
		// At hue=240, L=0.5, negative contrast should keep going darker until
		// the non-inverted path is fully clamped to black.
		const lightness = 0.5
		const chroma = 0.5

		harness.setVar('lightness', lightness)
		harness.setVar('chroma', chroma)
		harnessNoInversion.setVar('lightness', lightness)
		harnessNoInversion.setVar('chroma', chroma)

		const bgLightness = harness.getColor().get('oklch.l')

		// Find where non-inverted path reaches black
		let blackThreshold = -108
		for (let c = -1; c >= -108; c--) {
			harnessNoInversion.setVar('contrast-text', c / 100)
			const noInvL = harnessNoInversion.getColor('text').get('oklch.l')
			if (noInvL < 0.01) {
				blackThreshold = c
				break
			}
		}

		// Inversion should not happen before that point
		for (let c = -1; c > blackThreshold; c--) {
			harness.setVar('contrast-text', c / 100)
			const invL = harness.getColor('text').get('oklch.l')
			expect(
				invL,
				`contrast ${c}: CSS should go darker (not invert) before non-inverted reaches black at ${blackThreshold}`,
			).toBeLessThanOrEqual(bgLightness + 0.01)
		}
	})

	it('should not invert until non-inverted path reaches true white (CSS)', () => {
		const lightness = 0.5
		const chroma = 0.5

		harness.setVar('lightness', lightness)
		harness.setVar('chroma', chroma)
		harnessNoInversion.setVar('lightness', lightness)
		harnessNoInversion.setVar('chroma', chroma)

		const bgLightness = harness.getColor().get('oklch.l')

		// Find where non-inverted path reaches white
		let whiteThreshold = 108
		for (let c = 1; c <= 108; c++) {
			harnessNoInversion.setVar('contrast-text', c / 100)
			const noInvL = harnessNoInversion.getColor('text').get('oklch.l')
			if (noInvL > 0.99) {
				whiteThreshold = c
				break
			}
		}

		// Inversion should not happen before that point
		for (let c = 1; c < whiteThreshold; c++) {
			harness.setVar('contrast-text', c / 100)
			const invL = harness.getColor('text').get('oklch.l')
			expect(
				invL,
				`contrast ${c}: CSS should go lighter (not invert) before non-inverted reaches white at ${whiteThreshold}`,
			).toBeGreaterThanOrEqual(bgLightness - 0.01)
		}
	})
})

describe('Multiple contrast colors', () => {
	let harness: TestHarness

	beforeEach(() => {
		harness = createTestHarness({
			hue: 30,
			selector: '.test-element',
			contrastColors: [{ label: 'text' }, { label: 'fill' }, { label: 'stroke' }],
		})
	})

	afterEach(() => harness.cleanup())

	it('generates independent contrast colors for each label', () => {
		harness.setVar('lightness', 0.4)
		harness.setVar('chroma', 0.5)
		harness.setVar('contrast-text', 0.6)
		harness.setVar('contrast-fill', 0.3)
		harness.setVar('contrast-stroke', -0.4)

		const baseLightness = harness.getColor().get('oklch.l')
		const textLightness = harness.getColor('text').get('oklch.l')
		const fillLightness = harness.getColor('fill').get('oklch.l')
		const strokeLightness = harness.getColor('stroke').get('oklch.l')

		// text has highest positive contrast, should be lightest
		expect(textLightness).toBeGreaterThan(fillLightness)
		// stroke has negative contrast - with inversion, what matters is contrast achieved
		// From L=0.4 base, both directions have room, so preference should be followed
		const strokeDiff = Math.abs(strokeLightness - baseLightness)
		expect(strokeDiff).toBeGreaterThan(0.1) // Should achieve some contrast
	})

	it('shares chroma percentage across all contrast colors', () => {
		harness.setVar('lightness', 0.4)
		harness.setVar('chroma', 0.6)
		harness.setVar('contrast-text', 0.5)
		harness.setVar('contrast-fill', 0.5)
		harness.setVar('contrast-stroke', 0.5)

		const textChroma = harness.getColor('text').get('oklch.c')
		const fillChroma = harness.getColor('fill').get('oklch.c')
		const strokeChroma = harness.getColor('stroke').get('oklch.c')

		// All should have similar chroma (may differ slightly due to gamut mapping at different lightnesses)
		expect(textChroma).toBeCloseTo(fillChroma, 1)
		expect(fillChroma).toBeCloseTo(strokeChroma, 1)
	})

	it('maintains correct hue for all contrast colors', () => {
		harness.setVar('lightness', 0.5)
		harness.setVar('chroma', 0.5)
		harness.setVar('contrast-text', 0.4)
		harness.setVar('contrast-fill', 0.6)
		harness.setVar('contrast-stroke', -0.3)

		const baseHue = harness.getColor().get('oklch.h')
		const textHue = harness.getColor('text').get('oklch.h')
		const fillHue = harness.getColor('fill').get('oklch.h')
		const strokeHue = harness.getColor('stroke').get('oklch.h')

		expect(textHue).toBeCloseTo(baseHue, 0)
		expect(fillHue).toBeCloseTo(baseHue, 0)
		expect(strokeHue).toBeCloseTo(baseHue, 0)
	})
})
