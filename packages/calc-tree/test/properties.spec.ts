import { describe, expect, it } from 'vitest'
import { constant, reference } from '../src/constructors.ts'
import { add, multiply, pow, property } from '../src/index.ts'

describe('property wrapping', () => {
	describe('basic wrapping', () => {
		it('wraps expression as property', () => {
			const expr = multiply('x', 2)

			// Evaluate before wrapping
			const result = expr.solve({ x: 5 })
			expect(result).toBe(10)
		})

		it('includes property declaration in CSS output', () => {
			const expr = property('doubled', multiply('x', 2).bind({ x: 'runtime' }))

			const css = expr.toCss()

			expect(css.expression).toBe('var(--doubled)')
			expect(css.declarations).toHaveProperty('--doubled')
			expect(css.declarations['--doubled']).toBe('calc(var(--runtime) * 2)')
		})

		it('leaves unbound references as CSS variables', () => {
			const expr = property('sum', add('x', 'y'))

			const css = expr.toCss()

			expect(css.expression).toBe('var(--sum)')
			expect(css.declarations['--sum']).toBe('calc(var(--x) + var(--y))')
		})
	})

	describe('nested properties', () => {
		it('handles nested properties', () => {
			const inner = property('doubled', multiply('x', 2).bind({ x: 'runtime' }))
			const outer = property('result', add(inner, 5))

			const css = outer.toCss()

			expect(css.expression).toBe('var(--result)')
			expect(css.declarations).toHaveProperty('--doubled')
			expect(css.declarations).toHaveProperty('--result')
			expect(css.declarations['--doubled']).toBe('calc(var(--runtime) * 2)')
			expect(css.declarations['--result']).toBe('calc(var(--doubled) + 5)')
		})

		it('handles deeply nested properties', () => {
			const xSquared = property('x-squared', pow('x', 2))
			const ySquared = property('y-squared', pow('y', 2))
			const distance = property('distance', pow(add(xSquared, ySquared), 0.5))

			const css = distance.toCss()

			expect(css.expression).toBe('var(--distance)')
			expect(Object.keys(css.declarations)).toHaveLength(3)
			expect(css.declarations).toHaveProperty('--x-squared')
			expect(css.declarations).toHaveProperty('--y-squared')
			expect(css.declarations).toHaveProperty('--distance')
		})

		it('collects declarations in correct order', () => {
			const a = property('a', reference('x').bind({ x: 'input' }))
			const b = property('b', add(a, 1))
			const c = property('c', multiply(b, 2))

			const css = c.toCss()

			// All three properties should be declared
			expect(css.declarations['--a']).toBe('var(--input)')
			expect(css.declarations['--b']).toBe('calc(var(--a) + 1)')
			expect(css.declarations['--c']).toBe('calc(var(--b) * 2)')
		})
	})

	describe('property conflicts', () => {
		it('throws on property name conflicts with different values', () => {
			const prop1 = property('value', reference('x'))
			const prop2 = property('value', reference('y'))
			const expr = add(prop1, prop2)

			expect(() => {
				expr.toCss()
			}).toThrow(/property.*--value.*multiple times/i)
		})

		it('allows same property with same value', () => {
			const shared = property('shared', reference('x'))
			const expr = add(shared, shared)

			const css = expr.toCss()

			expect(css.expression).toBe('calc(var(--shared) + var(--shared))')
			expect(css.declarations['--shared']).toBe('var(--x)')
		})

		it('allows same property when resolved to same constant', () => {
			const shared = property('shared', constant(42))
			const expr = add(shared, shared)

			const css = expr.toCss()

			expect(css.expression).toBe('calc(var(--shared) + var(--shared))')
			expect(css.declarations['--shared']).toBe('42')
		})
	})

	describe('binding with properties', () => {
		it('binding works before property wrapping', () => {
			const inner = property('sum', add('x', 'y').bind({ x: 5, y: 10 }))
			const expr = multiply(inner, 'z')

			const result = expr.solve({ z: 2 })

			expect(result).toBe(30) // (5 + 10) * 2
		})

		it('binding updates property declarations', () => {
			const inner = property('sum', add('x', 'y').bind({ x: 5 }))
			const expr = multiply(inner, 2)

			const css = expr.toCss()

			expect(css.declarations['--sum']).toBe('calc(5 + var(--y))')
		})
	})

	describe('integration', () => {
		it('generates CSS with complex nested properties', () => {
			const xSquared = property('x2', pow('x', 2))
			const axSquared = property('ax2', multiply('a', xSquared))
			const bx = property('bx', multiply('b', 'x'))
			const quadratic = property('quadratic', add(axSquared, bx, 'c'))

			const css = quadratic.toCss()

			expect(css.expression).toBe('var(--quadratic)')
			expect(css.declarations['--x2']).toBe('pow(var(--x), 2)')
			expect(css.declarations['--ax2']).toBe('calc(var(--a) * var(--x2))')
			expect(css.declarations['--bx']).toBe('calc(var(--b) * var(--x))')
			expect(css.declarations['--quadratic']).toBe('calc(var(--ax2) + var(--bx) + var(--c))')
		})
	})
})
