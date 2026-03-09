import { describe, expect, it } from 'vitest'
import { add, multiply, pow, toExpression } from '../src/index.ts'

describe('property wrapping', () => {
	describe('basic wrapping', () => {
		it('wraps expression as property', () => {
			const expr = multiply('x', 2)

			// Evaluate before wrapping
			const result = expr.solve({ x: 5 })
			expect(result).toBe(10)
		})

		it('includes property declaration in CSS output', () => {
			const expr = multiply('x', 2).bind({ x: 'runtime' }).asProperty('doubled')

			const css = expr.toCss()

			expect(css.expression).toBe('var(--doubled)')
			expect(css.declarations).toHaveProperty('--doubled')
			expect(css.declarations['--doubled']).toBe('calc(var(--runtime) * 2)')
		})

		it('leaves unbound references as CSS variables', () => {
			const expr = add('x', 'y').asProperty('sum')

			const css = expr.toCss()

			expect(css.expression).toBe('var(--sum)')
			expect(css.declarations['--sum']).toBe('calc(var(--x) + var(--y))')
		})
	})

	describe('nested properties', () => {
		it('handles nested properties', () => {
			const inner = multiply('x', 2).bind({ x: 'runtime' }).asProperty('doubled')
			const outer = add(inner, 5).asProperty('result')

			const css = outer.toCss()

			expect(css.expression).toBe('var(--result)')
			expect(css.declarations).toHaveProperty('--doubled')
			expect(css.declarations).toHaveProperty('--result')
			expect(css.declarations['--doubled']).toBe('calc(var(--runtime) * 2)')
			expect(css.declarations['--result']).toBe('calc(var(--doubled) + 5)')
		})

		it('handles deeply nested properties', () => {
			const xSquared = pow('x', 2).asProperty('x-squared')
			const ySquared = pow('y', 2).asProperty('y-squared')
			const distance = pow(add(xSquared, ySquared), 0.5).asProperty('distance')

			const css = distance.toCss()

			expect(css.expression).toBe('var(--distance)')
			expect(Object.keys(css.declarations)).toHaveLength(3)
			expect(css.declarations).toHaveProperty('--x-squared')
			expect(css.declarations).toHaveProperty('--y-squared')
			expect(css.declarations).toHaveProperty('--distance')
		})

		it('collects declarations in correct order', () => {
			const a = toExpression('x').bind({ x: 'input' }).asProperty('a')
			const b = add(a, 1).asProperty('b')
			const c = multiply(b, 2).asProperty('c')

			const css = c.toCss()

			// All three properties should be declared
			expect(css.declarations['--a']).toBe('var(--input)')
			expect(css.declarations['--b']).toBe('calc(var(--a) + 1)')
			expect(css.declarations['--c']).toBe('calc(var(--b) * 2)')
		})
	})

	describe('property conflicts', () => {
		it('throws on property name conflicts with different values', () => {
			const prop1 = toExpression('x').asProperty('value')
			const prop2 = toExpression('y').asProperty('value')
			const expr = add(prop1, prop2)

			expect(() => {
				expr.toCss()
			}).toThrow(/property.*--value.*multiple times/i)
		})

		it('allows same property with same value', () => {
			const shared = toExpression('x').asProperty('shared')
			const expr = add(shared, shared)

			const css = expr.toCss()

			expect(css.expression).toBe('calc(var(--shared) + var(--shared))')
			expect(css.declarations['--shared']).toBe('var(--x)')
		})

		it('allows same property when resolved to same constant', () => {
			const shared = toExpression(42).asProperty('shared')
			const expr = add(shared, shared)

			const css = expr.toCss()

			expect(css.expression).toBe('calc(var(--shared) + var(--shared))')
			expect(css.declarations['--shared']).toBe('42')
		})
	})

	describe('binding with properties', () => {
		it('binding works before property wrapping', () => {
			const inner = add('x', 'y').bind({ x: 5, y: 10 }).asProperty('sum')
			const expr = multiply(inner, 'z')

			const result = expr.solve({ z: 2 })

			expect(result).toBe(30) // (5 + 10) * 2
		})

		it('binding updates property declarations', () => {
			const inner = add('x', 'y').bind({ x: 5 }).asProperty('sum')
			const expr = multiply(inner, 2)

			const css = expr.toCss()

			expect(css.declarations['--sum']).toBe('calc(5 + var(--y))')
		})
	})

	describe('integration', () => {
		it('generates CSS with complex nested properties', () => {
			const xSquared = pow('x', 2).asProperty('x2')
			const axSquared = multiply('a', xSquared).asProperty('ax2')
			const bx = multiply('b', 'x').asProperty('bx')
			const quadratic = add(axSquared, bx, 'c').asProperty('quadratic')

			const css = quadratic.toCss()

			expect(css.expression).toBe('var(--quadratic)')
			expect(css.declarations['--x2']).toBe('pow(var(--x), 2)')
			expect(css.declarations['--ax2']).toBe('calc(var(--a) * var(--x2))')
			expect(css.declarations['--bx']).toBe('calc(var(--b) * var(--x))')
			expect(css.declarations['--quadratic']).toBe('calc(var(--ax2) + var(--bx) + var(--c))')
		})
	})
})
