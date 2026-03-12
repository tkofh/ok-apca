import { describe, expect, it } from 'vitest'
import { constant, reference } from '../src/constructors.ts'
import {
	abs,
	add,
	clamp,
	divide,
	max,
	min,
	multiply,
	pow,
	sign,
	sin,
	subtract,
} from '../src/index.ts'

describe('serialization', () => {
	describe('constants', () => {
		it('serializes integer constants', () => {
			expect(constant(42).serialize()).toBe('42')
		})

		it('serializes decimal constants', () => {
			expect(constant(1.5).serialize()).toBe('1.5')
		})

		it('serializes pi constant', () => {
			expect(constant(Math.PI).serialize()).toBe('pi')
		})

		it('formats numbers without trailing zeros', () => {
			expect(constant(1.5).serialize()).toBe('1.5')
			expect(constant(2.0).serialize()).toBe('2')
		})

		it('formats negative numbers', () => {
			expect(constant(-42).serialize()).toBe('-42')
		})

		it('formats zero', () => {
			expect(constant(0).serialize()).toBe('0')
		})
	})

	describe('references', () => {
		it('serializes references as var()', () => {
			expect(reference('x').bind({ x: 'x' }).serialize()).toBe('var(--x)')
		})

		it('serializes multi-word references', () => {
			expect(
				reference('my-variable').bind({ 'my-variable': 'my-variable' }).serialize(),
			).toBe('var(--my-variable)')
		})
	})

	describe('binary operations', () => {
		it('serializes addition', () => {
			expect(add('x', 5).bind({ x: 'x' }).serialize()).toBe('calc(var(--x) + 5)')
		})

		it('serializes subtraction', () => {
			expect(subtract('x', 5).bind({ x: 'x' }).serialize()).toBe('calc(var(--x) - 5)')
		})

		it('serializes multiplication', () => {
			expect(multiply('x', 2).bind({ x: 'x' }).serialize()).toBe('calc(var(--x) * 2)')
		})

		it('serializes division', () => {
			expect(divide('x', 2).bind({ x: 'x' }).serialize()).toBe('calc(var(--x) / 2)')
		})

		it('serializes power', () => {
			expect(pow('x', 2).bind({ x: 'x' }).serialize()).toBe('pow(var(--x), 2)')
		})

		it('serializes max', () => {
			expect(max('x', 0).bind({ x: 'x' }).serialize()).toBe('max(var(--x), 0)')
		})

		it('serializes min', () => {
			expect(min('x', 100).bind({ x: 'x' }).serialize()).toBe('min(var(--x), 100)')
		})
	})

	describe('variadic operations', () => {
		it('serializes variadic addition', () => {
			expect(add('x', 'y', 5).bind({ x: 'x', y: 'y' }).serialize()).toBe(
				'calc(var(--x) + var(--y) + 5)',
			)
		})

		it('serializes variadic max', () => {
			expect(max('x', 0, 'y').bind({ x: 'x', y: 'y' }).serialize()).toBe(
				'max(var(--x), 0, var(--y))',
			)
		})

		it('serializes variadic min', () => {
			expect(min('x', 100, 'y').bind({ x: 'x', y: 'y' }).serialize()).toBe(
				'min(var(--x), 100, var(--y))',
			)
		})

		it('parenthesizes variadic add inside multiply', () => {
			expect(
				multiply(add('a', 'b', 'c'), 2)
					.bind({ a: 'a', b: 'b', c: 'c' })
					.serialize(),
			).toBe('calc((var(--a) + var(--b) + var(--c)) * 2)')
		})
	})

	describe('unary operations', () => {
		it('serializes sin', () => {
			expect(sin('x').bind({ x: 'x' }).serialize()).toBe('sin(var(--x))')
		})

		it('serializes abs', () => {
			expect(abs('x').bind({ x: 'x' }).serialize()).toBe('abs(var(--x))')
		})

		it('serializes sign', () => {
			expect(sign('x').bind({ x: 'x' }).serialize()).toBe('sign(var(--x))')
		})
	})

	describe('clamp', () => {
		it('serializes clamp', () => {
			expect(clamp(0, 'x', 100).bind({ x: 'x' }).serialize()).toBe(
				'clamp(0, var(--x), 100)',
			)
		})
	})

	describe('parenthesization', () => {
		it('does not add parens around function arguments', () => {
			expect(sin(add('x', 1)).bind({ x: 'x' }).serialize()).toBe('sin(var(--x) + 1)')
		})

		it('adds parens to add/subtract when used in multiply', () => {
			expect(
				multiply(add('a', 'b'), 'c')
					.bind({ a: 'a', b: 'b', c: 'c' })
					.serialize(),
			).toBe('calc((var(--a) + var(--b)) * var(--c))')
		})

		it('adds parens to subtract when used in divide', () => {
			expect(
				divide(subtract('a', 'b'), 'c')
					.bind({ a: 'a', b: 'b', c: 'c' })
					.serialize(),
			).toBe('calc((var(--a) - var(--b)) / var(--c))')
		})

		it('does not add parens to multiply when used in add', () => {
			expect(
				add(multiply('a', 'b'), 'c')
					.bind({ a: 'a', b: 'b', c: 'c' })
					.serialize(),
			).toBe('calc(var(--a) * var(--b) + var(--c))')
		})

		it('handles deeply nested expressions', () => {
			expect(
				multiply(add('a', 'b'), subtract('c', 'd'))
					.bind({ a: 'a', b: 'b', c: 'c', d: 'd' })
					.serialize(),
			).toBe('calc((var(--a) + var(--b)) * (var(--c) - var(--d)))')
		})
	})

	describe('complex expressions', () => {
		it('serializes quadratic formula components', () => {
			expect(
				multiply('a', pow('x', 2))
					.bind({ a: 'a', x: 'x' })
					.serialize(),
			).toBe('calc(var(--a) * pow(var(--x), 2))')
		})

		it('serializes distance formula', () => {
			expect(
				pow(add(pow('x', 2), pow('y', 2)), 0.5)
					.bind({ x: 'x', y: 'y' })
					.serialize(),
			).toBe('pow(pow(var(--x), 2) + pow(var(--y), 2), 0.5)')
		})
	})
})
