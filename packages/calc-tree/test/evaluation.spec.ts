import { describe, expect, it } from 'vitest'
import { add, constant, multiply, power, reference } from '../src/index.ts'

describe('evaluation', () => {
	describe('constant evaluation', () => {
		it('evaluates constants to numbers', () => {
			const expr = constant(42)
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBe(42)
		})

		it('evaluates negative constants', () => {
			const expr = constant(-3.14)
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBeCloseTo(-3.14)
		})

		it('evaluates zero', () => {
			const expr = constant(0)
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBe(0)
		})
	})

	describe('bound evaluation', () => {
		it('evaluates with all bindings constant', () => {
			const expr = add(reference('x'), constant(5))
			const result = expr.evaluate({ x: constant(10) })

			expect.assert(result.type === 'number')
			expect(result.value).toBe(15)
		})

		it('returns expression for non-constant bindings', () => {
			const expr = add(reference('x'), constant(5))
			const result = expr.evaluate({ x: reference('runtime') })

			expect(result.type).toBe('expression')
		})

		it('evaluates multiple bindings', () => {
			const expr = add(reference('x'), reference('y'))
			const result = expr.evaluate({
				x: constant(10),
				y: constant(20),
			})

			expect.assert(result.type === 'number')
			expect(result.value).toBe(30)
		})
	})

	describe('complex expressions', () => {
		it('evaluates nested operations', () => {
			// f(x) = (x + 1) * (x - 1) = x^2 - 1
			const x = reference('x')
			const expr = multiply(add(x, constant(1)), add(x, constant(-1)))
			const result = expr.evaluate({ x: constant(5) })

			expect.assert(result.type === 'number')
			expect(result.value).toBe(24) // 5^2 - 1 = 24
		})

		it('evaluates power expressions', () => {
			// f(x, y) = (x^2 + y^2)^0.5
			const expr = power(
				add(power(reference('x'), constant(2)), power(reference('y'), constant(2))),
				constant(0.5),
			)
			const result = expr.evaluate({
				x: constant(3),
				y: constant(4),
			})

			expect.assert(result.type === 'number')
			expect(result.value).toBeCloseTo(5)
		})

		it('evaluates deeply nested expressions', () => {
			// ((2 * 3) + (4 * 5)) * ((6 - 2) / 2)
			const expr = multiply(
				add(multiply(constant(2), constant(3)), multiply(constant(4), constant(5))),
				add(add(constant(6), constant(-2)), constant(-2)),
			)
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			// (6 + 20) * 2 = 52
			expect(result.value).toBe(52)
		})
	})

	describe('result types', () => {
		it('number result has css property', () => {
			const expr = add(reference('x'), constant(5))
			const result = expr.evaluate({ x: constant(10) })

			expect(result).toHaveProperty('css')
			expect(result.css).toHaveProperty('expression')
			expect(result.css).toHaveProperty('declarations')
		})

		it('expression result has css property', () => {
			const expr = add(reference('x'), constant(5))
			const result = expr.evaluate({ x: reference('runtime') })

			expect(result).toHaveProperty('css')
			expect(result.css).toHaveProperty('expression')
			expect(result.css).toHaveProperty('declarations')
		})

		it('number result css contains the value', () => {
			const expr = constant(42)
			const result = expr.evaluate()

			expect(result.type).toBe('number')
			expect(result.css.expression).toBe('42')
			expect(result.css.declarations).toEqual({})
		})
	})

	describe('simplification', () => {
		it('folds constant addition', () => {
			const expr = add(constant(2), constant(3))
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBe(5)
		})

		it('folds constant multiplication', () => {
			const expr = multiply(constant(4), constant(5))
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBe(20)
		})

		it('simplifies nested constants', () => {
			const expr = add(multiply(constant(2), constant(3)), add(constant(4), constant(5)))
			const result = expr.evaluate()

			expect.assert(result.type === 'number')
			expect(result.value).toBe(15) // (2*3) + (4+5) = 6 + 9 = 15
		})

		it('produces simplified CSS output', () => {
			// 2*3 should fold to 6
			const expr = add(multiply(constant(2), constant(3)), reference('x'))
			const result = expr.evaluate({ x: reference('x') })

			const css = result.css
			// Should have simplified 2*3 to 6
			expect(css.expression).toContain('6')
			expect(css.expression).not.toContain('2 *')
		})
	})
})
