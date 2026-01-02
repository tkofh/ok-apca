import { describe, expect, it } from 'vitest'
import {
	abs,
	add,
	clamp,
	constant,
	divide,
	max,
	min,
	multiply,
	power,
	reference,
	sign,
	sin,
	subtract,
} from '../src/index.ts'

describe('construction', () => {
	describe('constant', () => {
		it('creates a constant expression', () => {
			const expr = constant(42)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(42)
		})

		it('creates pi constant', () => {
			const expr = constant(Math.PI)
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBeCloseTo(Math.PI)
		})

		it('accepts numeric strings', () => {
			const expr = constant('3.14')
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBeCloseTo(3.14)
		})

		it('accepts negative numeric strings', () => {
			const expr = constant('-42')
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(-42)
		})

		it('throws for non-finite numbers', () => {
			expect(() => constant(Number.POSITIVE_INFINITY)).toThrow(TypeError)
			expect(() => constant(Number.NaN)).toThrow(TypeError)
		})

		it('throws for non-numeric strings', () => {
			expect(() => constant('hello')).toThrow(TypeError)
			expect(() => constant('12abc')).toThrow(TypeError)
		})

		it('treats empty string as zero', () => {
			const expr = constant('')
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(0)
		})
	})

	describe('reference', () => {
		it('creates a reference expression', () => {
			const expr = reference('x')
			// Can't evaluate without binding - returns expression
			const result = expr.evaluate({ x: constant(5) })
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
			const expr = add(constant(2), constant(3))
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(5)
		})

		it('creates subtract expression', () => {
			const expr = subtract(constant(5), constant(3))
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(2)
		})

		it('creates multiply expression', () => {
			const expr = multiply(constant(4), constant(3))
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(12)
		})

		it('creates divide expression', () => {
			const expr = divide(constant(12), constant(4))
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(3)
		})

		it('creates power expression', () => {
			const expr = power(constant(2), constant(3))
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(8)
		})

		it('creates max expression', () => {
			const expr = max(constant(5), constant(3))
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(5)
		})

		it('creates min expression', () => {
			const expr = min(constant(5), constant(3))
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(3)
		})
	})

	describe('unary operations', () => {
		it('creates sin expression', () => {
			const expr = sin(constant(0))
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBeCloseTo(0)
		})

		it('creates abs expression', () => {
			const expr = abs(constant(-5))
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(5)
		})

		it('creates sign expression', () => {
			const expr = sign(constant(-5))
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(-1)
		})
	})

	describe('clamp', () => {
		it('creates clamp expression', () => {
			const expr = clamp(constant(0), constant(5), constant(10))
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(5)
		})

		it('clamps to minimum', () => {
			const expr = clamp(constant(0), constant(-5), constant(10))
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(0)
		})

		it('clamps to maximum', () => {
			const expr = clamp(constant(0), constant(15), constant(10))
			const result = expr.evaluate()
			expect.assert(result.type === 'number')
			expect(result.value).toBe(10)
		})
	})

	describe('reference merging', () => {
		it('merges references from operations', () => {
			const expr = add(reference('x'), reference('y'))
			// Needs both x and y to evaluate
			const result = expr.evaluate({ x: constant(1), y: constant(2) })
			expect.assert(result.type === 'number')
			expect(result.value).toBe(3)
		})

		it('deduplicates references', () => {
			const x = reference('x')
			const expr = add(x, x)
			// Only needs x once
			const result = expr.evaluate({ x: constant(5) })
			expect.assert(result.type === 'number')
			expect(result.value).toBe(10)
		})

		it('merges references from nested operations', () => {
			const expr = add(
				multiply(reference('a'), reference('b')),
				subtract(reference('c'), reference('d')),
			)
			const result = expr.evaluate({
				a: constant(2),
				b: constant(3),
				c: constant(10),
				d: constant(4),
			})
			expect.assert(result.type === 'number')
			expect(result.value).toBe(12) // (2*3) + (10-4) = 6 + 6
		})
	})
})
