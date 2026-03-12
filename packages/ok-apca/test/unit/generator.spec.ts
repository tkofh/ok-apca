import { describe, expect, it } from 'vitest'
import { defineColors } from '../../src/index.ts'

describe('defineColors validation', () => {
	it('validates variant labels - rejects invalid formats', () => {
		// Invalid: starts with number
		expect(() =>
			defineColors({
				baseSelector: '.color',
				hues: [{ name: 'red', hue: 30, selector: '.color-red' }],
				variants: ['1text'],
			}),
		).toThrow(/Invalid variant label/)

		// Invalid: contains space
		expect(() =>
			defineColors({
				baseSelector: '.color',
				hues: [{ name: 'red', hue: 30, selector: '.color-red' }],
				variants: ['text color'],
			}),
		).toThrow(/Invalid variant label/)

		// Invalid: contains special character
		expect(() =>
			defineColors({
				baseSelector: '.color',
				hues: [{ name: 'red', hue: 30, selector: '.color-red' }],
				variants: ['text!'],
			}),
		).toThrow(/Invalid variant label/)
	})

	it('validates variant labels - accepts valid formats', () => {
		expect(() =>
			defineColors({
				baseSelector: '.color',
				hues: [{ name: 'red', hue: 30, selector: '.color-red' }],
				variants: ['text', 'fill-color', 'stroke_2'],
			}),
		).not.toThrow()
	})

	it('validates unique variant labels', () => {
		expect(() =>
			defineColors({
				baseSelector: '.color',
				hues: [{ name: 'red', hue: 30, selector: '.color-red' }],
				variants: ['text', 'text'],
			}),
		).toThrow(/Duplicate variant label/)
	})

	it('validates hue names', () => {
		expect(() =>
			defineColors({
				baseSelector: '.color',
				hues: [{ name: '1bad', hue: 30, selector: '.color-bad' }],
			}),
		).toThrow(/Invalid hue name/)

		expect(() =>
			defineColors({
				baseSelector: '.color',
				hues: [
					{ name: 'red', hue: 30, selector: '.color-red' },
					{ name: 'red', hue: 60, selector: '.color-red2' },
				],
			}),
		).toThrow(/Duplicate hue name/)
	})
})

describe('defineColors API', () => {
	it('returns css string', () => {
		const { css } = defineColors({
			baseSelector: '.color',
			hues: [{ name: 'red', hue: 30, selector: '.color-red' }],
		})

		expect(typeof css).toBe('string')
		expect(css.length).toBeGreaterThan(0)
	})

	it('includes base selector in output', () => {
		const { css } = defineColors({
			baseSelector: '.my-selector',
			hues: [{ name: 'red', hue: 30, selector: '.color-red' }],
		})

		expect(css).toContain('.my-selector')
	})

	it('includes hue selector in output', () => {
		const { css } = defineColors({
			baseSelector: '.color',
			hues: [{ name: 'primary', hue: 30, selector: '[data-color="primary"]' }],
		})

		expect(css).toContain('[data-color="primary"]')
	})

	it('uses custom output name in CSS variable names', () => {
		const { css } = defineColors({
			baseSelector: '.color',
			output: 'theme',
			hues: [{ name: 'red', hue: 30, selector: '.color-red' }],
			variants: ['text'],
		})

		expect(css).toContain('--theme:')
		expect(css).toContain('--theme-text:')
		expect(css).not.toContain('--color:')
	})

	it('generates valid CSS number formatting', () => {
		const { css } = defineColors({
			baseSelector: '.color',
			hues: [{ name: 'blue', hue: 200, selector: '.color-blue' }],
			variants: ['text'],
		})

		// Numbers should not have excessive decimal places (max 5)
		const longDecimals = css.match(/\d+\.\d{6,}/g)
		expect(longDecimals).toBeNull()
	})

	it('generates different hue selectors for different hues', () => {
		const { css } = defineColors({
			baseSelector: '.color',
			hues: [
				{ name: 'warm', hue: 30, selector: '.color-warm' },
				{ name: 'cool', hue: 180, selector: '.color-cool' },
			],
		})

		// Both hue selectors should be present
		expect(css).toContain('.color-warm')
		expect(css).toContain('.color-cool')
	})

	it('namespaces internal properties with output name', () => {
		const { css } = defineColors({
			baseSelector: '.color',
			output: 'theme',
			hues: [{ name: 'red', hue: 30, selector: '.color-red' }],
			variants: ['text'],
		})

		// Internal properties should be prefixed with _theme-
		expect(css).toContain('--_theme-')
		expect(css).not.toContain('--_color-')
	})

	it('returns hue metadata', () => {
		const system = defineColors({
			baseSelector: '.color',
			hues: [
				{ name: 'red', hue: 25, selector: '.color-red' },
				{ name: 'blue', hue: 240, selector: '.color-blue' },
			],
		})

		expect(system.hues).toHaveLength(2)
		expect(system.hues[0].name).toBe('red')
		expect(system.hues[0].hue).toBe(25)
		expect(system.hues[0].slice).toBeDefined()
		expect(system.hues[1].name).toBe('blue')
	})
})
