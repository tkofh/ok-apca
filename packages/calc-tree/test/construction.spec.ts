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

describe('construction', () => {
	describe('toExpression', () => {
		it('converts numbers to expressions', () => {
			const expr = toExpression(42)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(42)
		})

		it('converts pi', () => {
			const expr = toExpression(Math.PI)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBeCloseTo(Math.PI)
		})

		it('throws for non-finite numbers', () => {
			expect(() => toExpression(Number.POSITIVE_INFINITY)).toThrow(TypeError)
			expect(() => toExpression(Number.NaN)).toThrow(TypeError)
		})

		it('passes expressions through unchanged', () => {
			const original = reference('x')
			const expr = toExpression(original)
			expect(expr).toBe(original)
		})
	})

	describe('reference', () => {
		it('creates a reference expression', () => {
			const expr = reference('x')
			// Can't evaluate without binding - returns expression
			const result = expr.evaluate({ x: 5 })
			expect(result.type).toBe('number')
		})

		it('throws for empty string', () => {
			expect(() => reference('')).toThrow(TypeError)
		})

		it('throws for non-strings', () => {
			// @ts-expect-error Testing runtime validation
			expect(() => reference(42)).toThrow(TypeError)
		})
	})

	describe('binary operations', () => {
		it('creates add expression', () => {
			const expr = add(2, 3)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(5)
		})

		it('creates subtract expression', () => {
			const expr = subtract(5, 3)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(2)
		})

		it('creates multiply expression', () => {
			const expr = multiply(4, 3)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(12)
		})

		it('creates divide expression', () => {
			const expr = divide(12, 4)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(3)
		})

		it('creates power expression', () => {
			const expr = power(2, 3)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(8)
		})

		it('creates max expression', () => {
			const expr = max(5, 3)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(5)
		})

		it('creates min expression', () => {
			const expr = min(5, 3)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(3)
		})
	})

	describe('unary operations', () => {
		it('creates sin expression', () => {
			const expr = sin(0)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBeCloseTo(0)
		})

		it('creates abs expression', () => {
			const expr = abs(-5)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(5)
		})

		it('creates sign expression', () => {
			const expr = sign(-5)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(-1)
		})
	})

	describe('clamp', () => {
		it('creates clamp expression', () => {
			const expr = clamp(0, 5, 10)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(5)
		})

		it('clamps to minimum', () => {
			const expr = clamp(0, -5, 10)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(0)
		})

		it('clamps to maximum', () => {
			const expr = clamp(0, 15, 10)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(10)
		})
	})

	describe('reference merging', () => {
		it('merges references from operations', () => {
			const expr = add(reference('x'), reference('y'))
			// Needs both x and y to evaluate
			const result = expr.evaluate({ x: 1, y: 2 })
			expect.assert(result.type === 'number')
			expect(result.value).toBe(3)
		})

		it('deduplicates references', () => {
			const x = reference('x')
			const expr = add(x, x)
			// Only needs x once
			const result = expr.evaluate({ x: 5 })
			expect.assert(result.type === 'number')
			expect(result.value).toBe(10)
		})

		it('merges references from nested operations', () => {
			const expr = add(
				multiply(reference('a'), reference('b')),
				subtract(reference('c'), reference('d')),
			)
			const result = expr.evaluate({
				a: 2,
				b: 3,
				c: 10,
				d: 4,
			})
			expect.assert(result.type === 'number')
			expect(result.value).toBe(12) // (2*3) + (10-4) = 6 + 6
		})
	})
})
