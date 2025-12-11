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

		// Should contain build-time constants (new names)
		expect(css).toContain('--_lum-max:')
		expect(css).toContain('--_chr-peak:')

		// Should output the color
		expect(css).toContain('--o-color: oklch(')
		expect(css).toContain('30')
	})

	it('generates contrast CSS when contrast options provided', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.color',
			contrast: {
				mode: 'force-light',
			},
		})

		// Should contain contrast selector
		expect(css).toContain('.color.contrast {')

		// Should contain simplified Y calculation (new name)
		expect(css).toContain('--_Y-bg:')

		// Should output contrast color
		expect(css).toContain('--o-color-contrast: oklch(')
	})

	it('uses default contrast selector (&.contrast) when not provided', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.color',
			contrast: {
				mode: 'force-light',
			},
		})

		expect(css).toContain('.color.contrast {')
	})

	it('uses custom contrast selector when provided', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.color',
			contrast: {
				mode: 'force-light',
				selector: '&[data-contrast]',
			},
		})

		expect(css).toContain('.color[data-contrast] {')
	})

	it('handles non-nesting contrast selector', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.color',
			contrast: {
				mode: 'force-light',
				selector: '.has-contrast',
			},
		})

		expect(css).toContain('.color .has-contrast {')
	})

	it('handles complex selectors with combinators', () => {
		const css = generateColorCss({
			hue: 30,
			selector: 'div.color[data-theme="dark"]',
			contrast: {
				mode: 'force-light',
				selector: '&:hover',
			},
		})

		expect(css).toContain('div.color[data-theme="dark"]:hover {')
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
		expect(css).toContain('/* Tent function')
		expect(css).toContain('/* Gamut-mapped chroma')
		expect(css).toContain('/* Output color')
	})

	it('generates valid CSS property values', () => {
		const css = generateColorCss({
			hue: 200,
			selector: '[data-color]',
			contrast: {
				mode: 'prefer-light',
			},
		})

		// Check that numbers are properly formatted (no trailing zeros like "0.5000000000")
		const lMaxMatch = css.match(/--_lum-max:\s*([\d.]+)/)
		expect(lMaxMatch).not.toBeNull()
		if (lMaxMatch) {
			const lMax = lMaxMatch[1]
			expect(lMax).not.toMatch(/0{4,}$/)
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

	it('generates CSS without contrast when contrast option omitted', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.color',
		})

		// Should not contain contrast-specific variables (new names)
		expect(css).not.toContain('--o-color-contrast')
		expect(css).not.toContain('--_Y-bg:')
		expect(css).not.toContain('--_Y-dark')
		expect(css).not.toContain('--_Y-light')
	})
})

describe('generateColorCss output structure', () => {
	it('produces CSS with proper variable dependencies', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
		})

		// The tent function should reference lum-max (new name)
		expect(css).toContain('var(--_lum-max)')

		// The chroma calculation should reference chr-peak and tent (new names)
		expect(css).toContain('var(--_chr-peak)')
		expect(css).toContain('var(--_tent)')

		// The output should reference the computed values (new names)
		expect(css).toContain('var(--_lum-norm)')
		expect(css).toContain('var(--_chr)')
	})

	it('produces contrast CSS with APCA calculation chain for force-light', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: {
				mode: 'force-light',
			},
		})

		// Should have Y conversion (new name)
		expect(css).toContain('--_Y-bg:')

		// Should only have reverse polarity (--_Y-light) for force-light (lighter text, new names)
		expect(css).not.toContain('--_Y-dark:')
		expect(css).toContain('--_Y-light:')

		// Should have contrast lightness (simplified cube root, new name)
		expect(css).toContain('--_con-lum:')
	})

	it('produces contrast CSS with APCA calculation chain for force-dark', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: {
				mode: 'force-dark',
			},
		})

		// Should only have normal polarity (--_Y-dark) for force-dark (darker text, new names)
		expect(css).toContain('--_Y-dark:')
		expect(css).not.toContain('--_Y-light:')
	})

	it('produces contrast CSS with both polarities for prefer modes', () => {
		const cssPreferLight = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: {
				mode: 'prefer-light',
			},
		})

		// Should have both polarities for prefer-light (needs fallback, new names)
		expect(cssPreferLight).toContain('--_Y-dark:')
		expect(cssPreferLight).toContain('--_Y-light:')

		const cssPreferDark = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: {
				mode: 'prefer-dark',
			},
		})

		// Should have both polarities for prefer-dark (needs fallback, new names)
		expect(cssPreferDark).toContain('--_Y-dark:')
		expect(cssPreferDark).toContain('--_Y-light:')
	})

	it('includes heuristic correction boost in contrast CSS', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: {
				mode: 'prefer-light',
			},
		})

		// Should have heuristic boost calculations (new multiplicative approach)
		expect(css).toContain('--_boost-pct:')
		expect(css).toContain('--_boost-multiplicative:')
		expect(css).toContain('--_boost-absolute:')
		expect(css).toContain('--_contrast-adjusted:')
	})

	it('produces different output for each contrast mode', () => {
		const forceLight = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: { mode: 'force-light' },
		})

		const forceDark = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: { mode: 'force-dark' },
		})

		const preferLight = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: { mode: 'prefer-light' },
		})

		const preferDark = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: { mode: 'prefer-dark' },
		})

		// All should be unique
		expect(forceLight).not.toBe(forceDark)
		expect(forceLight).not.toBe(preferLight)
		expect(forceDark).not.toBe(preferDark)
	})
})
