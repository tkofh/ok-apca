import { describe, expect, it } from 'vitest'
import { resolveColorSet } from '../../src/config.ts'
import { defineColors } from '../../src/index.ts'

describe('defineColors validation', () => {
	it('validates role names - rejects invalid formats', () => {
		expect(() =>
			defineColors({
				hues: [{ name: 'red', hue: 30, selector: '.red' }],
				roles: [{ name: '1text' }],
			}),
		).toThrow(/Invalid role name/)

		expect(() =>
			defineColors({
				hues: [{ name: 'red', hue: 30, selector: '.red' }],
				roles: [{ name: 'text color' }],
			}),
		).toThrow(/Invalid role name/)

		expect(() =>
			defineColors({
				hues: [{ name: 'red', hue: 30, selector: '.red' }],
				roles: [{ name: 'text!' }],
			}),
		).toThrow(/Invalid role name/)
	})

	it('validates role names - accepts valid formats', () => {
		expect(() =>
			defineColors({
				hues: [{ name: 'red', hue: 30, selector: '.red' }],
				roles: [{ name: 'text' }, { name: 'fill-color' }, { name: 'stroke_2' }],
			}),
		).not.toThrow()
	})

	it('validates unique role names', () => {
		expect(() =>
			defineColors({
				hues: [{ name: 'red', hue: 30, selector: '.red' }],
				roles: [{ name: 'text' }, { name: 'text' }],
			}),
		).toThrow(/Duplicate role name/)
	})

	it('validates hue names', () => {
		expect(() =>
			defineColors({
				hues: [{ name: '1bad', hue: 30, selector: '.bad' }],
				roles: [{ name: 'fill' }],
			}),
		).toThrow(/Invalid hue name/)

		expect(() =>
			defineColors({
				hues: [
					{ name: 'red', hue: 30, selector: '.red' },
					{ name: 'red', hue: 60, selector: '.red2' },
				],
				roles: [{ name: 'fill' }],
			}),
		).toThrow(/Duplicate hue name/)
	})

	it('defaults hue name and selector from hue angle', () => {
		const resolved = resolveColorSet({
			hues: [{ hue: 30 }],
			roles: [{ name: 'fill' }],
		})

		expect(resolved.hues[0].name).toBe('hue-30')
		expect(resolved.hues[0].selector).toBe('.hue-30')
	})

	it('defaults hue selector from name', () => {
		const resolved = resolveColorSet({
			hues: [{ hue: 30, name: 'warm' }],
			roles: [{ name: 'fill' }],
		})

		expect(resolved.hues[0].selector).toBe('.warm')
	})

	it('normalizes hue angle to [0, 360)', () => {
		const resolved = resolveColorSet({
			hues: [
				{ hue: -30, name: 'neg' },
				{ hue: 390, name: 'over' },
				{ hue: 720, name: 'wrap' },
			],
			roles: [{ name: 'fill' }],
		})

		expect(resolved.hues[0].hue).toBe(330)
		expect(resolved.hues[1].hue).toBe(30)
		expect(resolved.hues[2].hue).toBe(0)
	})

	it('requires at least one active role', () => {
		expect(() =>
			defineColors({
				hues: [{ name: 'red', hue: 30, selector: '.red' }],
				roles: [{ name: 'focus', passive: true }],
			}),
		).toThrow(/At least one active role/)
	})

	it('validates contrastsWith references exist', () => {
		expect(() =>
			defineColors({
				hues: [{ name: 'red', hue: 30, selector: '.red' }],
				roles: [{ name: 'fill' }, { name: 'text', contrastsWith: ['nonexistent'] }],
			}),
		).toThrow(/references unknown role/)
	})

	it('validates contrastsWith does not self-reference', () => {
		expect(() =>
			defineColors({
				hues: [{ name: 'red', hue: 30, selector: '.red' }],
				roles: [{ name: 'fill', contrastsWith: ['fill'] }],
			}),
		).toThrow(/must not reference itself/)
	})

	it('silently deduplicates contrastsWith entries', () => {
		expect(() =>
			defineColors({
				hues: [{ name: 'red', hue: 30, selector: '.red' }],
				roles: [{ name: 'fill', contrastsWith: ['text', 'text'] }, { name: 'text' }],
			}),
		).not.toThrow()
	})
})

describe('defineColors API', () => {
	it('returns css string', () => {
		const { css } = defineColors({
			hues: [{ name: 'red', hue: 30, selector: '.red' }],
			roles: [{ name: 'fill' }, { name: 'text' }],
		})

		expect(typeof css).toBe('string')
		expect(css.length).toBeGreaterThan(0)
	})

	it('includes role selectors in output', () => {
		const { css } = defineColors({
			hues: [{ name: 'red', hue: 30, selector: '.red' }],
			roles: [{ name: 'fill' }, { name: 'text' }],
		})

		expect(css).toContain('.fill')
		expect(css).toContain('.text')
	})

	it('uses custom role selectors', () => {
		const { css } = defineColors({
			hues: [{ name: 'red', hue: 30, selector: '.red' }],
			roles: [
				{ name: 'fill', selector: '.my-fill' },
				{ name: 'text', selector: '.my-text' },
			],
		})

		expect(css).toContain('.my-fill')
		expect(css).toContain('.my-text')
	})

	it('defaults role selector to .{name}', () => {
		const { css } = defineColors({
			hues: [{ name: 'red', hue: 30, selector: '.red' }],
			roles: [{ name: 'fill' }],
		})

		expect(css).toContain('.fill')
	})

	it('includes hue selector in output', () => {
		const { css } = defineColors({
			hues: [{ name: 'primary', hue: 30, selector: '[data-color="primary"]' }],
			roles: [{ name: 'fill' }],
		})

		expect(css).toContain('[data-color="primary"]')
	})

	it('uses custom name in CSS variable names', () => {
		const { css } = defineColors({
			prefix: 'theme',
			hues: [{ name: 'red', hue: 30, selector: '.red' }],
			roles: [{ name: 'fill' }, { name: 'text' }],
		})

		expect(css).toContain('--theme-fill')
		expect(css).toContain('--theme-text')
		expect(css).not.toContain('--color-')
	})

	it('generates valid CSS number formatting', () => {
		const { css } = defineColors({
			hues: [{ name: 'blue', hue: 200, selector: '.blue' }],
			roles: [{ name: 'fill' }, { name: 'text' }],
		})

		// Numbers should not have excessive decimal places (max 5)
		const longDecimals = css.match(/\d+\.\d{6,}/g)
		expect(longDecimals).toBeNull()
	})

	it('generates different hue selectors for different hues', () => {
		const { css } = defineColors({
			hues: [
				{ name: 'warm', hue: 30, selector: '.warm' },
				{ name: 'cool', hue: 180, selector: '.cool' },
			],
			roles: [{ name: 'fill' }],
		})

		expect(css).toContain('.warm')
		expect(css).toContain('.cool')
	})

	it('namespaces internal properties with name', () => {
		const { css } = defineColors({
			prefix: 'theme',
			hues: [{ name: 'red', hue: 30, selector: '.red' }],
			roles: [{ name: 'fill' }, { name: 'text' }],
		})

		expect(css).toContain('--_theme-')
		expect(css).not.toContain('--_color-')
	})

	it('returns hue metadata', () => {
		const system = defineColors({
			hues: [
				{ name: 'red', hue: 25, selector: '.red' },
				{ name: 'blue', hue: 240, selector: '.blue' },
			],
			roles: [{ name: 'fill' }],
		})

		expect(system.hues).toHaveLength(2)
		expect(system.hues[0].name).toBe('red')
		expect(system.hues[0].hue).toBe(25)
		expect(system.hues[0].slice).toBeDefined()
		expect(system.hues[1].name).toBe('blue')
	})

	it('does not generate contrast output for passive roles', () => {
		const { css } = defineColors({
			hues: [{ name: 'red', hue: 30, selector: '.red' }],
			roles: [{ name: 'fill' }, { name: 'focus', passive: true }],
		})

		// Passive roles should not get their own selector block
		expect(css).not.toMatch(/^\.focus\s*\{/m)
		// But focus should appear as a contrast output inside .fill
		expect(css).toContain('--color-focus')
	})

	it('respects contrastsWith filtering', () => {
		const resolved = resolveColorSet({
			hues: [{ name: 'red', hue: 30, selector: '.red' }],
			roles: [
				{ name: 'fill' },
				{ name: 'text', contrastsWith: ['fill'] },
				{ name: 'icon', contrastsWith: ['fill'] },
			],
		})

		const fill = resolved.roles.find((r) => r.name === 'fill')!
		const text = resolved.roles.find((r) => r.name === 'text')!
		const icon = resolved.roles.find((r) => r.name === 'icon')!

		// text and icon both declare they appear on fill
		expect(fill.contrastTargets).toContain('text')
		expect(fill.contrastTargets).toContain('icon')

		// fill has no contrastsWith → appears on all others
		// text/icon only listed fill, so they don't appear on each other
		expect(text.contrastTargets).toEqual(['fill'])
		expect(icon.contrastTargets).toEqual(['fill'])
	})

	it('contrastsWith defaults to all other active roles', () => {
		const resolved = resolveColorSet({
			hues: [{ hue: 30 }],
			roles: [{ name: 'fill' }, { name: 'text' }, { name: 'border' }],
		})

		for (const role of resolved.roles) {
			const otherNames = resolved.roles
				.filter((r) => r.name !== role.name)
				.map((r) => r.name)
			expect(role.contrastTargets).toEqual(otherNames)
		}
	})

	it('passive role with contrastsWith appears only on listed active roles', () => {
		const resolved = resolveColorSet({
			hues: [{ hue: 30 }],
			roles: [
				{ name: 'fill' },
				{ name: 'text' },
				{ name: 'focus', passive: true, contrastsWith: ['fill'] },
			],
		})

		const fill = resolved.roles.find((r) => r.name === 'fill')!
		const text = resolved.roles.find((r) => r.name === 'text')!

		// focus declared it appears on fill only
		expect(fill.contrastTargets).toContain('focus')
		expect(text.contrastTargets).not.toContain('focus')
	})

	it('passive role without contrastsWith appears on all active roles', () => {
		const resolved = resolveColorSet({
			hues: [{ hue: 30 }],
			roles: [
				{ name: 'fill' },
				{ name: 'text' },
				{ name: 'focus', passive: true },
			],
		})

		const fill = resolved.roles.find((r) => r.name === 'fill')!
		const text = resolved.roles.find((r) => r.name === 'text')!

		expect(fill.contrastTargets).toContain('focus')
		expect(text.contrastTargets).toContain('focus')
	})

	it('supports multiple sets', () => {
		const [surface, accent] = defineColors([
			{
				prefix: 'surface',
				hues: [{ name: 'red', hue: 25, selector: '.surface-red' }],
				roles: [
					{ name: 'fill', selector: '.surface-fill' },
					{ name: 'text', selector: '.surface-text' },
				],
			},
			{
				prefix: 'accent',
				hues: [{ name: 'blue', hue: 240, selector: '.accent-blue' }],
				roles: [
					{ name: 'fill', selector: '.accent-fill' },
					{ name: 'text', selector: '.accent-text' },
				],
			},
		])

		expect(surface.css).toContain('--surface-fill')
		expect(surface.css).toContain('--surface-text')
		expect(accent.css).toContain('--accent-fill')
		expect(accent.css).toContain('--accent-text')
	})

	it('generates hue selectors with :is() nesting', () => {
		const { css } = defineColors({
			hues: [{ name: 'red', hue: 30, selector: '.red' }],
			roles: [{ name: 'fill' }, { name: 'text' }],
		})

		expect(css).toContain(':is(&, & *):is(.fill, .text)')
	})
})
