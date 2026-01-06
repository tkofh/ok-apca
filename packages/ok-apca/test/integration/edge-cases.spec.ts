/**
 * Browser integration tests for edge cases and gamut mapping.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { cleanupAll, createTestHarness, type TestHarness } from './harness.ts'

describe('Edge cases', () => {
	let harness: TestHarness

	beforeEach(() => {
		harness = createTestHarness({
			hue: 240,
			selector: '.test-element',
			contrastColors: [{ label: 'text' }],
		})
	})

	afterEach(() => harness.cleanup())

	it('handles zero contrast', () => {
		harness.setVar('lightness', 50)
		harness.setVar('chroma', 50)
		harness.setVar('contrast-text', 0)

		const bgLightness = harness.getColor().get('oklch.l')
		const textLightness = harness.getColor('text').get('oklch.l')

		expect(Math.abs(bgLightness - textLightness)).toBeLessThan(0.1)
	})

	it('handles zero chroma', () => {
		harness.setVar('lightness', 50)
		harness.setVar('chroma', 0)
		harness.setVar('contrast-text', 60)

		const textChroma = harness.getColor('text').get('oklch.c')
		expect(textChroma).toBeCloseTo(0, 3)
	})

	it('handles extreme lightness values', () => {
		harness.setVar('chroma', 50)

		harness.setVar('lightness', 0)
		expect(harness.getColor().get('oklch.l')).toBeCloseTo(0, 2)

		harness.setVar('lightness', 100)
		expect(harness.getColor().get('oklch.l')).toBeCloseTo(1, 2)
	})

	it('clamps result when positive contrast on very light background', () => {
		harness.setVar('lightness', 95)
		harness.setVar('chroma', 50)
		harness.setVar('contrast-text', 60)

		const textLightness = harness.getColor('text').get('oklch.l')
		expect(textLightness).toBeGreaterThanOrEqual(0.9)
	})

	it('clamps result when negative contrast on very dark background', () => {
		harness.setVar('lightness', 5)
		harness.setVar('chroma', 50)
		harness.setVar('contrast-text', -60)

		const textLightness = harness.getColor('text').get('oklch.l')
		expect(textLightness).toBeLessThanOrEqual(0.1)
	})

	it('handles out-of-range percentage inputs gracefully', () => {
		// Test that values outside 0-100 are clamped
		harness.setVar('lightness', 150)
		harness.setVar('chroma', 50)

		const color = harness.getColor()
		// Should clamp to max lightness
		expect(color.get('oklch.l')).toBeCloseTo(1, 1)
	})

	it('handles very small contrast values smoothly', () => {
		harness.setVar('lightness', 50)
		harness.setVar('chroma', 50)

		// Small positive contrast
		harness.setVar('contrast-text', 5)
		const smallPosLightness = harness.getColor('text').get('oklch.l')

		// Small negative contrast
		harness.setVar('contrast-text', -5)
		const smallNegLightness = harness.getColor('text').get('oklch.l')

		const baseLightness = harness.getColor().get('oklch.l')

		// Both should be close to base but on opposite sides
		expect(smallPosLightness).toBeGreaterThan(baseLightness)
		expect(smallNegLightness).toBeLessThan(baseLightness)
	})
})

describe('Gamut mapping', () => {
	afterEach(() => cleanupAll('[class^="test-"]'))

	it('keeps colors within Display P3 gamut at all lightness levels', () => {
		const harness = createTestHarness({
			hue: 270, // Purple - challenging hue for gamut
			selector: '.test-element',
		})

		for (const lightness of [10, 30, 50, 70, 90]) {
			harness.setVar('lightness', lightness)
			harness.setVar('chroma', 100) // Max chroma request

			const color = harness.getColor()
			// Allow small epsilon for tent approximation inaccuracies
			expect(color.inGamut('p3', { epsilon: 0.01 })).toBe(true)
		}

		harness.cleanup()
	})

	it('keeps contrast colors within Display P3 gamut', () => {
		const harness = createTestHarness({
			hue: 150, // Green - another challenging hue
			selector: '.test-element',
			contrastColors: [{ label: 'text' }],
		})

		harness.setVar('lightness', 40)
		harness.setVar('chroma', 100)

		for (const contrast of [-90, -60, -30, 30, 60, 90]) {
			harness.setVar('contrast-text', contrast)

			const textColor = harness.getColor('text')
			expect(textColor.inGamut('p3')).toBe(true)
		}

		harness.cleanup()
	})
})

describe('Different hues', () => {
	afterEach(() => cleanupAll())

	const testHues = [0, 30, 60, 120, 180, 240, 300]

	for (const hue of testHues) {
		it(`produces correct colors for hue ${hue}`, () => {
			const harness = createTestHarness({
				hue,
				selector: '.test-element',
				contrastColors: [{ label: 'text' }],
			})

			harness.setVar('lightness', 50)
			harness.setVar('chroma', 50)
			harness.setVar('contrast-text', 60)

			const baseColor = harness.getColor()
			const textColor = harness.getColor('text')

			// Hue should match (with tolerance for edge cases near 0/360)
			const baseHue = baseColor.get('oklch.h')
			if (hue === 0) {
				expect(baseHue === 0 || baseHue === 360 || Number.isNaN(baseHue)).toBe(true)
			} else {
				expect(baseHue).toBeCloseTo(hue, 0)
			}

			// Text should be lighter (positive contrast)
			expect(textColor.get('oklch.l')).toBeGreaterThan(baseColor.get('oklch.l'))

			// Both should be in Display P3 gamut (the library's target)
			expect(baseColor.inGamut('p3')).toBe(true)
			expect(textColor.inGamut('p3')).toBe(true)

			harness.cleanup()
		})
	}

	it('produces different gamut boundaries for different hues', () => {
		// Orange and cyan have very different gamut shapes
		// Use unique selectors to avoid CSS conflicts
		const orangeHarness = createTestHarness({
			hue: 30,
			selector: '.test-orange',
		})
		const cyanHarness = createTestHarness({
			hue: 200,
			selector: '.test-cyan',
		})

		// At high chroma, the maximum available chroma differs by hue
		orangeHarness.setVar('lightness', 70)
		orangeHarness.setVar('chroma', 100)
		cyanHarness.setVar('lightness', 70)
		cyanHarness.setVar('chroma', 100)

		const orangeChroma = orangeHarness.getColor().get('oklch.c')
		const cyanChroma = cyanHarness.getColor().get('oklch.c')

		// They should differ (orange has more chroma available at L=0.7)
		expect(orangeChroma).not.toBeCloseTo(cyanChroma, 2)

		orangeHarness.cleanup()
		cyanHarness.cleanup()
	})
})
