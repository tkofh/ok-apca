import { describe, expect, it } from 'vitest'
import { defineHue } from '../src/index.ts'

describe('defineHue', () => {
	it('generates basic color CSS for a given hue', () => {
		const { css } = defineHue({
			hue: 30,
			selector: '.color',
		})

		// Should contain the selector
		expect(css).toContain('.color {')

		// Should contain runtime input variables
		expect(css).toContain('var(--lightness)')
		expect(css).toContain('var(--chroma)')

		// Should output the color with default output name
		expect(css).toContain('--color: oklch(')
		expect(css).toContain('30')
	})

	it('generates contrast CSS when contrastColors provided', () => {
		const { css } = defineHue({
			hue: 30,
			selector: '.color',
			contrastColors: [{ label: 'text' }],
		})

		// Should contain shared Y-bg
		expect(css).toContain('--_Y-bg:')

		// Should output contrast color
		expect(css).toContain('--color-text: oklch(')

		// Should contain labeled variables
		expect(css).toContain('--contrast-text')
	})

	it('generates multiple contrast colors', () => {
		const { css } = defineHue({
			hue: 30,
			selector: '.color',
			contrastColors: [{ label: 'text' }, { label: 'fill' }, { label: 'stroke' }],
		})

		// Should output all contrast colors
		expect(css).toContain('--color-text: oklch(')
		expect(css).toContain('--color-fill: oklch(')
		expect(css).toContain('--color-stroke: oklch(')

		// Should contain labeled variables for each
		expect(css).toContain('--contrast-text')
		expect(css).toContain('--contrast-fill')
		expect(css).toContain('--contrast-stroke')
	})

	it('uses custom output name when provided', () => {
		const { css } = defineHue({
			hue: 30,
			selector: '.color',
			output: 'theme',
			contrastColors: [{ label: 'text' }],
		})

		expect(css).toContain('--theme: oklch(')
		expect(css).toContain('--theme-text: oklch(')
		expect(css).not.toContain('--color:')
	})

	it('normalizes hue values outside 0-360 range', () => {
		const { css } = defineHue({
			hue: 390, // Should become 30
			selector: '.color',
		})

		expect(css).toContain('30')
		expect(css).not.toContain('390')
	})

	it('handles negative hue values', () => {
		const { css } = defineHue({
			hue: -30, // Should become 330
			selector: '.color',
		})

		expect(css).toContain('330')
	})

	it('generates readable CSS with comments', () => {
		const { css } = defineHue({
			hue: 30,
			selector: '.color',
		})

		// Should have helpful comments
		expect(css).toContain('/* Runtime inputs')
		expect(css).toContain('/* Output color')
	})

	it('generates valid CSS property values', () => {
		const { css } = defineHue({
			hue: 200,
			selector: '[data-color]',
			contrastColors: [{ label: 'text' }],
		})

		// Check that numbers are properly formatted (no trailing zeros like "0.5000000000")
		// Numbers in the generated CSS should be reasonably short (max 8 decimal places)
		const numbers = css.match(/\d+\.\d{9,}/g)
		expect(numbers).toBeNull() // No numbers with 9+ decimal places
	})

	it('generates different CSS for different hues', () => {
		const { css: css30 } = defineHue({
			hue: 30,
			selector: '.color',
		})

		const { css: css180 } = defineHue({
			hue: 180,
			selector: '.color',
		})

		// Different hues should produce different gamut boundaries
		expect(css30).not.toBe(css180)

		// Should contain different hue values
		expect(css30).toContain('30')
		expect(css180).toContain('180')
	})

	it('generates CSS without contrast when contrastColors omitted', () => {
		const { css } = defineHue({
			hue: 30,
			selector: '.color',
		})

		// Should not contain contrast-specific variables
		expect(css).not.toContain('--color-')
		expect(css).not.toContain('--_Y-bg:')
		expect(css).not.toContain('--_Y-dark')
		expect(css).not.toContain('--_Y-light')
		expect(css).not.toContain('--contrast-')
	})

	it('validates contrast color labels', () => {
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

		// Valid labels should not throw
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

describe('defineHue output structure', () => {
	it('produces CSS with proper variable dependencies', () => {
		const { css } = defineHue({
			hue: 60,
			selector: '.test',
		})

		// The output should reference the computed values
		expect(css).toContain('var(--_lum-norm)')
		expect(css).toContain('var(--_chr-pct)')

		// Max chroma and chroma are inlined into the output color
		expect(css).toContain('--color: oklch(')
	})

	it('produces contrast CSS with APCA calculation chain', () => {
		const { css } = defineHue({
			hue: 60,
			selector: '.test',
			contrastColors: [{ label: 'text' }],
		})

		// Should have shared Y-bg
		expect(css).toContain('--_Y-bg:')

		// Should have per-label Y-bg
		expect(css).toContain('--_Y-bg-text:')

		// Should have Y-dark-min and Y-light-min (used by Hermite interpolation)
		expect(css).toContain('--_Y-dark-min-text:')
		expect(css).toContain('--_Y-light-min-text:')

		// Should have contrast lightness
		expect(css).toContain('--_con-lum-text:')
	})

	it('produces contrast CSS with both polarities inlined into con-lum', () => {
		const { css } = defineHue({
			hue: 60,
			selector: '.test',
			contrastColors: [{ label: 'text' }],
		})

		// Y-dark, Y-light, prefer-light, prefer-dark are inlined into con-lum
		// Check that con-lum contains the polarity selection logic
		expect(css).toContain('--_con-lum-text:')

		// The inlined expression should contain sign() for polarity detection
		expect(css).toContain('sign(var(--_contrast-signed-text)')
	})

	it('includes heuristic correction inlined in contrast-signed', () => {
		const { css } = defineHue({
			hue: 60,
			selector: '.test',
			contrastColors: [{ label: 'text' }],
		})

		// Heuristic boost is inlined into contrast-signed
		expect(css).toContain('--_contrast-signed-text:')

		// The comment mentions the inlining
		expect(css).toContain('Heuristic correction inlined')
	})

	it('uses fallback value of 0 for --contrast-{label}', () => {
		const { css } = defineHue({
			hue: 60,
			selector: '.test',
			contrastColors: [{ label: 'text' }],
		})

		// Should use default value of 0 for contrast inputs
		expect(css).toContain('var(--contrast-text, 0)')
	})

	it('shares chroma percentage across all contrast colors', () => {
		const { css } = defineHue({
			hue: 60,
			selector: '.test',
			contrastColors: [{ label: 'text' }, { label: 'fill' }],
		})

		// Each contrast color output should reference var(--_chr-pct)
		// (con-chr is now inlined into the output color)
		expect(css).toContain('--color-text: oklch(')
		expect(css).toContain('--color-fill: oklch(')

		// The chroma calculation in output colors should use chr-pct
		const textColorMatch = css.match(/--color-text:[^;]+var\(--_chr-pct\)/)
		const fillColorMatch = css.match(/--color-fill:[^;]+var\(--_chr-pct\)/)
		expect(textColorMatch).not.toBeNull()
		expect(fillColorMatch).not.toBeNull()
	})
})

describe('shared Y-bg', () => {
	it('should reference shared Y-bg for all contrast colors', () => {
		const { css } = defineHue({
			hue: 30,
			selector: '.orange',
			contrastColors: [{ label: 'text' }, { label: 'fill' }],
		})

		// Per-label Y-bg should reference shared Y-bg
		expect(css).toContain('--_Y-bg-text: var(--_Y-bg)')
		expect(css).toContain('--_Y-bg-fill: var(--_Y-bg)')
	})
})

describe('output option', () => {
	it('defaults to "color" for output name', () => {
		const { css } = defineHue({
			hue: 30,
			selector: '.test',
			contrastColors: [{ label: 'text' }],
		})

		expect(css).toContain('--color: oklch(')
		expect(css).toContain('--color-text: oklch(')
	})

	it('allows custom output name', () => {
		const { css } = defineHue({
			hue: 30,
			selector: '.test',
			output: 'accent',
			contrastColors: [{ label: 'text' }],
		})

		expect(css).toContain('--accent: oklch(')
		expect(css).toContain('--accent-text: oklch(')
		expect(css).not.toContain('--color:')
	})
})
