import { describe, expect, it } from 'vitest'
import { add, constant, multiply, power, reference } from '../src/index.ts'

describe('property wrapping', () => {
	describe('basic wrapping', () => {
		it('wraps expression as property', () => {
			const expr = multiply(reference('x'), constant(2))
			const wrapped = expr.asProperty('--doubled')

			// Can still evaluate normally
			const result = wrapped.evaluate({ x: constant(5) })
			expect.assert(result.type === 'number')
			expect(result.value).toBe(10)
		})

		it('includes property declaration in CSS output', () => {
			const expr = multiply(reference('x'), constant(2)).asProperty('--doubled')

			const result = expr.evaluate({ x: reference('runtime') })

			expect(result.css.expression).toBe('var(--doubled)')
			expect(result.css.declarations).toHaveProperty('--doubled')
			expect(result.css.declarations['--doubled']).toBe('var(--runtime) * 2')
		})

		it('preserves references through property wrapping', () => {
			const expr = add(reference('x'), reference('y')).asProperty('--sum')

			// Should still require both x and y
			const result = expr.evaluate({
				x: constant(5),
				y: constant(10),
			})

			expect.assert(result.type === 'number')
			expect(result.value).toBe(15)
		})
	})

	describe('nested properties', () => {
		it('handles nested properties', () => {
			const inner = multiply(reference('x'), constant(2)).asProperty('--doubled')
			const outer = add(inner, constant(5)).asProperty('--result')

			const result = outer.evaluate({ x: reference('runtime') })

			expect(result.css.expression).toBe('var(--result)')
			expect(result.css.declarations).toHaveProperty('--doubled')
			expect(result.css.declarations).toHaveProperty('--result')
			expect(result.css.declarations['--doubled']).toBe('var(--runtime) * 2')
			expect(result.css.declarations['--result']).toBe('var(--doubled) + 5')
		})

		it('handles deeply nested properties', () => {
			const xSquared = power(reference('x'), constant(2)).asProperty('--x-squared')
			const ySquared = power(reference('y'), constant(2)).asProperty('--y-squared')
			const distance = power(add(xSquared, ySquared), constant(0.5)).asProperty('--distance')

			const result = distance.evaluate({
				x: reference('x'),
				y: reference('y'),
			})

			expect(result.css.expression).toBe('var(--distance)')
			expect(Object.keys(result.css.declarations)).toHaveLength(3)
			expect(result.css.declarations).toHaveProperty('--x-squared')
			expect(result.css.declarations).toHaveProperty('--y-squared')
			expect(result.css.declarations).toHaveProperty('--distance')
		})

		it('collects declarations in correct order', () => {
			const a = reference('x').asProperty('--a')
			const b = add(a, constant(1)).asProperty('--b')
			const c = multiply(b, constant(2)).asProperty('--c')

			const result = c.evaluate({ x: reference('input') })

			// All three properties should be declared
			expect(result.css.declarations['--a']).toBe('var(--input)')
			expect(result.css.declarations['--b']).toBe('var(--a) + 1')
			expect(result.css.declarations['--c']).toBe('var(--b) * 2')
		})
	})

	describe('property conflicts', () => {
		it('throws on property name conflicts with different values', () => {
			const prop1 = reference('x').asProperty('--value')
			const prop2 = reference('y').asProperty('--value')
			const expr = add(prop1, prop2)

			expect(() => {
				expr.evaluate({ x: reference('a'), y: reference('b') })
			}).toThrow(/property.*--value.*multiple times/i)
		})

		it('allows same property with same value', () => {
			const shared = reference('x').asProperty('--shared')
			const expr = add(shared, shared)

			const result = expr.evaluate({ x: reference('runtime') })

			expect(result.css.expression).toBe('var(--shared) + var(--shared)')
			expect(result.css.declarations['--shared']).toBe('var(--runtime)')
		})

		it('allows same property when resolved to same constant', () => {
			const shared = constant(42).asProperty('--shared')
			const expr = add(shared, shared)

			const result = expr.evaluate()

			expect(result.css.expression).toBe('var(--shared) + var(--shared)')
			expect(result.css.declarations['--shared']).toBe('42')
		})
	})

	describe('binding with properties', () => {
		it('binding works with wrapped properties', () => {
			const inner = add(reference('x'), reference('y')).asProperty('--sum')
			const expr = multiply(inner, reference('z'))

			const bound = expr.bind('x', constant(5))
			const result = bound.evaluate({
				y: constant(10),
				z: constant(2),
			})

			expect.assert(result.type === 'number')
			expect(result.value).toBe(30) // (5 + 10) * 2
		})

		it('binding updates property declarations', () => {
			const inner = add(reference('x'), reference('y')).asProperty('--sum')
			const expr = multiply(inner, constant(2))

			const bound = expr.bind('x', constant(5))
			const result = bound.evaluate({ y: reference('runtime') })

			expect(result.css.declarations['--sum']).toBe('5 + var(--runtime)')
		})
	})

	describe('integration', () => {
		it('generates CSS with complex nested properties', () => {
			// Build a quadratic: ax^2 + bx + c
			const xSquared = power(reference('x'), constant(2)).asProperty('--x2')
			const axSquared = multiply(reference('a'), xSquared).asProperty('--ax2')
			const bx = multiply(reference('b'), reference('x')).asProperty('--bx')
			const quadratic = add(add(axSquared, bx), reference('c')).asProperty('--quadratic')

			const result = quadratic.evaluate({
				a: constant(1),
				b: constant(-3),
				c: constant(2),
				x: reference('input'),
			})

			expect(result.css.expression).toBe('var(--quadratic)')
			expect(result.css.declarations['--x2']).toBe('pow(var(--input), 2)')
			expect(result.css.declarations['--ax2']).toBe('1 * var(--x2)')
			expect(result.css.declarations['--bx']).toBe('-3 * var(--input)')
			expect(result.css.declarations['--quadratic']).toBe('var(--ax2) + var(--bx) + 2')
		})
	})
})
