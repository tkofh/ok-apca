import { describe, expect, it } from 'vitest'
import { generateColorCss } from '../src/index.ts'

describe('generateColorCss', () => {
	it('generates basic color CSS for a given hue', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.color',
		})

		// Should contain the selector
		expect(css).toContain('.color {')

		// Should contain runtime input variables
		expect(css).toContain('var(--lightness)')
		expect(css).toContain('var(--chroma)')

		// Should contain build-time constants (gamut apex)
		expect(css).toContain('--_apex-lum:')
		expect(css).toContain('--_apex-chr:')

		// Should output the color with default prefix
		expect(css).toContain('--o-color: oklch(')
		expect(css).toContain('30')
	})

	it('generates contrast CSS when contrastColors provided', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.color',
			contrastColors: [{ label: 'text' }],
		})

		// Should contain shared Y-bg
		expect(css).toContain('--_Y-bg:')

		// Should output contrast color
		expect(css).toContain('--o-color-text: oklch(')

		// Should contain labeled variables
		expect(css).toContain('--contrast-text')
		expect(css).toContain('--allow-polarity-inversion-text')
	})

	it('generates multiple contrast colors', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.color',
			contrastColors: [{ label: 'text' }, { label: 'fill' }, { label: 'stroke' }],
		})

		// Should output all contrast colors
		expect(css).toContain('--o-color-text: oklch(')
		expect(css).toContain('--o-color-fill: oklch(')
		expect(css).toContain('--o-color-stroke: oklch(')

		// Should contain labeled variables for each
		expect(css).toContain('--contrast-text')
		expect(css).toContain('--contrast-fill')
		expect(css).toContain('--contrast-stroke')
	})

	it('uses custom prefix when provided', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.color',
			prefix: 'theme',
			contrastColors: [{ label: 'text' }],
		})

		expect(css).toContain('--theme-color: oklch(')
		expect(css).toContain('--theme-color-text: oklch(')
		expect(css).not.toContain('--o-color')
	})

	it('normalizes hue values outside 0-360 range', () => {
		const css = generateColorCss({
			hue: 390, // Should become 30
			selector: '.color',
		})

		expect(css).toContain('30')
		expect(css).not.toContain('390')
	})

	it('handles negative hue values', () => {
		const css = generateColorCss({
			hue: -30, // Should become 330
			selector: '.color',
		})

		expect(css).toContain('330')
	})

	it('generates readable CSS with comments', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.color',
		})

		// Should have helpful comments
		expect(css).toContain('/* Runtime inputs')
		expect(css).toContain('/* Build-time constants')
		expect(css).toContain('/* Max chroma at this lightness')
		expect(css).toContain('/* Output color')
	})

	it('generates valid CSS property values', () => {
		const css = generateColorCss({
			hue: 200,
			selector: '[data-color]',
			contrastColors: [{ label: 'text' }],
		})

		// Check that numbers are properly formatted (no trailing zeros like "0.5000000000")
		const apexLumMatch = css.match(/--_apex-lum:\s*([\d.]+)/)
		expect(apexLumMatch).not.toBeNull()
		if (apexLumMatch) {
			const apexLum = apexLumMatch[1]
			expect(apexLum).not.toMatch(/0{4,}$/)
		}
	})

	it('generates different CSS for different hues', () => {
		const css30 = generateColorCss({
			hue: 30,
			selector: '.color',
		})

		const css180 = generateColorCss({
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
		const css = generateColorCss({
			hue: 30,
			selector: '.color',
		})

		// Should not contain contrast-specific variables
		expect(css).not.toContain('--o-color-')
		expect(css).not.toContain('--_Y-bg:')
		expect(css).not.toContain('--_Y-dark')
		expect(css).not.toContain('--_Y-light')
		expect(css).not.toContain('--contrast-')
	})

	it('validates contrast color labels', () => {
		// Invalid: starts with number
		expect(() =>
			generateColorCss({
				hue: 30,
				selector: '.color',
				contrastColors: [{ label: '1text' }],
			}),
		).toThrow(/Invalid contrast color label/)

		// Invalid: contains space
		expect(() =>
			generateColorCss({
				hue: 30,
				selector: '.color',
				contrastColors: [{ label: 'text color' }],
			}),
		).toThrow(/Invalid contrast color label/)

		// Invalid: contains special character
		expect(() =>
			generateColorCss({
				hue: 30,
				selector: '.color',
				contrastColors: [{ label: 'text!' }],
			}),
		).toThrow(/Invalid contrast color label/)

		// Valid labels should not throw
		expect(() =>
			generateColorCss({
				hue: 30,
				selector: '.color',
				contrastColors: [{ label: 'text' }, { label: 'fill-color' }, { label: 'stroke_2' }],
			}),
		).not.toThrow()
	})

	it('validates unique labels', () => {
		expect(() =>
			generateColorCss({
				hue: 30,
				selector: '.color',
				contrastColors: [{ label: 'text' }, { label: 'text' }],
			}),
		).toThrow(/Duplicate contrast color label/)
	})
})

describe('generateColorCss output structure', () => {
	it('produces CSS with proper variable dependencies', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
		})

		// The max chroma calculation should reference apex values and curve scale
		expect(css).toContain('var(--_apex-lum)')
		expect(css).toContain('var(--_apex-chr)')
		expect(css).toContain('var(--_curve-scale)')

		// Should have max chroma variable
		expect(css).toContain('--_max-chr:')

		// The output should reference the computed values
		expect(css).toContain('var(--_lum-norm)')
		expect(css).toContain('var(--_chr)')
	})

	it('produces contrast CSS with APCA calculation chain', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
			contrastColors: [{ label: 'text' }],
		})

		// Should have shared Y-bg
		expect(css).toContain('--_Y-bg:')

		// Should have per-label Y-bg
		expect(css).toContain('--_Y-bg-text:')

		// Should always have both polarities
		expect(css).toContain('--_Y-dark-text:')
		expect(css).toContain('--_Y-light-text:')

		// Should have contrast lightness
		expect(css).toContain('--_con-lum-text:')
	})

	it('produces contrast CSS with both polarities always', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
			contrastColors: [{ label: 'text' }],
		})

		// Should always have both polarities for runtime selection
		expect(css).toContain('--_Y-dark-text:')
		expect(css).toContain('--_Y-light-text:')

		// Should have polarity selection logic
		expect(css).toContain('--_use-light-text:')
		expect(css).toContain('--_prefer-light-text:')
		expect(css).toContain('--_prefer-dark-text:')
	})

	it('includes heuristic correction boost in contrast CSS', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
			contrastColors: [{ label: 'text' }],
		})

		// Should have heuristic boost calculations
		expect(css).toContain('--_boost-pct-text:')
		expect(css).toContain('--_boost-multiplicative-text:')
		expect(css).toContain('--_boost-absolute-text:')
		expect(css).toContain('--_contrast-adjusted-text:')
	})

	it('uses fallback value of 0 for --contrast-{label}', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
			contrastColors: [{ label: 'text' }],
		})

		// Should use default value of 0 for contrast inputs
		expect(css).toContain('var(--contrast-text, 0)')
	})

	it('uses fallback value of 0 for --allow-polarity-inversion-{label}', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
			contrastColors: [{ label: 'text' }],
		})

		// Should use default value of 0 for allow-polarity-inversion
		expect(css).toContain('var(--allow-polarity-inversion-text, 0)')
	})

	it('shares chroma percentage across all contrast colors', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
			contrastColors: [{ label: 'text' }, { label: 'fill' }],
		})

		// Each contrast color should reference var(--_chr-pct)
		expect(css).toContain('--_con-chr-text: calc(')
		expect(css).toContain('var(--_chr-pct)')
		expect(css).toContain('--_con-chr-fill: calc(')
	})
})

describe('shared Y-bg', () => {
	it('should reference shared Y-bg for all contrast colors', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.orange',
			contrastColors: [{ label: 'text' }, { label: 'fill' }],
		})

		// Per-label Y-bg should reference shared Y-bg
		expect(css).toContain('--_Y-bg-text: var(--_Y-bg)')
		expect(css).toContain('--_Y-bg-fill: var(--_Y-bg)')
	})
})
