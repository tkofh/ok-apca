/**
 * Browser integration tests for base color computation.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createTestHarness, type TestHarness } from './harness.ts'

describe('Base color computation', () => {
	let harness: TestHarness

	beforeEach(() => {
		harness = createTestHarness({
			hue: 240,
			selector: '.test-element',
		})
	})

	afterEach(() => harness.cleanup())

	it('produces a valid oklch color at default values', () => {
		const color = harness.getColor()
		const lightness = color.get('oklch.l')

		expect(lightness).toBeGreaterThanOrEqual(0)
		expect(lightness).toBeLessThanOrEqual(1)
	})

	it('updates lightness when --lightness variable changes', () => {
		harness.setVar('lightness', 20)
		const lowLightness = harness.getColor().get('oklch.l')

		harness.setVar('lightness', 80)
		const highLightness = harness.getColor().get('oklch.l')

		expect(highLightness).toBeGreaterThan(lowLightness)
	})

	it('updates chroma when --chroma variable changes', () => {
		harness.setVar('lightness', 50)

		harness.setVar('chroma', 10)
		const lowChroma = harness.getColor().get('oklch.c')

		harness.setVar('chroma', 90)
		const highChroma = harness.getColor().get('oklch.c')

		expect(highChroma).toBeGreaterThan(lowChroma)
	})

	it('maintains correct hue across lightness values', () => {
		for (const lightness of [20, 40, 60, 80]) {
			harness.setVar('lightness', lightness)
			const hue = harness.getColor().get('oklch.h')
			expect(hue).toBeCloseTo(240, 0)
		}
	})

	it('clamps chroma to gamut boundary', () => {
		harness.setVar('lightness', 50)
		harness.setVar('chroma', 100)

		const color = harness.getColor()
		// Color should be valid (within Display P3 gamut - the library's target)
		expect(color.inGamut('p3')).toBe(true)
	})
})
