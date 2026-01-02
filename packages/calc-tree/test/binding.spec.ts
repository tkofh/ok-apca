import { describe, expect, it } from 'vitest'
import { add, constant, multiply, reference } from '../src/index.ts'

describe('binding', () => {
	describe('basic binding', () => {
		it('binds to constants', () => {
			const expr = multiply(constant(2), reference('x'))
			const bound = expr.bind('x', constant(3))
			const result = bound.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBe(6)
		})

		it('removes bound reference from required refs', () => {
			const expr = add(reference('x'), reference('y'))
			const bound = expr.bind('x', constant(5))

			// Only needs 'y' now
			const result = bound.evaluate({ y: constant(10) })
			expect.assert(result.type === 'number')
			expect(result.value).toBe(15)
		})

		it('can bind multiple references by chaining', () => {
			const expr = add(reference('x'), reference('y'))
			const bound = expr.bind('x', constant(10)).bind('y', constant(20))
			const result = bound.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBe(30)
		})
	})

	describe('binding to expressions', () => {
		it('binds to other expressions', () => {
			const expr = add(reference('x'), constant(5))
			const yExpr = multiply(reference('y'), constant(2))
			const bound = expr.bind('x', yExpr)

			// Now requires 'y' instead of 'x'
			const result = bound.evaluate({ y: constant(3) })
			expect.assert(result.type === 'number')
			expect(result.value).toBe(11) // (y * 2) + 5 = (3 * 2) + 5 = 11
		})

		it('merges references when binding to expressions', () => {
			const expr = add(reference('a'), reference('b'))
			const withE = expr.bind('a', reference('e'))

			// Now requires: b, e (a removed, e added)
			const result = withE.evaluate({ b: constant(5), e: constant(10) })
			expect.assert(result.type === 'number')
			expect(result.value).toBe(15)
		})

		it('adds new references when binding', () => {
			const expr = reference('x')
			const bound = expr.bind('x', add(reference('a'), reference('b')))

			// Now requires both a and b
			const result = bound.evaluate({ a: constant(1), b: constant(2) })
			expect.assert(result.type === 'number')
			expect(result.value).toBe(3)
		})
	})

	describe('nested binding', () => {
		it('handles deeply nested binding', () => {
			const expr = multiply(add(reference('x'), constant(1)), add(reference('y'), constant(2)))

			const step1 = expr.bind('x', reference('a'))
			const step2 = step1.bind('y', reference('b'))
			const step3 = step2.bind('a', constant(3))
			const step4 = step3.bind('b', constant(4))

			const result = step4.evaluate()
			expect.assert(result.type === 'number')
			// (3 + 1) * (4 + 2) = 4 * 6 = 24
			expect(result.value).toBe(24)
		})

		it('binding triggers partial evaluation', () => {
			// x + (2 * 3)
			const expr = add(reference('x'), multiply(constant(2), constant(3)))

			// The 2*3 should already be folded to 6
			const result = expr.evaluate({ x: reference('runtime') })
			expect(result.css.expression).toContain('6')
			expect(result.css.expression).not.toContain('2 *')
		})
	})

	describe('binding with same reference used multiple times', () => {
		it('replaces all occurrences', () => {
			const x = reference('x')
			const expr = add(x, multiply(x, constant(2)))
			// x + (x * 2) = 3x

			const bound = expr.bind('x', constant(5))
			const result = bound.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBe(15) // 5 + (5 * 2) = 15
		})
	})

	describe('CSS output after binding', () => {
		it('produces correct CSS after binding', () => {
			const expr = add(reference('x'), reference('y'))
			const bound = expr.bind('x', constant(10))

			const result = bound.evaluate({ y: reference('runtime') })
			expect(result.css.expression).toBe('10 + var(--runtime)')
		})

		it('produces correct CSS when binding to expression', () => {
			const expr = add(reference('x'), constant(5))
			const bound = expr.bind('x', multiply(reference('y'), constant(2)))

			const result = bound.evaluate({ y: reference('runtime') })
			expect(result.css.expression).toBe('var(--runtime) * 2 + 5')
		})
	})
})
