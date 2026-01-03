import { describe, expect, it } from 'vitest'
import { add, multiply, power, reference, toExpression } from '../src/index.ts'

describe('evaluation', () => {
	describe('constant evaluation', () => {
		it('evaluates constants to numbers', () => {
			const expr = toExpression(42)
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBe(42)
		})

		it('evaluates negative constants', () => {
			const expr = toExpression(-3.14)
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBeCloseTo(-3.14)
		})

		it('evaluates zero', () => {
			const expr = toExpression(0)
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBe(0)
		})
	})

	describe('bound evaluation', () => {
		it('evaluates with all bindings constant', () => {
			const expr = add(reference('x'), 5)
			const result = expr.evaluate({ x: 10 })

			expect.assert(result.type === 'number')
			expect(result.value).toBe(15)
		})

		it('returns expression for non-constant bindings', () => {
			const expr = add(reference('x'), 5)
			const result = expr.evaluate({ x: reference('runtime') })

			expect(result.type).toBe('expression')
		})

		it('evaluates multiple bindings', () => {
			const expr = add(reference('x'), reference('y'))
			const result = expr.evaluate({
				x: 10,
				y: 20,
			})

			expect.assert(result.type === 'number')
			expect(result.value).toBe(30)
		})
	})

	describe('complex expressions', () => {
		it('evaluates nested operations', () => {
			// f(x) = (x + 1) * (x - 1) = x^2 - 1
			const x = reference('x')
			const expr = multiply(add(x, 1), add(x, -1))
			const result = expr.evaluate({ x: 5 })

			expect.assert(result.type === 'number')
			expect(result.value).toBe(24) // 5^2 - 1 = 24
		})

		it('evaluates power expressions', () => {
			// f(x, y) = (x^2 + y^2)^0.5
			const expr = power(add(power(reference('x'), 2), power(reference('y'), 2)), 0.5)
			const result = expr.evaluate({
				x: 3,
				y: 4,
			})

			expect.assert(result.type === 'number')
			expect(result.value).toBeCloseTo(5)
		})

		it('evaluates deeply nested expressions', () => {
			// ((2 * 3) + (4 * 5)) * ((6 - 2) / 2)
			const expr = multiply(add(multiply(2, 3), multiply(4, 5)), add(add(6, -2), -2))
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			// (6 + 20) * 2 = 52
			expect(result.value).toBe(52)
		})
	})

	describe('result types', () => {
		it('number result has css property', () => {
			const expr = add(reference('x'), 5)
			const result = expr.evaluate({ x: 10 })

			expect(result).toHaveProperty('css')
			expect(result.css).toHaveProperty('expression')
			expect(result.css).toHaveProperty('declarations')
		})

		it('expression result has css property', () => {
			const expr = add(reference('x'), 5)
			const result = expr.evaluate({ x: reference('runtime') })

			expect(result).toHaveProperty('css')
			expect(result.css).toHaveProperty('expression')
			expect(result.css).toHaveProperty('declarations')
		})

		it('number result css contains the value', () => {
			const expr = toExpression(42)
			const result = expr.evaluate()

			expect(result.type).toBe('number')
			expect(result.css.expression).toBe('42')
			expect(result.css.declarations).toEqual({})
		})
	})

	describe('simplification', () => {
		it('folds constant addition', () => {
			const expr = add(2, 3)
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBe(5)
		})

		it('folds constant multiplication', () => {
			const expr = multiply(4, 5)
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBe(20)
		})

		it('simplifies nested constants', () => {
			const expr = add(multiply(2, 3), add(4, 5))
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBe(15) // (2*3) + (4+5) = 6 + 9 = 15
		})

		it('produces simplified CSS output', () => {
			// 2*3 should fold to 6
			const expr = add(multiply(2, 3), reference('x'))
			const result = expr.evaluate({ x: reference('x') })

			const css = result.css
			// Should have simplified 2*3 to 6
			expect(css.expression).toContain('6')
			expect(css.expression).not.toContain('2 *')
		})
	})
})
