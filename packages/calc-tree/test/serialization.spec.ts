import { describe, expect, it } from 'vitest'
import {
	abs,
	add,
	clamp,
	divide,
	max,
	min,
	multiply,
	power,
	reference,
	sign,
	sin,
	subtract,
	toExpression,
} from '../src/index.ts'

describe('serialization', () => {
	describe('constants', () => {
		it('serializes integer constants', () => {
			const result = toExpression(42).evaluate()
			expect(result.css.expression).toBe('42')
			expect(result.css.declarations).toEqual({})
		})

		it('serializes decimal constants', () => {
			const result = toExpression(1.5).evaluate()
			expect(result.css.expression).toBe('1.5')
		})

		it('serializes pi constant', () => {
			const result = toExpression(Math.PI).evaluate()
			expect(result.css.expression).toBe('pi')
		})

		it('formats numbers without trailing zeros', () => {
			const result1 = toExpression(1.5).evaluate()
			expect(result1.css.expression).toBe('1.5')

			const result2 = toExpression(2.0).evaluate()
			expect(result2.css.expression).toBe('2')
		})

		it('formats negative numbers', () => {
			const result = toExpression(-42).evaluate()
			expect(result.css.expression).toBe('-42')
		})

		it('formats zero', () => {
			const result = toExpression(0).evaluate()
			expect(result.css.expression).toBe('0')
		})
	})

	describe('references', () => {
		it('serializes references as var()', () => {
			const expr = reference('x')
			const result = expr.evaluate({ x: reference('x') })
			expect(result.css.expression).toBe('var(--x)')
		})

		it('serializes multi-word references', () => {
			const expr = reference('my-variable')
			const result = expr.evaluate({ 'my-variable': reference('my-variable') })
			expect(result.css.expression).toBe('var(--my-variable)')
		})
	})

	describe('binary operations', () => {
		it('serializes addition', () => {
			const expr = add(reference('x'), 5)
			const result = expr.evaluate({ x: reference('x') })
			expect(result.css.expression).toBe('calc(var(--x) + 5)')
		})

		it('serializes subtraction', () => {
			const expr = subtract(reference('x'), 5)
			const result = expr.evaluate({ x: reference('x') })
			expect(result.css.expression).toBe('calc(var(--x) - 5)')
		})

		it('serializes multiplication', () => {
			const expr = multiply(reference('x'), 2)
			const result = expr.evaluate({ x: reference('x') })
			expect(result.css.expression).toBe('calc(var(--x) * 2)')
		})

		it('serializes division', () => {
			const expr = divide(reference('x'), 2)
			const result = expr.evaluate({ x: reference('x') })
			expect(result.css.expression).toBe('calc(var(--x) / 2)')
		})

		it('serializes power', () => {
			const expr = power(reference('x'), 2)
			const result = expr.evaluate({ x: reference('x') })
			expect(result.css.expression).toBe('pow(var(--x), 2)')
		})

		it('serializes max', () => {
			const expr = max(reference('x'), 0)
			const result = expr.evaluate({ x: reference('x') })
			expect(result.css.expression).toBe('max(var(--x), 0)')
		})

		it('serializes min', () => {
			const expr = min(reference('x'), 100)
			const result = expr.evaluate({ x: reference('x') })
			expect(result.css.expression).toBe('min(var(--x), 100)')
		})
	})

	describe('unary operations', () => {
		it('serializes sin', () => {
			const expr = sin(reference('x'))
			const result = expr.evaluate({ x: reference('x') })
			expect(result.css.expression).toBe('sin(var(--x))')
		})

		it('serializes abs', () => {
			const expr = abs(reference('x'))
			const result = expr.evaluate({ x: reference('x') })
			expect(result.css.expression).toBe('abs(var(--x))')
		})

		it('serializes sign', () => {
			const expr = sign(reference('x'))
			const result = expr.evaluate({ x: reference('x') })
			expect(result.css.expression).toBe('sign(var(--x))')
		})
	})

	describe('clamp', () => {
		it('serializes clamp', () => {
			const expr = clamp(0, reference('x'), 100)
			const result = expr.evaluate({ x: reference('x') })
			expect(result.css.expression).toBe('clamp(0, var(--x), 100)')
		})
	})

	describe('parenthesization', () => {
		it('does not add parens around function arguments', () => {
			const expr = sin(add(reference('x'), 1))
			const result = expr.evaluate({ x: reference('x') })
			expect(result.css.expression).toBe('sin(var(--x) + 1)')
		})

		it('adds parens to add/subtract when used in multiply', () => {
			const expr = multiply(add(reference('a'), reference('b')), reference('c'))
			const result = expr.evaluate({
				a: reference('a'),
				b: reference('b'),
				c: reference('c'),
			})
			expect(result.css.expression).toBe('calc((var(--a) + var(--b)) * var(--c))')
		})

		it('adds parens to subtract when used in divide', () => {
			const expr = divide(subtract(reference('a'), reference('b')), reference('c'))
			const result = expr.evaluate({
				a: reference('a'),
				b: reference('b'),
				c: reference('c'),
			})
			expect(result.css.expression).toBe('calc((var(--a) - var(--b)) / var(--c))')
		})

		it('does not add parens to multiply when used in add', () => {
			const expr = add(multiply(reference('a'), reference('b')), reference('c'))
			const result = expr.evaluate({
				a: reference('a'),
				b: reference('b'),
				c: reference('c'),
			})
			expect(result.css.expression).toBe('calc(var(--a) * var(--b) + var(--c))')
		})

		it('handles deeply nested expressions', () => {
			// (a + b) * (c - d)
			const expr = multiply(
				add(reference('a'), reference('b')),
				subtract(reference('c'), reference('d')),
			)
			const result = expr.evaluate({
				a: reference('a'),
				b: reference('b'),
				c: reference('c'),
				d: reference('d'),
			})
			expect(result.css.expression).toBe('calc((var(--a) + var(--b)) * (var(--c) - var(--d)))')
		})
	})

	describe('complex expressions', () => {
		it('serializes quadratic formula components', () => {
			// ax^2
			const expr = multiply(reference('a'), power(reference('x'), 2))
			const result = expr.evaluate({
				a: reference('a'),
				x: reference('x'),
			})
			expect(result.css.expression).toBe('calc(var(--a) * pow(var(--x), 2))')
		})

		it('serializes distance formula', () => {
			// sqrt(x^2 + y^2)
			const expr = power(add(power(reference('x'), 2), power(reference('y'), 2)), 0.5)
			const result = expr.evaluate({
				x: reference('x'),
				y: reference('y'),
			})
			expect(result.css.expression).toBe('pow(pow(var(--x), 2) + pow(var(--y), 2), 0.5)')
		})
	})
})
