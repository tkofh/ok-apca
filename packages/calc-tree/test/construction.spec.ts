import { describe, expect, it } from 'vitest'
import { constant, reference } from '../src/expression.ts'
import { Calc } from '../src/index.ts'

describe('construction', () => {
	describe('constant', () => {
		it('converts numbers to expressions', () => {
			const expr = constant(42)
			const result = Calc.solve(expr)
			expect(result).toBe(42)
		})

		it('converts pi', () => {
			const expr = constant(Math.PI)
			const result = Calc.solve(expr)
			expect(result).toBeCloseTo(Math.PI)
		})

		it('throws for non-finite numbers', () => {
			expect(() => constant(Number.POSITIVE_INFINITY)).toThrow(TypeError)
			expect(() => constant(Number.NaN)).toThrow(TypeError)
		})
	})

	describe('reference', () => {
		it('creates a reference expression', () => {
			const expr = reference('x')
			const result = Calc.solve(expr, { x: 5 })
			expect(result).toBe(5)
		})

		it('throws for empty string', () => {
			expect(() => reference('')).toThrow(TypeError)
		})
	})

	describe('binary operations', () => {
		it('creates add expression', () => {
			const expr = Calc.add(2, 3)
			const result = Calc.solve(expr)
			expect(result).toBe(5)
		})

		it('creates subtract expression', () => {
			const expr = Calc.subtract(5, 3)
			const result = Calc.solve(expr)
			expect(result).toBe(2)
		})

		it('creates multiply expression', () => {
			const expr = Calc.multiply(4, 3)
			const result = Calc.solve(expr)
			expect(result).toBe(12)
		})

		it('creates divide expression', () => {
			const expr = Calc.divide(12, 4)
			const result = Calc.solve(expr)
			expect(result).toBe(3)
		})

		it('creates pow expression', () => {
			const expr = Calc.pow(2, 3)
			const result = Calc.solve(expr)
			expect(result).toBe(8)
		})

		it('creates max expression', () => {
			const expr = Calc.max(5, 3)
			const result = Calc.solve(expr)
			expect(result).toBe(5)
		})

		it('creates min expression', () => {
			const expr = Calc.min(5, 3)
			const result = Calc.solve(expr)
			expect(result).toBe(3)
		})
	})

	describe('unary operations', () => {
		it('creates sin expression', () => {
			const expr = Calc.sin(0)
			const result = Calc.solve(expr)
			expect(result).toBeCloseTo(0)
		})

		it('creates abs expression', () => {
			const expr = Calc.abs(-5)
			const result = Calc.solve(expr)
			expect(result).toBe(5)
		})

		it('creates sign expression', () => {
			const expr = Calc.sign(-5)
			const result = Calc.solve(expr)
			expect(result).toBe(-1)
		})
	})

	describe('clamp', () => {
		it('creates clamp expression', () => {
			const expr = Calc.clamp(0, 5, 10)
			const result = Calc.solve(expr)
			expect(result).toBe(5)
		})

		it('clamps to minimum', () => {
			const expr = Calc.clamp(0, -5, 10)
			const result = Calc.solve(expr)
			expect(result).toBe(0)
		})

		it('clamps to maximum', () => {
			const expr = Calc.clamp(0, 15, 10)
			const result = Calc.solve(expr)
			expect(result).toBe(10)
		})
	})

	describe('variadic operations', () => {
		it('adds three constants', () => {
			const expr = Calc.add(1, 2, 3)
			expect(Calc.solve(expr)).toBe(6)
		})

		it('adds four constants', () => {
			const expr = Calc.add(1, 2, 3, 4)
			expect(Calc.solve(expr)).toBe(10)
		})

		it('finds max of three constants', () => {
			const expr = Calc.max(1, 5, 3)
			expect(Calc.solve(expr)).toBe(5)
		})

		it('finds min of three constants', () => {
			const expr = Calc.min(5, 1, 3)
			expect(Calc.solve(expr)).toBe(1)
		})

		it('adds three expressions with references', () => {
			const expr = Calc.add('a', 'b', 'c')
			const result = Calc.solve(expr, { a: 10, b: 20, c: 30 })
			expect(result).toBe(60)
		})

		it('finds max with references', () => {
			const expr = Calc.max('x', 0, 'y')
			const result = Calc.solve(expr, { x: -5, y: 3 })
			expect(result).toBe(3)
		})

		it('finds min with references', () => {
			const expr = Calc.min('x', 100, 'y')
			const result = Calc.solve(expr, { x: 50, y: 25 })
			expect(result).toBe(25)
		})
	})

	describe('reference merging', () => {
		it('merges references from operations', () => {
			const expr = Calc.add('x', 'y')
			// Needs both x and y to evaluate
			const result = Calc.solve(expr, { x: 1, y: 2 })
			expect(result).toBe(3)
		})

		it('deduplicates references', () => {
			const x = 'x'
			const expr = Calc.add(x, x)
			// Only needs x once
			const result = Calc.solve(expr, { x: 5 })
			expect(result).toBe(10)
		})

		it('merges references from nested operations', () => {
			const expr = Calc.add(Calc.multiply('a', 'b'), Calc.subtract('c', 'd'))
			const result = Calc.solve(expr, {
				a: 2,
				b: 3,
				c: 10,
				d: 4,
			})
			expect(result).toBe(12) // (2*3) + (10-4) = 6 + 6
		})
	})
})
