/**
 * Browser integration tests for defineHue options.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanupAll, createTestHarness, type TestHarness } from './harness.ts'

describe('Custom output name', () => {
	let harness: TestHarness

	beforeEach(() => {
		harness = createTestHarness({
			hue: 180,
			selector: '.test-element',
			output: 'accent',
			contrastColors: [{ label: 'text' }],
		})
	})

	afterEach(() => harness.cleanup())

	it('outputs color with custom variable name', () => {
		harness.setVar('lightness', 50)
		harness.setVar('chroma', 50)

		const color = harness.getColor() // Gets --accent
		expect(color.get('oklch.l')).toBeCloseTo(0.5, 1)
	})

	it('outputs contrast colors with custom prefix', () => {
		harness.setVar('lightness', 30)
		harness.setVar('chroma', 50)
		harness.setVar('contrast-text', 60)

		const textColor = harness.getColor('text') // Gets --accent-text
		expect(textColor.get('oklch.l')).toBeGreaterThan(0.3)
	})
})

describe('No contrast colors', () => {
	let harness: TestHarness

	beforeEach(() => {
		harness = createTestHarness({
			hue: 120,
			selector: '.test-element',
			// No contrastColors
		})
	})

	afterEach(() => harness.cleanup())

	it('generates only base color without contrast', () => {
		harness.setVar('lightness', 60)
		harness.setVar('chroma', 70)

		const color = harness.getColor()
		expect(color.get('oklch.l')).toBeCloseTo(0.6, 1)
		expect(color.get('oklch.h')).toBeCloseTo(120, 0)
	})

	it('ignores contrast variables when no contrast colors configured', () => {
		harness.setVar('lightness', 50)
		harness.setVar('chroma', 50)
		harness.setVar('contrast-text', 60) // Should be ignored

		// Should not throw, and base color should still work
		const color = harness.getColor()
		expect(color.get('oklch.l')).toBeCloseTo(0.5, 1)
	})
})

describe('inputMode: normalized', () => {
	let harness: TestHarness

	beforeEach(() => {
		harness = createTestHarness({
			hue: 240,
			selector: '.test-element',
			inputMode: 'normalized',
			contrastColors: [{ label: 'text' }],
		})
	})

	afterEach(() => harness.cleanup())

	it('accepts 0-1 range for lightness', () => {
		harness.setVar('lightness', 0.3)
		const lowLightness = harness.getColor().get('oklch.l')

		harness.setVar('lightness', 0.8)
		const highLightness = harness.getColor().get('oklch.l')

		expect(lowLightness).toBeCloseTo(0.3, 1)
		expect(highLightness).toBeCloseTo(0.8, 1)
	})

	it('accepts 0-1 range for chroma', () => {
		harness.setVar('lightness', 0.5)

		harness.setVar('chroma', 0.2)
		const lowChroma = harness.getColor().get('oklch.c')

		harness.setVar('chroma', 0.8)
		const highChroma = harness.getColor().get('oklch.c')

		expect(highChroma).toBeGreaterThan(lowChroma)
	})

	it('accepts 0-1 range for contrast', () => {
		harness.setVar('lightness', 0.3)
		harness.setVar('chroma', 0.5)

		harness.setVar('contrast-text', 0.6)
		const textLightness = harness.getColor('text').get('oklch.l')

		// Positive contrast should produce lighter text
		expect(textLightness).toBeGreaterThan(0.3)
	})

	it('handles negative contrast in normalized mode', () => {
		harness.setVar('lightness', 0.7)
		harness.setVar('chroma', 0.5)
		harness.setVar('contrast-text', -0.5)

		const textLightness = harness.getColor('text').get('oklch.l')

		// Negative contrast should produce darker text
		expect(textLightness).toBeLessThan(0.7)
	})
})

describe('Hue normalization', () => {
	afterEach(() => cleanupAll())

	it('normalizes hue values above 360', () => {
		const harness = createTestHarness({
			hue: 390, // Should become 30
			selector: '.test-element',
		})

		harness.setVar('lightness', 50)
		harness.setVar('chroma', 50)

		const hue = harness.getColor().get('oklch.h')
		expect(hue).toBeCloseTo(30, 0)

		harness.cleanup()
	})

	it('normalizes negative hue values', () => {
		const harness = createTestHarness({
			hue: -30, // Should become 330
			selector: '.test-element',
		})

		harness.setVar('lightness', 50)
		harness.setVar('chroma', 50)

		const hue = harness.getColor().get('oklch.h')
		expect(hue).toBeCloseTo(330, 0)

		harness.cleanup()
	})
})
