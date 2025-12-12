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
				allowPolarityInversion: false,
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
				allowPolarityInversion: false,
			},
		})

		expect(css).toContain('.color.contrast {')
	})

	it('uses custom contrast selector when provided', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.color',
			contrast: {
				allowPolarityInversion: false,
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
				allowPolarityInversion: false,
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
				allowPolarityInversion: false,
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
		expect(css).toContain('/* Chroma as percentage')
		expect(css).toContain('/* Output color')
	})

	it('generates valid CSS property values', () => {
		const css = generateColorCss({
			hue: 200,
			selector: '[data-color]',
			contrast: {
				allowPolarityInversion: true,
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

	it('produces contrast CSS with APCA calculation chain', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: {
				allowPolarityInversion: false,
			},
		})

		// Should have Y conversion (new name)
		expect(css).toContain('--_Y-bg:')

		// Should always have both polarities (unified approach)
		expect(css).toContain('--_Y-dark:')
		expect(css).toContain('--_Y-light:')

		// Should have contrast lightness (simplified cube root, new name)
		expect(css).toContain('--_con-lum:')
	})

	it('produces contrast CSS with both polarities', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: {
				allowPolarityInversion: true,
			},
		})

		// Should always have both polarities for runtime selection
		expect(css).toContain('--_Y-dark:')
		expect(css).toContain('--_Y-light:')

		// Should have polarity selection logic
		expect(css).toContain('--_use-light:')
		expect(css).toContain('--_prefer-light:')
		expect(css).toContain('--_prefer-dark:')
	})

	it('includes heuristic correction boost in contrast CSS', () => {
		const css = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: {
				allowPolarityInversion: true,
			},
		})

		// Should have heuristic boost calculations (new multiplicative approach)
		expect(css).toContain('--_boost-pct:')
		expect(css).toContain('--_boost-multiplicative:')
		expect(css).toContain('--_boost-absolute:')
		expect(css).toContain('--_contrast-adjusted:')
	})

	it('produces output with or without inversion settings', () => {
		const withInversion = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: { allowPolarityInversion: true },
		})

		const withoutInversion = generateColorCss({
			hue: 60,
			selector: '.test',
			contrast: { allowPolarityInversion: false },
		})

		// Both should generate valid CSS with contrast
		expect(withInversion).toContain('--o-color-contrast:')
		expect(withoutInversion).toContain('--o-color-contrast:')

		// Different inversion settings may produce identical or different heuristic coefficients
		// depending on the hue, so we just verify both work
		expect(withInversion.length).toBeGreaterThan(0)
		expect(withoutInversion.length).toBeGreaterThan(0)
	})
})

describe('polarity-fixed feature', () => {
	it('should generate .polarity-fixed nested selector', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.orange',
			contrast: { allowPolarityInversion: true },
		})
		expect(css).toContain('&.polarity-fixed')
		expect(css).toContain('--_polarity-lum-norm')
	})

	it('should use --polarity-from with fallback to --lightness', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.orange',
			contrast: { allowPolarityInversion: true },
		})
		expect(css).toContain('var(--polarity-from, var(--lightness))')
	})

	it('should override --_Y-bg inside .polarity-fixed', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.orange',
			contrast: { allowPolarityInversion: true },
		})
		const lines = css.split('\n')
		const fixedBlockStart = lines.findIndex((l) => l.includes('&.polarity-fixed'))
		const fixedBlockEnd = lines.findIndex((l, i) => i > fixedBlockStart && l.trim() === '}')
		const fixedBlock = lines.slice(fixedBlockStart, fixedBlockEnd + 1).join('\n')

		expect(fixedBlock).toContain('--_Y-bg')
		expect(fixedBlock).toContain('--_polarity-lum-norm')
	})

	it('should normalize --polarity-from with clamp to 0-1 range', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.orange',
			contrast: { allowPolarityInversion: true },
		})
		const lines = css.split('\n')
		const fixedBlockStart = lines.findIndex((l) => l.includes('&.polarity-fixed'))
		const fixedBlockEnd = lines.findIndex((l, i) => i > fixedBlockStart && l.trim() === '}')
		const fixedBlock = lines.slice(fixedBlockStart, fixedBlockEnd + 1).join('\n')

		expect(fixedBlock).toContain('clamp(0, var(--polarity-from, var(--lightness)) / 100, 1)')
	})

	it('should include polarity-fixed in contrast CSS regardless of allowPolarityInversion setting', () => {
		const cssWithInversion = generateColorCss({
			hue: 30,
			selector: '.orange',
			contrast: { allowPolarityInversion: true },
		})
		const cssWithoutInversion = generateColorCss({
			hue: 30,
			selector: '.orange',
			contrast: { allowPolarityInversion: false },
		})

		expect(cssWithInversion).toContain('&.polarity-fixed')
		expect(cssWithoutInversion).toContain('&.polarity-fixed')
	})

	it('should not include polarity-fixed when contrast is not enabled', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.orange',
		})

		expect(css).not.toContain('&.polarity-fixed')
		expect(css).not.toContain('--_polarity-lum-norm')
	})
})

describe('pulse feature', () => {
	it('should generate @property declaration for --_pulse-time', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.orange',
		})
		expect(css).toContain('@property --_pulse-time')
		expect(css).toContain('syntax: "<number>"')
		expect(css).toContain('initial-value: 0')
	})

	it('should generate .pulse nested selector in base color', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.orange',
		})
		expect(css).toContain('&.pulse')
		expect(css).toContain('--pulse-frequency')
		expect(css).toContain('--pulse-lightness-offset')
		expect(css).toContain('--pulse-chroma-offset')
	})

	it('should include pulse animation and keyframes', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.orange',
		})
		expect(css).toContain('animation: pulse-animation')
		expect(css).toContain('@keyframes pulse-animation')
		expect(css).toContain('--_pulse-time: 0')
		expect(css).toContain('--_pulse-time: 1')
	})

	it('should override --_lum-norm and --_chr-pct inside .pulse', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.orange',
		})
		const lines = css.split('\n')
		const pulseBlockStart = lines.findIndex((l) => l.includes('&.pulse'))
		const pulseBlockEnd = lines.findIndex((l, i) => i > pulseBlockStart && l.trim() === '}')
		const pulseBlock = lines.slice(pulseBlockStart, pulseBlockEnd + 1).join('\n')

		expect(pulseBlock).toContain('--_lum-norm:')
		expect(pulseBlock).toContain('--_chr-pct:')
		expect(pulseBlock).toContain('var(--_pulse-time)')
	})

	it('should not include .pulse in contrast selector', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.orange',
			contrast: { allowPolarityInversion: true },
		})
		const lines = css.split('\n')
		const contrastBlockStart = lines.findIndex((l) => l.includes('.orange.contrast {'))
		const contrastBlockEnd = lines.findIndex((l, i) => i > contrastBlockStart && l === '}')
		const contrastBlock = lines.slice(contrastBlockStart, contrastBlockEnd + 1).join('\n')

		expect(contrastBlock).not.toContain('&.pulse')
	})

	it('should use default pulse values', () => {
		const css = generateColorCss({
			hue: 30,
			selector: '.orange',
		})
		expect(css).toContain('--pulse-frequency: 1')
		expect(css).toContain('--pulse-lightness-offset: 0')
		expect(css).toContain('--pulse-chroma-offset: 0')
	})

	it('should always include pulse regardless of contrast option', () => {
		const cssWithContrast = generateColorCss({
			hue: 30,
			selector: '.orange',
			contrast: { allowPolarityInversion: true },
		})
		const cssWithoutContrast = generateColorCss({
			hue: 30,
			selector: '.orange',
		})

		expect(cssWithContrast).toContain('&.pulse')
		expect(cssWithoutContrast).toContain('&.pulse')
	})
})
