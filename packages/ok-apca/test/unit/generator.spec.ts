import { describe, expect, it } from 'vitest'
import { defineHue } from '../../src/index.ts'

describe('defineHue validation', () => {
	it('validates contrast color labels - rejects invalid formats', () => {
		// Invalid: starts with number
		expect(() =>
			defineHue({
				hue: 30,
				selector: '.color',
				contrastColors: [{ label: '1text' }],
			}),
		).toThrow(/Invalid contrast color label/)

		// Invalid: contains space
		expect(() =>
			defineHue({
				hue: 30,
				selector: '.color',
				contrastColors: [{ label: 'text color' }],
			}),
		).toThrow(/Invalid contrast color label/)

		// Invalid: contains special character
		expect(() =>
			defineHue({
				hue: 30,
				selector: '.color',
				contrastColors: [{ label: 'text!' }],
			}),
		).toThrow(/Invalid contrast color label/)
	})

	it('validates contrast color labels - accepts valid formats', () => {
		expect(() =>
			defineHue({
				hue: 30,
				selector: '.color',
				contrastColors: [{ label: 'text' }, { label: 'fill-color' }, { label: 'stroke_2' }],
			}),
		).not.toThrow()
	})

	it('validates unique labels', () => {
		expect(() =>
			defineHue({
				hue: 30,
				selector: '.color',
				contrastColors: [{ label: 'text' }, { label: 'text' }],
			}),
		).toThrow(/Duplicate contrast color label/)
	})
})

describe('defineHue API', () => {
	it('returns css string', () => {
		const { css } = defineHue({
			hue: 30,
			selector: '.color',
		})

		expect(typeof css).toBe('string')
		expect(css.length).toBeGreaterThan(0)
	})

	it('includes selector in output', () => {
		const { css } = defineHue({
			hue: 30,
			selector: '.my-selector',
		})

		expect(css).toContain('.my-selector')
	})

	it('includes selector with attribute syntax', () => {
		const { css } = defineHue({
			hue: 30,
			selector: '[data-color="primary"]',
		})

		expect(css).toContain('[data-color="primary"]')
	})

	it('uses custom output name in CSS variable names', () => {
		const { css } = defineHue({
			hue: 30,
			selector: '.color',
			output: 'theme',
			contrastColors: [{ label: 'text' }],
		})

		expect(css).toContain('--theme:')
		expect(css).toContain('--theme-text:')
		expect(css).not.toContain('--color:')
	})

	it('generates valid CSS number formatting', () => {
		const { css } = defineHue({
			hue: 200,
			selector: '.color',
			contrastColors: [{ label: 'text' }],
		})

		// Numbers should not have excessive decimal places (max 5)
		const longDecimals = css.match(/\d+\.\d{6,}/g)
		expect(longDecimals).toBeNull()
	})

	it('generates different output for different hues', () => {
		const { css: css30 } = defineHue({
			hue: 30,
			selector: '.color',
		})

		const { css: css180 } = defineHue({
			hue: 180,
			selector: '.color',
		})

		// Different hues produce different gamut coefficients
		expect(css30).not.toBe(css180)
	})
})
