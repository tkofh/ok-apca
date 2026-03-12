import { describe, expect, it } from 'vitest'
import { constant, reference } from '../src/expression.ts'
import { Calc } from '../src/index.ts'

describe('serialization', () => {
	describe('constants', () => {
		it('serializes integer constants', () => {
			expect(Calc.serialize(constant(42))).toBe('42')
		})

		it('serializes decimal constants', () => {
			expect(Calc.serialize(constant(1.5))).toBe('1.5')
		})

		it('serializes pi constant', () => {
			expect(Calc.serialize(constant(Math.PI))).toBe('pi')
		})

		it('formats numbers without trailing zeros', () => {
			expect(Calc.serialize(constant(1.5))).toBe('1.5')
			expect(Calc.serialize(constant(2.0))).toBe('2')
		})

		it('formats negative numbers', () => {
			expect(Calc.serialize(constant(-42))).toBe('-42')
		})

		it('formats zero', () => {
			expect(Calc.serialize(constant(0))).toBe('0')
		})
	})

	describe('references', () => {
		it('serializes references as var()', () => {
			expect(Calc.serialize(Calc.bind(reference('x'), { x: 'x' }))).toBe('var(--x)')
		})

		it('serializes multi-word references', () => {
			expect(
				Calc.serialize(Calc.bind(reference('my-variable'), { 'my-variable': 'my-variable' })),
			).toBe('var(--my-variable)')
		})
	})

	describe('binary operations', () => {
		it('serializes addition', () => {
			expect(Calc.serialize(Calc.bind(Calc.add('x', 5), { x: 'x' }))).toBe('calc(var(--x) + 5)')
		})

		it('serializes subtraction', () => {
			expect(Calc.serialize(Calc.bind(Calc.subtract('x', 5), { x: 'x' }))).toBe(
				'calc(var(--x) - 5)',
			)
		})

		it('serializes multiplication', () => {
			expect(Calc.serialize(Calc.bind(Calc.multiply('x', 2), { x: 'x' }))).toBe(
				'calc(var(--x) * 2)',
			)
		})

		it('serializes division', () => {
			expect(Calc.serialize(Calc.bind(Calc.divide('x', 2), { x: 'x' }))).toBe('calc(var(--x) / 2)')
		})

		it('serializes power', () => {
			expect(Calc.serialize(Calc.bind(Calc.pow('x', 2), { x: 'x' }))).toBe('pow(var(--x), 2)')
		})

		it('serializes max', () => {
			expect(Calc.serialize(Calc.bind(Calc.max('x', 0), { x: 'x' }))).toBe('max(var(--x), 0)')
		})

		it('serializes min', () => {
			expect(Calc.serialize(Calc.bind(Calc.min('x', 100), { x: 'x' }))).toBe('min(var(--x), 100)')
		})
	})

	describe('variadic operations', () => {
		it('serializes variadic addition', () => {
			expect(Calc.serialize(Calc.bind(Calc.add('x', 'y', 5), { x: 'x', y: 'y' }))).toBe(
				'calc(var(--x) + var(--y) + 5)',
			)
		})

		it('serializes variadic max', () => {
			expect(Calc.serialize(Calc.bind(Calc.max('x', 0, 'y'), { x: 'x', y: 'y' }))).toBe(
				'max(var(--x), 0, var(--y))',
			)
		})

		it('serializes variadic min', () => {
			expect(Calc.serialize(Calc.bind(Calc.min('x', 100, 'y'), { x: 'x', y: 'y' }))).toBe(
				'min(var(--x), 100, var(--y))',
			)
		})

		it('parenthesizes variadic add inside multiply', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.multiply(Calc.add('a', 'b', 'c'), 2), { a: 'a', b: 'b', c: 'c' }),
				),
			).toBe('calc((var(--a) + var(--b) + var(--c)) * 2)')
		})
	})

	describe('unary operations', () => {
		it('serializes sin', () => {
			expect(Calc.serialize(Calc.bind(Calc.sin('x'), { x: 'x' }))).toBe('sin(var(--x))')
		})

		it('serializes abs', () => {
			expect(Calc.serialize(Calc.bind(Calc.abs('x'), { x: 'x' }))).toBe('abs(var(--x))')
		})

		it('serializes sign', () => {
			expect(Calc.serialize(Calc.bind(Calc.sign('x'), { x: 'x' }))).toBe('sign(var(--x))')
		})
	})

	describe('clamp', () => {
		it('serializes clamp', () => {
			expect(Calc.serialize(Calc.bind(Calc.clamp(0, 'x', 100), { x: 'x' }))).toBe(
				'clamp(0, var(--x), 100)',
			)
		})
	})

	describe('parenthesization', () => {
		it('does not add parens around function arguments', () => {
			expect(Calc.serialize(Calc.bind(Calc.sin(Calc.add('x', 1)), { x: 'x' }))).toBe(
				'sin(var(--x) + 1)',
			)
		})

		it('adds parens to add/subtract when used in multiply', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.multiply(Calc.add('a', 'b'), 'c'), { a: 'a', b: 'b', c: 'c' }),
				),
			).toBe('calc((var(--a) + var(--b)) * var(--c))')
		})

		it('adds parens to subtract when used in divide', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.divide(Calc.subtract('a', 'b'), 'c'), { a: 'a', b: 'b', c: 'c' }),
				),
			).toBe('calc((var(--a) - var(--b)) / var(--c))')
		})

		it('does not add parens to multiply when used in add', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.add(Calc.multiply('a', 'b'), 'c'), { a: 'a', b: 'b', c: 'c' }),
				),
			).toBe('calc(var(--a) * var(--b) + var(--c))')
		})

		it('handles deeply nested expressions', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.multiply(Calc.add('a', 'b'), Calc.subtract('c', 'd')), {
						a: 'a',
						b: 'b',
						c: 'c',
						d: 'd',
					}),
				),
			).toBe('calc((var(--a) + var(--b)) * (var(--c) - var(--d)))')
		})
	})

	describe('complex expressions', () => {
		it('serializes quadratic formula components', () => {
			expect(
				Calc.serialize(Calc.bind(Calc.multiply('a', Calc.pow('x', 2)), { a: 'a', x: 'x' })),
			).toBe('calc(var(--a) * pow(var(--x), 2))')
		})

		it('serializes distance formula', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.pow(Calc.add(Calc.pow('x', 2), Calc.pow('y', 2)), 0.5), {
						x: 'x',
						y: 'y',
					}),
				),
			).toBe('pow(pow(var(--x), 2) + pow(var(--y), 2), 0.5)')
		})
	})
})
