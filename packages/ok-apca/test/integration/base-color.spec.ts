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
		harness.setVar('lightness', 0.2)
		const lowLightness = harness.getColor().get('oklch.l')

		harness.setVar('lightness', 0.8)
		const highLightness = harness.getColor().get('oklch.l')

		expect(highLightness).toBeGreaterThan(lowLightness)
	})

	it('updates chroma when --chroma variable changes', () => {
		harness.setVar('lightness', 0.5)

		harness.setVar('chroma', 0.1)
		const lowChroma = harness.getColor().get('oklch.c')

		harness.setVar('chroma', 0.9)
		const highChroma = harness.getColor().get('oklch.c')

		expect(highChroma).toBeGreaterThan(lowChroma)
	})

	it('maintains correct hue across lightness values', () => {
		for (const lightness of [0.2, 0.4, 0.6, 0.8]) {
			harness.setVar('lightness', lightness)
			const hue = harness.getColor().get('oklch.h')
			expect(hue).toBeCloseTo(240, 0)
		}
	})

	it('clamps chroma to gamut boundary', () => {
		harness.setVar('lightness', 0.5)
		harness.setVar('chroma', 1)

		const color = harness.getColor()
		// Color should be valid (within Display P3 gamut - the library's target)
		expect(color.inGamut('p3')).toBe(true)
	})
})
