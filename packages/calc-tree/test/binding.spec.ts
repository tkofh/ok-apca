import { describe, expect, it } from 'vitest'
import { reference } from '../src/expression.ts'
import { Calc } from '../src/index.ts'

describe('binding', () => {
	describe('basic binding', () => {
		it('binds to constants', () => {
			const expr = Calc.multiply(2, 'x')
			const bound = Calc.bind(expr, { x: 3 })
			const result = Calc.solve(bound)

			expect(result).toBe(6)
		})

		it('removes bound reference from required refs', () => {
			const expr = Calc.add('x', 'y')
			const bound = Calc.bind(expr, { x: 5 })

			// Only needs 'y' now
			const result = Calc.solve(bound, { y: 10 })
			expect(result).toBe(15)
		})

		it('can bind multiple references by chaining', () => {
			const expr = Calc.add('x', 'y')
			const bound = Calc.bind(Calc.bind(expr, { x: 10 }), { y: 20 })
			const result = Calc.solve(bound)

			expect(result).toBe(30)
		})
	})

	describe('binding to expressions', () => {
		it('binds to other expressions', () => {
			const expr = Calc.add('x', 5)
			const yExpr = Calc.multiply('y', 2)
			const bound = Calc.bind(expr, { x: yExpr })

			// Now requires 'y' instead of 'x'
			const result = Calc.solve(bound, { y: 3 })
			expect(result).toBe(11) // (y * 2) + 5 = (3 * 2) + 5 = 11
		})

		it('merges references when binding to expressions', () => {
			const expr = Calc.add('a', 'b')
			const withE = Calc.bind(expr, { a: 'e' })

			// Now requires: b, e (a removed, e added)
			const result = Calc.solve(withE, { b: 5, e: 10 })
			expect(result).toBe(15)
		})

		it('adds new references when binding', () => {
			const expr = reference('x')
			const bound = Calc.bind(expr, { x: Calc.add('a', 'b') })

			// Now requires both a and b
			const result = Calc.solve(bound, { a: 1, b: 2 })
			expect(result).toBe(3)
		})
	})

	describe('nested binding', () => {
		it('handles deeply nested binding', () => {
			const expr = Calc.multiply(Calc.add('x', 1), Calc.add('y', 2))

			const step1 = Calc.bind(expr, { x: 'a' })
			const step2 = Calc.bind(step1, { y: 'b' })
			const step3 = Calc.bind(step2, { a: 3 })
			const step4 = Calc.bind(step3, { b: 4 })

			const result = Calc.solve(step4)
			// (3 + 1) * (4 + 2) = 4 * 6 = 24
			expect(result).toBe(24)
		})

		it('binding triggers partial evaluation', () => {
			// x + (2 * 3)
			const expr = Calc.add('x', Calc.multiply(2, 3))

			// The 2*3 should already be folded to 6
			const css = Calc.serialize(Calc.bind(expr, { x: 'runtime' }))
			expect(css).toContain('6')
			expect(css).not.toContain('2 *')
		})
	})

	describe('binding with same reference used multiple times', () => {
		it('replaces all occurrences', () => {
			const x = 'x'
			const expr = Calc.add(x, Calc.multiply(x, 2))
			// x + (x * 2) = 3x

			const bound = Calc.bind(expr, { x: 5 })
			const result = Calc.solve(bound)

			expect(result).toBe(15) // 5 + (5 * 2) = 15
		})
	})

	describe('variadic binding', () => {
		it('binds within variadic add', () => {
			const expr = Calc.add('x', 'y', 5)
			const bound = Calc.bind(expr, { x: 1 })
			const result = Calc.solve(bound, { y: 10 })
			expect(result).toBe(16)
		})

		it('produces correct CSS after binding variadic add', () => {
			const expr = Calc.add('x', 'y', 'z')
			const bound = Calc.bind(expr, { x: 10 })
			const css = Calc.serialize(Calc.bind(bound, { y: 'y', z: 'z' }))
			expect(css).toBe('calc(10 + var(--y) + var(--z))')
		})
	})

	describe('CSS output after binding', () => {
		it('produces correct CSS after binding', () => {
			const expr = Calc.add('x', 'y')
			const bound = Calc.bind(expr, { x: 10 })

			const css = Calc.serialize(Calc.bind(bound, { y: 'runtime' }))
			expect(css).toBe('calc(10 + var(--runtime))')
		})

		it('produces correct CSS when binding to expression', () => {
			const expr = Calc.add('x', 5)
			const bound = Calc.bind(expr, { x: Calc.multiply('y', 2) })

			const css = Calc.serialize(Calc.bind(bound, { y: 'runtime' }))
			expect(css).toBe('calc(var(--runtime) * 2 + 5)')
		})
	})

	describe('record binding', () => {
		it('binds multiple values at once', () => {
			const expr = Calc.add('x', 'y')
			const bound = Calc.bind(expr, { x: 10, y: 20 })
			const result = Calc.solve(bound)

			expect(result).toBe(30)
		})

		it('removes all bound references from required refs', () => {
			const expr = Calc.add(Calc.add('a', 'b'), 'c')
			const bound = Calc.bind(expr, { a: 1, b: 2 })

			// Only needs 'c' now
			const result = Calc.solve(bound, { c: 3 })
			expect(result).toBe(6)
		})

		it('binds to expressions and merges refs', () => {
			const expr = Calc.add('x', 'y')
			const bound = Calc.bind(expr, {
				x: Calc.multiply('a', 2),
				y: 'b',
			})

			// Now requires a and b instead of x and y
			const result = Calc.solve(bound, { a: 3, b: 4 })
			expect(result).toBe(10) // (3 * 2) + 4 = 10
		})

		it('produces correct CSS', () => {
			const expr = Calc.add(Calc.multiply('x', 'y'), 'z')
			const bound = Calc.bind(expr, { x: 2, y: 3 })

			const css = Calc.serialize(Calc.bind(bound, { z: 'runtime' }))
			expect(css).toBe('calc(6 + var(--runtime))')
		})
	})

	describe('excess properties', () => {
		it('bind ignores excess properties', () => {
			const expr = Calc.add('x', 'y')
			const bound = Calc.bind(expr, { x: 10, y: 20, extra: 99 })
			const result = Calc.solve(bound)
			expect(result).toBe(30)
		})

		it('solve ignores excess properties', () => {
			const expr = Calc.multiply('a', 'b')
			const result = Calc.solve(expr, { a: 3, b: 7, extra: 999 })
			expect(result).toBe(21)
		})

		it('bind with object spread filters to relevant refs', () => {
			const data = { apexL: 0.6, apexC: 0.3, curvature: -0.1, unrelated: 42 }
			const expr = Calc.add('apexL', 'apexC')
			const bound = Calc.bind(expr, data)
			const result = Calc.solve(bound)
			expect(result).toBeCloseTo(0.9)
		})

		it('solve with object spread filters to relevant refs', () => {
			const data = { x: 5, y: 10, z: 100 }
			const expr = Calc.add('x', 'y')
			const result = Calc.solve(expr, data)
			expect(result).toBe(15)
		})

		it('partial bind with excess properties preserves remaining refs', () => {
			const expr = Calc.add('x', 'y', 'z')
			const data = { x: 1, extra: 99 }
			const bound = Calc.bind(expr, data)
			const result = Calc.solve(bound, { y: 2, z: 3 })
			expect(result).toBe(6)
		})
	})
})
