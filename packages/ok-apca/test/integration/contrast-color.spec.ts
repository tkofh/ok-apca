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
		harness.setVar('lightness', 20)
		harness.setVar('chroma', 50)
		harness.setVar('contrast-text', 60)

		const bgLightness = harness.getColor().get('oklch.l')
		const textLightness = harness.getColor('text').get('oklch.l')

		expect(textLightness).toBeGreaterThan(bgLightness)
	})

	it('produces dark text on light background with negative contrast', () => {
		harness.setVar('lightness', 80)
		harness.setVar('chroma', 50)
		harness.setVar('contrast-text', -60)

		const bgLightness = harness.getColor().get('oklch.l')
		const textLightness = harness.getColor('text').get('oklch.l')

		expect(textLightness).toBeLessThan(bgLightness)
	})

	it('increases contrast difference as contrast value increases', () => {
		harness.setVar('lightness', 30)
		harness.setVar('chroma', 50)

		const differences: number[] = []

		for (const contrast of [30, 60, 90]) {
			harness.setVar('contrast-text', contrast)

			const bgLightness = harness.getColor().get('oklch.l')
			const textLightness = harness.getColor('text').get('oklch.l')

			differences.push(Math.abs(bgLightness - textLightness))
		}

		const [diff0, diff1, diff2] = differences as [number, number, number]

		// Higher contrast values should produce larger or equal lightness differences
		expect(diff1).toBeGreaterThanOrEqual(diff0)
		expect(diff2).toBeGreaterThanOrEqual(diff1)
		// At least some increase should happen between 30 and 90
		expect(diff2).toBeGreaterThan(diff0)
	})

	it('preserves chroma percentage in contrast color', () => {
		harness.setVar('lightness', 30)
		harness.setVar('contrast-text', 60)

		harness.setVar('chroma', 20)
		const lowChromaText = harness.getColor('text').get('oklch.c')

		harness.setVar('chroma', 80)
		const highChromaText = harness.getColor('text').get('oklch.c')

		expect(highChromaText).toBeGreaterThan(lowChromaText)
	})

	it('handles maximum contrast values', () => {
		harness.setVar('lightness', 50)
		harness.setVar('chroma', 50)
		harness.setVar('contrast-text', 108)

		const textLightness = harness.getColor('text').get('oklch.l')
		expect(textLightness).toBeGreaterThan(0.8)
	})

	it('handles minimum contrast values', () => {
		harness.setVar('lightness', 50)
		harness.setVar('chroma', 50)
		harness.setVar('contrast-text', -108)

		const textLightness = harness.getColor('text').get('oklch.l')
		expect(textLightness).toBeLessThan(0.2)
	})

	it('defaults to zero contrast when --contrast-* is not set', () => {
		harness.setVar('lightness', 50)
		harness.setVar('chroma', 50)
		// Do NOT set --contrast-text

		const bgLightness = harness.getColor().get('oklch.l')
		const textLightness = harness.getColor('text').get('oklch.l')

		// Zero contrast should produce nearly identical lightness
		expect(Math.abs(bgLightness - textLightness)).toBeLessThan(0.05)
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
		harness.setVar('lightness', 40)
		harness.setVar('chroma', 50)
		harness.setVar('contrast-text', 60)
		harness.setVar('contrast-fill', 30)
		harness.setVar('contrast-stroke', -40)

		const textLightness = harness.getColor('text').get('oklch.l')
		const fillLightness = harness.getColor('fill').get('oklch.l')
		const strokeLightness = harness.getColor('stroke').get('oklch.l')

		// text has highest positive contrast, should be lightest
		expect(textLightness).toBeGreaterThan(fillLightness)
		// stroke has negative contrast, should be darker than base
		expect(strokeLightness).toBeLessThan(harness.getColor().get('oklch.l'))
	})

	it('shares chroma percentage across all contrast colors', () => {
		harness.setVar('lightness', 40)
		harness.setVar('chroma', 60)
		harness.setVar('contrast-text', 50)
		harness.setVar('contrast-fill', 50)
		harness.setVar('contrast-stroke', 50)

		const textChroma = harness.getColor('text').get('oklch.c')
		const fillChroma = harness.getColor('fill').get('oklch.c')
		const strokeChroma = harness.getColor('stroke').get('oklch.c')

		// All should have similar chroma (may differ slightly due to gamut mapping at different lightnesses)
		expect(textChroma).toBeCloseTo(fillChroma, 1)
		expect(fillChroma).toBeCloseTo(strokeChroma, 1)
	})

	it('maintains correct hue for all contrast colors', () => {
		harness.setVar('lightness', 50)
		harness.setVar('chroma', 50)
		harness.setVar('contrast-text', 40)
		harness.setVar('contrast-fill', 60)
		harness.setVar('contrast-stroke', -30)

		const baseHue = harness.getColor().get('oklch.h')
		const textHue = harness.getColor('text').get('oklch.h')
		const fillHue = harness.getColor('fill').get('oklch.h')
		const strokeHue = harness.getColor('stroke').get('oklch.h')

		expect(textHue).toBeCloseTo(baseHue, 0)
		expect(fillHue).toBeCloseTo(baseHue, 0)
		expect(strokeHue).toBeCloseTo(baseHue, 0)
	})
})
