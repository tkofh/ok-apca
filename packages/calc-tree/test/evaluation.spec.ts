import { describe, expect, it } from 'vitest'
import { constant } from '../src/constructors.ts'
import { add, multiply, pow } from '../src/index.ts'

describe('evaluation', () => {
	describe('constant evaluation', () => {
		it('evaluates constants to numbers', () => {
			const expr = constant(42)
			const result = expr.solve()

			expect(result).toBe(42)
		})

		it('evaluates negative constants', () => {
			const expr = constant(-3.14)
			const result = expr.solve()

			expect(result).toBeCloseTo(-3.14)
		})

		it('evaluates zero', () => {
			const expr = constant(0)
			const result = expr.solve()

			expect(result).toBe(0)
		})
	})

	describe('bound evaluation', () => {
		it('evaluates with all bindings constant', () => {
			const expr = add('x', 5)
			const result = expr.solve({ x: 10 })

			expect(result).toBe(15)
		})

		it('throws for non-constant bindings', () => {
			const expr = add('x', 5)

			expect(() => expr.solve({ x: 'runtime' })).toThrow()
		})

		it('evaluates multiple bindings', () => {
			const expr = add('x', 'y')
			const result = expr.solve({
				x: 10,
				y: 20,
			})

			expect(result).toBe(30)
		})
	})

	describe('complex expressions', () => {
		it('evaluates nested operations', () => {
			// f(x) = (x + 1) * (x - 1) = x^2 - 1
			const x = 'x'
			const expr = multiply(add(x, 1), add(x, -1))
			const result = expr.solve({ x: 5 })

			expect(result).toBe(24) // 5^2 - 1 = 24
		})

		it('evaluates pow expressions', () => {
			// f(x, y) = (x^2 + y^2)^0.5
			const expr = pow(add(pow('x', 2), pow('y', 2)), 0.5)
			const result = expr.solve({
				x: 3,
				y: 4,
			})

			expect(result).toBeCloseTo(5)
		})

		it('evaluates deeply nested expressions', () => {
			// ((2 * 3) + (4 * 5)) * ((6 - 2) / 2)
			const expr = multiply(add(multiply(2, 3), multiply(4, 5)), add(add(6, -2), -2))
			const result = expr.solve()

			// (6 + 20) * 2 = 52
			expect(result).toBe(52)
		})
	})

	describe('css output', () => {
		it('toCss returns expression and declarations', () => {
			const expr = add('x', 5)
			const css = expr.toCss({ x: 10 })

			expect(css).toHaveProperty('expression')
			expect(css).toHaveProperty('declarations')
		})

		it('toCss with non-constant bindings produces css', () => {
			const expr = add('x', 5)
			const css = expr.toCss({ x: 'runtime' })

			expect(css).toHaveProperty('expression')
			expect(css).toHaveProperty('declarations')
		})

		it('constant expression css contains the value', () => {
			const expr = constant(42)
			const css = expr.toCss()

			expect(css.expression).toBe('42')
			expect(css.declarations).toEqual({})
		})
	})

	describe('simplification', () => {
		it('folds constant addition', () => {
			const expr = add(2, 3)
			const result = expr.solve()

			expect(result).toBe(5)
		})

		it('folds constant multiplication', () => {
			const expr = multiply(4, 5)
			const result = expr.solve()

			expect(result).toBe(20)
		})

		it('simplifies nested constants', () => {
			const expr = add(multiply(2, 3), add(4, 5))
			const result = expr.solve()

			expect(result).toBe(15) // (2*3) + (4+5) = 6 + 9 = 15
		})

		it('produces simplified CSS output', () => {
			// 2*3 should fold to 6
			const expr = add(multiply(2, 3), 'x')
			const css = expr.toCss({ x: 'x' })

			// Should have simplified 2*3 to 6
			expect(css.expression).toContain('6')
			expect(css.expression).not.toContain('2 *')
		})
	})
})
