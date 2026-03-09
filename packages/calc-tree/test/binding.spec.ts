import { describe, expect, it } from 'vitest'
import { add, multiply, toExpression } from '../src/index.ts'

describe('binding', () => {
	describe('basic binding', () => {
		it('binds to constants', () => {
			const expr = multiply(2, 'x')
			const bound = expr.bind({ x: 3 })
			const result = bound.solve()

			expect(result).toBe(6)
		})

		it('removes bound reference from required refs', () => {
			const expr = add('x', 'y')
			const bound = expr.bind({ x: 5 })

			// Only needs 'y' now
			const result = bound.solve({ y: 10 })
			expect(result).toBe(15)
		})

		it('can bind multiple references by chaining', () => {
			const expr = add('x', 'y')
			const bound = expr.bind({ x: 10 }).bind({ y: 20 })
			const result = bound.solve()

			expect(result).toBe(30)
		})
	})

	describe('binding to expressions', () => {
		it('binds to other expressions', () => {
			const expr = add('x', 5)
			const yExpr = multiply('y', 2)
			const bound = expr.bind({ x: yExpr })

			// Now requires 'y' instead of 'x'
			const result = bound.solve({ y: 3 })
			expect(result).toBe(11) // (y * 2) + 5 = (3 * 2) + 5 = 11
		})

		it('merges references when binding to expressions', () => {
			const expr = add('a', 'b')
			const withE = expr.bind({ a: 'e' })

			// Now requires: b, e (a removed, e added)
			const result = withE.solve({ b: 5, e: 10 })
			expect(result).toBe(15)
		})

		it('adds new references when binding', () => {
			const expr = toExpression('x')
			const bound = expr.bind({ x: add('a', 'b') })

			// Now requires both a and b
			const result = bound.solve({ a: 1, b: 2 })
			expect(result).toBe(3)
		})
	})

	describe('nested binding', () => {
		it('handles deeply nested binding', () => {
			const expr = multiply(add('x', 1), add('y', 2))

			const step1 = expr.bind({ x: 'a' })
			const step2 = step1.bind({ y: 'b' })
			const step3 = step2.bind({ a: 3 })
			const step4 = step3.bind({ b: 4 })

			const result = step4.solve()
			// (3 + 1) * (4 + 2) = 4 * 6 = 24
			expect(result).toBe(24)
		})

		it('binding triggers partial evaluation', () => {
			// x + (2 * 3)
			const expr = add('x', multiply(2, 3))

			// The 2*3 should already be folded to 6
			const css = expr.toCss({ x: 'runtime' })
			expect(css.expression).toContain('6')
			expect(css.expression).not.toContain('2 *')
		})
	})

	describe('binding with same reference used multiple times', () => {
		it('replaces all occurrences', () => {
			const x = 'x'
			const expr = add(x, multiply(x, 2))
			// x + (x * 2) = 3x

			const bound = expr.bind({ x: 5 })
			const result = bound.solve()

			expect(result).toBe(15) // 5 + (5 * 2) = 15
		})
	})

	describe('variadic binding', () => {
		it('binds within variadic add', () => {
			const expr = add('x', 'y', 5)
			const bound = expr.bind({ x: 1 })
			const result = bound.solve({ y: 10 })
			expect(result).toBe(16)
		})

		it('produces correct CSS after binding variadic add', () => {
			const expr = add('x', 'y', 'z')
			const bound = expr.bind({ x: 10 })
			const css = bound.toCss({ y: 'y', z: 'z' })
			expect(css.expression).toBe('calc(10 + var(--y) + var(--z))')
		})
	})

	describe('CSS output after binding', () => {
		it('produces correct CSS after binding', () => {
			const expr = add('x', 'y')
			const bound = expr.bind({ x: 10 })

			const css = bound.toCss({ y: 'runtime' })
			expect(css.expression).toBe('calc(10 + var(--runtime))')
		})

		it('produces correct CSS when binding to expression', () => {
			const expr = add('x', 5)
			const bound = expr.bind({ x: multiply('y', 2) })

			const css = bound.toCss({ y: 'runtime' })
			expect(css.expression).toBe('calc(var(--runtime) * 2 + 5)')
		})
	})

	describe('record binding', () => {
		it('binds multiple values at once', () => {
			const expr = add('x', 'y')
			const bound = expr.bind({ x: 10, y: 20 })
			const result = bound.solve()

			expect(result).toBe(30)
		})

		it('removes all bound references from required refs', () => {
			const expr = add(add('a', 'b'), 'c')
			const bound = expr.bind({ a: 1, b: 2 })

			// Only needs 'c' now
			const result = bound.solve({ c: 3 })
			expect(result).toBe(6)
		})

		it('binds to expressions and merges refs', () => {
			const expr = add('x', 'y')
			const bound = expr.bind({
				x: multiply('a', 2),
				y: 'b',
			})

			// Now requires a and b instead of x and y
			const result = bound.solve({ a: 3, b: 4 })
			expect(result).toBe(10) // (3 * 2) + 4 = 10
		})

		it('produces correct CSS', () => {
			const expr = add(multiply('x', 'y'), 'z')
			const bound = expr.bind({ x: 2, y: 3 })

			const css = bound.toCss({ z: 'runtime' })
			expect(css.expression).toBe('calc(6 + var(--runtime))')
		})
	})
})
