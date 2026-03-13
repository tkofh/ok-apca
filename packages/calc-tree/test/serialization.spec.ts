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
			expect(Calc.serialize(Calc.bind(reference('x'), { x: Calc.ref('x') }))).toBe('var(--x)')
		})

		it('serializes multi-word references', () => {
			expect(
				Calc.serialize(
					Calc.bind(reference('my-variable'), { 'my-variable': Calc.ref('my-variable') }),
				),
			).toBe('var(--my-variable)')
		})
	})

	describe('binary operations', () => {
		it('serializes addition', () => {
			expect(Calc.serialize(Calc.bind(Calc.add(Calc.ref('x'), 5), { x: Calc.ref('x') }))).toBe(
				'calc(var(--x) + 5)',
			)
		})

		it('serializes subtraction', () => {
			expect(Calc.serialize(Calc.bind(Calc.subtract(Calc.ref('x'), 5), { x: Calc.ref('x') }))).toBe(
				'calc(var(--x) - 5)',
			)
		})

		it('serializes multiplication', () => {
			expect(Calc.serialize(Calc.bind(Calc.multiply(Calc.ref('x'), 2), { x: Calc.ref('x') }))).toBe(
				'calc(var(--x) * 2)',
			)
		})

		it('serializes division', () => {
			expect(Calc.serialize(Calc.bind(Calc.divide(Calc.ref('x'), 2), { x: Calc.ref('x') }))).toBe(
				'calc(var(--x) / 2)',
			)
		})

		it('serializes power', () => {
			expect(Calc.serialize(Calc.bind(Calc.pow(Calc.ref('x'), 2), { x: Calc.ref('x') }))).toBe(
				'pow(var(--x), 2)',
			)
		})

		it('serializes max', () => {
			expect(Calc.serialize(Calc.bind(Calc.max(Calc.ref('x'), 0), { x: Calc.ref('x') }))).toBe(
				'max(var(--x), 0)',
			)
		})

		it('serializes min', () => {
			expect(Calc.serialize(Calc.bind(Calc.min(Calc.ref('x'), 100), { x: Calc.ref('x') }))).toBe(
				'min(var(--x), 100)',
			)
		})
	})

	describe('variadic operations', () => {
		it('serializes variadic addition', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.add(Calc.ref('x'), Calc.ref('y'), 5), {
						x: Calc.ref('x'),
						y: Calc.ref('y'),
					}),
				),
			).toBe('calc(var(--x) + var(--y) + 5)')
		})

		it('serializes variadic max', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.max(Calc.ref('x'), 0, Calc.ref('y')), {
						x: Calc.ref('x'),
						y: Calc.ref('y'),
					}),
				),
			).toBe('max(var(--x), 0, var(--y))')
		})

		it('serializes variadic min', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.min(Calc.ref('x'), 100, Calc.ref('y')), {
						x: Calc.ref('x'),
						y: Calc.ref('y'),
					}),
				),
			).toBe('min(var(--x), 100, var(--y))')
		})

		it('parenthesizes variadic add inside multiply', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.multiply(Calc.add(Calc.ref('a'), Calc.ref('b'), Calc.ref('c')), 2), {
						a: Calc.ref('a'),
						b: Calc.ref('b'),
						c: Calc.ref('c'),
					}),
				),
			).toBe('calc((var(--a) + var(--b) + var(--c)) * 2)')
		})
	})

	describe('unary operations', () => {
		it('serializes sin', () => {
			expect(Calc.serialize(Calc.bind(Calc.sin(Calc.ref('x')), { x: Calc.ref('x') }))).toBe(
				'sin(var(--x))',
			)
		})

		it('serializes abs', () => {
			expect(Calc.serialize(Calc.bind(Calc.abs(Calc.ref('x')), { x: Calc.ref('x') }))).toBe(
				'abs(var(--x))',
			)
		})

		it('serializes sign', () => {
			expect(Calc.serialize(Calc.bind(Calc.sign(Calc.ref('x')), { x: Calc.ref('x') }))).toBe(
				'sign(var(--x))',
			)
		})
	})

	describe('clamp', () => {
		it('serializes clamp', () => {
			expect(
				Calc.serialize(Calc.bind(Calc.clamp(0, Calc.ref('x'), 100), { x: Calc.ref('x') })),
			).toBe('clamp(0, var(--x), 100)')
		})
	})

	describe('parenthesization', () => {
		it('does not add parens around function arguments', () => {
			expect(
				Calc.serialize(Calc.bind(Calc.sin(Calc.add(Calc.ref('x'), 1)), { x: Calc.ref('x') })),
			).toBe('sin(var(--x) + 1)')
		})

		it('adds parens to add/subtract when used in multiply', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.multiply(Calc.add(Calc.ref('a'), Calc.ref('b')), Calc.ref('c')), {
						a: Calc.ref('a'),
						b: Calc.ref('b'),
						c: Calc.ref('c'),
					}),
				),
			).toBe('calc((var(--a) + var(--b)) * var(--c))')
		})

		it('adds parens to subtract when used in divide', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.divide(Calc.subtract(Calc.ref('a'), Calc.ref('b')), Calc.ref('c')), {
						a: Calc.ref('a'),
						b: Calc.ref('b'),
						c: Calc.ref('c'),
					}),
				),
			).toBe('calc((var(--a) - var(--b)) / var(--c))')
		})

		it('does not add parens to multiply when used in add', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.add(Calc.multiply(Calc.ref('a'), Calc.ref('b')), Calc.ref('c')), {
						a: Calc.ref('a'),
						b: Calc.ref('b'),
						c: Calc.ref('c'),
					}),
				),
			).toBe('calc(var(--a) * var(--b) + var(--c))')
		})

		it('handles deeply nested expressions', () => {
			expect(
				Calc.serialize(
					Calc.bind(
						Calc.multiply(
							Calc.add(Calc.ref('a'), Calc.ref('b')),
							Calc.subtract(Calc.ref('c'), Calc.ref('d')),
						),
						{
							a: Calc.ref('a'),
							b: Calc.ref('b'),
							c: Calc.ref('c'),
							d: Calc.ref('d'),
						},
					),
				),
			).toBe('calc((var(--a) + var(--b)) * (var(--c) - var(--d)))')
		})
	})

	describe('complex expressions', () => {
		it('serializes quadratic formula components', () => {
			expect(
				Calc.serialize(
					Calc.bind(Calc.multiply(Calc.ref('a'), Calc.pow(Calc.ref('x'), 2)), {
						a: Calc.ref('a'),
						x: Calc.ref('x'),
					}),
				),
			).toBe('calc(var(--a) * pow(var(--x), 2))')
		})

		it('serializes distance formula', () => {
			expect(
				Calc.serialize(
					Calc.bind(
						Calc.pow(Calc.add(Calc.pow(Calc.ref('x'), 2), Calc.pow(Calc.ref('y'), 2)), 0.5),
						{
							x: Calc.ref('x'),
							y: Calc.ref('y'),
						},
					),
				),
			).toBe('pow(pow(var(--x), 2) + pow(var(--y), 2), 0.5)')
		})
	})
})
