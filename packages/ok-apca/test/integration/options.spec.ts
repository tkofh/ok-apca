/**
 * Browser integration tests for defineColors options.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanupAll, createTestHarness, type TestHarness } from './harness.ts'

describe('Custom output name', () => {
	let harness: TestHarness

	beforeEach(() => {
		harness = createTestHarness({
			options: {
				output: 'accent',
				variants: ['text'],
			},
		})
	})

	afterEach(() => harness.cleanup())

	it('outputs color with custom variable name', () => {
		harness.setVar('lightness', 0.5)
		harness.setVar('chroma', 0.5)

		const color = harness.getColor() // Gets --accent
		expect(color.get('oklch.l')).toBeCloseTo(0.5, 1)
	})

	it('outputs contrast colors with custom prefix', () => {
		harness.setVar('lightness', 0.3)
		harness.setVar('chroma', 0.5)
		harness.setVar('contrast-text', 0.6)

		const textColor = harness.getColor('text') // Gets --accent-text
		expect(textColor.get('oklch.l')).toBeGreaterThan(0.3)
	})
})

describe('No variants', () => {
	let harness: TestHarness

	beforeEach(() => {
		harness = createTestHarness({
			options: {},
			hue: 120,
		})
	})

	afterEach(() => harness.cleanup())

	it('generates only base color without contrast', () => {
		harness.setVar('lightness', 0.6)
		harness.setVar('chroma', 0.7)

		const color = harness.getColor()
		expect(color.get('oklch.l')).toBeCloseTo(0.6, 1)
		expect(color.get('oklch.h')).toBeCloseTo(120, 0)
	})

	it('ignores contrast variables when no variants configured', () => {
		harness.setVar('lightness', 0.5)
		harness.setVar('chroma', 0.5)
		harness.setVar('contrast-text', 0.6) // Should be ignored

		// Should not throw, and base color should still work
		const color = harness.getColor()
		expect(color.get('oklch.l')).toBeCloseTo(0.5, 1)
	})
})

describe('Hue normalization', () => {
	afterEach(() => cleanupAll())

	it('normalizes hue values above 360', () => {
		const harness = createTestHarness({
			options: {},
			hue: 390, // Should become 30
		})

		harness.setVar('lightness', 0.5)
		harness.setVar('chroma', 0.5)

		const hue = harness.getColor().get('oklch.h')
		expect(hue).toBeCloseTo(30, 0)

		harness.cleanup()
	})

	it('normalizes negative hue values', () => {
		const harness = createTestHarness({
			options: {},
			hue: -30, // Should become 330
		})

		harness.setVar('lightness', 0.5)
		harness.setVar('chroma', 0.5)

		const hue = harness.getColor().get('oklch.h')
		expect(hue).toBeCloseTo(330, 0)

		harness.cleanup()
	})
})
