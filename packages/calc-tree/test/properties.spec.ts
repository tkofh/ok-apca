import { describe, expect, it } from 'vitest'
import { constant, reference } from '../src/constructors.ts'
import { add, multiply, oklch, Properties, pow } from '../src/index.ts'

describe('property wrapping', () => {
	describe('basic wrapping', () => {
		it('wraps expression as property', () => {
			const expr = multiply('x', 2)

			// Evaluate before wrapping
			const result = expr.solve({ x: 5 })
			expect(result).toBe(10)
		})

		it('includes property declaration in CSS output', () => {
			const expr = Properties.number('doubled', multiply('x', 2).bind({ x: 'runtime' }))

			expect(expr.serialize()).toBe('var(--doubled)')

			const set = Properties.make()
			Properties.collect(set, expr)
			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).toContain('--doubled: calc(var(--runtime) * 2)')
		})

		it('leaves unbound references as CSS variables', () => {
			const expr = Properties.number('sum', add('x', 'y'))

			expect(expr.serialize()).toBe('var(--sum)')

			const set = Properties.make()
			Properties.collect(set, expr)
			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).toContain('--sum: calc(var(--x) + var(--y))')
		})
	})

	describe('nested properties', () => {
		it('handles nested properties', () => {
			const inner = Properties.number('doubled', multiply('x', 2).bind({ x: 'runtime' }))
			const outer = Properties.number('result', add(inner, 5))

			expect(outer.serialize()).toBe('var(--result)')

			const set = Properties.make()
			Properties.collect(set, outer)
			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).toContain('--doubled: calc(var(--runtime) * 2)')
			expect(ruleset).toContain('--result: calc(var(--doubled) + 5)')
		})

		it('handles deeply nested properties', () => {
			const xSquared = Properties.number('x-squared', pow('x', 2))
			const ySquared = Properties.number('y-squared', pow('y', 2))
			const distance = Properties.number('distance', pow(add(xSquared, ySquared), 0.5))

			expect(distance.serialize()).toBe('var(--distance)')

			const set = Properties.make()
			Properties.collect(set, distance)
			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).toContain('--x-squared')
			expect(ruleset).toContain('--y-squared')
			expect(ruleset).toContain('--distance')
		})

		it('collects declarations in correct order', () => {
			const a = Properties.number('a', reference('x').bind({ x: 'input' }))
			const b = Properties.number('b', add(a, 1))
			const c = Properties.number('c', multiply(b, 2))

			const set = Properties.make()
			Properties.collect(set, c)
			const ruleset = Properties.toRuleset(set, '.test')

			expect(ruleset).toContain('--a: var(--input)')
			expect(ruleset).toContain('--b: calc(var(--a) + 1)')
			expect(ruleset).toContain('--c: calc(var(--b) * 2)')
		})
	})

	describe('property conflicts', () => {
		it('throws on property name conflicts with different values', () => {
			const prop1 = Properties.number('value', reference('x'))
			const prop2 = Properties.number('value', reference('y'))
			const expr = add(prop1, prop2)

			const set = Properties.make()
			expect(() => {
				Properties.collect(set, expr)
			}).toThrow(/property.*--value.*multiple times/i)
		})

		it('allows same property with same value', () => {
			const shared = Properties.number('shared', reference('x'))
			const expr = add(shared, shared)

			expect(expr.serialize()).toBe('calc(var(--shared) + var(--shared))')

			const set = Properties.make()
			Properties.collect(set, expr)
			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).toContain('--shared: var(--x)')
		})

		it('allows same property when resolved to same constant', () => {
			const shared = Properties.number('shared', constant(42))
			const expr = add(shared, shared)

			expect(expr.serialize()).toBe('calc(var(--shared) + var(--shared))')

			const set = Properties.make()
			Properties.collect(set, expr)
			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).toContain('--shared: 42')
		})
	})

	describe('binding with properties', () => {
		it('binding works before property wrapping', () => {
			const inner = Properties.number('sum', add('x', 'y').bind({ x: 5, y: 10 }))
			const expr = multiply(inner, 'z')

			const result = expr.solve({ z: 2 })

			expect(result).toBe(30) // (5 + 10) * 2
		})

		it('binding updates property declarations', () => {
			const inner = Properties.number('sum', add('x', 'y').bind({ x: 5 }))
			const expr = multiply(inner, 2)

			const set = Properties.make()
			Properties.collect(set, expr)
			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).toContain('--sum: calc(5 + var(--y))')
		})
	})

	describe('integration', () => {
		it('generates CSS with complex nested properties', () => {
			const xSquared = Properties.number('x2', pow('x', 2))
			const axSquared = Properties.number('ax2', multiply('a', xSquared))
			const bx = Properties.number('bx', multiply('b', 'x'))
			const quadratic = Properties.number('quadratic', add(axSquared, bx, 'c'))

			expect(quadratic.serialize()).toBe('var(--quadratic)')

			const set = Properties.make()
			Properties.collect(set, quadratic)
			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).toContain('--x2: pow(var(--x), 2)')
			expect(ruleset).toContain('--ax2: calc(var(--a) * var(--x2))')
			expect(ruleset).toContain('--bx: calc(var(--b) * var(--x))')
			expect(ruleset).toContain('--quadratic: calc(var(--ax2) + var(--bx) + var(--c))')
		})
	})

	describe('inherits convention', () => {
		it('_ prefix properties have inherits: false', () => {
			const expr = Properties.number('_internal', multiply('x', 2))

			const set = Properties.make()
			Properties.collect(set, expr)
			const atRules = Properties.toAtRules(set)
			expect(atRules).toContain('@property --_internal')
			expect(atRules).toContain('inherits: false')
		})

		it('non-_ prefix properties have inherits: true', () => {
			const expr = Properties.number('lightness')

			const set = Properties.make()
			Properties.collect(set, expr)
			const atRules = Properties.toAtRules(set)
			expect(atRules).toContain('@property --lightness')
			expect(atRules).toContain('inherits: true')
		})
	})
})

describe('Properties namespace', () => {
	describe('make', () => {
		it('creates a standalone property set', () => {
			const set = Properties.make()
			expect(Properties.toAtRules(set)).toBe('')
			expect(Properties.toRuleset(set, '.test')).toBe('.test {\n\n}')
		})

		it('creates a child property set linked to parent', () => {
			const parent = Properties.make()
			const child = Properties.make(parent)
			Properties.number(child, '_x')
			// Parent should see child's @property rule
			expect(Properties.toAtRules(parent)).toContain('--_x')
		})
	})

	describe('number', () => {
		it('declares input property without value', () => {
			const set = Properties.make()
			const expr = Properties.number(set, 'lightness')

			// Returns expression referencing the property
			expect(expr.serialize()).toBe('var(--lightness)')

			// Registers @property rule
			const atRules = Properties.toAtRules(set)
			expect(atRules).toContain('@property --lightness')
			expect(atRules).toContain("syntax: '<number>'")
			expect(atRules).toContain('inherits: true')

			// No declaration in ruleset (input-only)
			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).not.toContain('--lightness:')
		})

		it('declares computed property with expression value', () => {
			const set = Properties.make()
			const expr = Properties.number(set, '_doubled', multiply('x', 2))

			expect(expr.serialize()).toBe('var(--_doubled)')

			const atRules = Properties.toAtRules(set)
			expect(atRules).toContain('@property --_doubled')
			expect(atRules).toContain('inherits: false')

			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).toContain('--_doubled: calc(var(--x) * 2)')
		})

		it('declares computed property with numeric value', () => {
			const set = Properties.make()
			Properties.number(set, '_pi', Math.PI)

			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).toContain('--_pi: pi')
		})

		it('collects nested property declarations', () => {
			const set = Properties.make()
			const inner = Properties.number('_inner', multiply('x', 2))
			Properties.number(set, '_outer', add(inner, 5))

			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).toContain('--_inner: calc(var(--x) * 2)')
			expect(ruleset).toContain('--_outer: calc(var(--_inner) + 5)')
		})
	})

	describe('color', () => {
		it('declares color property', () => {
			const set = Properties.make()
			Properties.color(set, 'my-color', oklch(0.5, 0.1, 180))

			const atRules = Properties.toAtRules(set)
			expect(atRules).toContain('@property --my-color')
			expect(atRules).toContain("syntax: '<color>'")
			expect(atRules).toContain('inherits: true')

			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).toContain('--my-color: oklch(0.5 0.1 180)')
		})
	})

	describe('numbers', () => {
		it('batch-defines numeric properties', () => {
			const set = Properties.make()
			Properties.numbers(set, {
				_hue: 25,
				_apexL: 0.65,
				_apexC: 0.28,
			})

			const ruleset = Properties.toRuleset(set, '.red')
			expect(ruleset).toContain('--_hue: 25')
			expect(ruleset).toContain('--_apexL: 0.65')
			expect(ruleset).toContain('--_apexC: 0.28')

			const atRules = Properties.toAtRules(set)
			expect(atRules).toContain('inherits: false')
		})
	})

	describe('collect', () => {
		it('registers all property nodes from an expression', () => {
			const inner = Properties.number('_a', multiply('x', 2))
			const outer = Properties.number('_b', add(inner, 1))

			const set = Properties.make()
			Properties.collect(set, outer)

			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).toContain('--_a: calc(var(--x) * 2)')
			expect(ruleset).toContain('--_b: calc(var(--_a) + 1)')

			const atRules = Properties.toAtRules(set)
			expect(atRules).toContain('@property --_a')
			expect(atRules).toContain('@property --_b')
		})

		it('registers input-only properties', () => {
			const input = Properties.number('lightness')

			const set = Properties.make()
			Properties.collect(set, input)

			const atRules = Properties.toAtRules(set)
			expect(atRules).toContain('@property --lightness')

			const ruleset = Properties.toRuleset(set, '.test')
			expect(ruleset).not.toContain('--lightness:')
		})
	})

	describe('parent-child sharing', () => {
		it('child @property rules are visible from parent toAtRules', () => {
			const parent = Properties.make()
			Properties.number(parent, 'lightness')

			const child = Properties.make(parent)
			Properties.number(child, '_mc', multiply('lightness', 2))

			const atRules = Properties.toAtRules(parent)
			expect(atRules).toContain('--lightness')
			expect(atRules).toContain('--_mc')
		})

		it('child declarations are scoped to child toRuleset', () => {
			const parent = Properties.make()
			Properties.number(parent, 'lightness')

			const child = Properties.make(parent)
			Properties.number(child, '_mc', multiply('lightness', 2))

			const parentRuleset = Properties.toRuleset(parent, '.parent')
			const childRuleset = Properties.toRuleset(child, '.child')

			expect(parentRuleset).not.toContain('--_mc')
			expect(childRuleset).toContain('--_mc')
		})

		it('multiple children share @property rules via parent', () => {
			const parent = Properties.make()
			Properties.number(parent, 'lightness')

			const fill = Properties.make(parent)
			Properties.number(fill, '_fill-mc', multiply('lightness', 2))

			const text = Properties.make(parent)
			Properties.number(text, '_text-mc', multiply('lightness', 3))

			const atRules = Properties.toAtRules(parent)
			expect(atRules).toContain('--lightness')
			expect(atRules).toContain('--_fill-mc')
			expect(atRules).toContain('--_text-mc')
		})
	})

	describe('merge', () => {
		it('merges multiple property sets', () => {
			const set1 = Properties.make()
			Properties.number(set1, '_a', 1)

			const set2 = Properties.make()
			Properties.number(set2, '_b', 2)

			const merged = Properties.merge(set1, set2)
			const atRules = Properties.toAtRules(merged)
			expect(atRules).toContain('--_a')
			expect(atRules).toContain('--_b')
		})

		it('deduplicates compatible @property rules', () => {
			const set1 = Properties.make()
			Properties.number(set1, '_x', 1)

			const set2 = Properties.make()
			Properties.number(set2, '_x', 2) // same name, different value — last wins

			const merged = Properties.merge(set1, set2)
			const ruleset = Properties.toRuleset(merged, '.test')
			expect(ruleset).toContain('--_x: 2')
		})

		it('throws on incompatible @property rules', () => {
			const set1 = Properties.make()
			Properties.number(set1, '_x', 1)

			const set2 = Properties.make()
			Properties.color(set2, '_x', oklch(0.5, 0.1, 180))

			expect(() => Properties.merge(set1, set2)).toThrow(/multiple times.*different rules/i)
		})
	})

	describe('toAtRules', () => {
		it('renders @property rules as CSS', () => {
			const set = Properties.make()
			Properties.number(set, 'lightness')
			Properties.number(set, '_mc', multiply('lightness', 2))

			const css = Properties.toAtRules(set)

			expect(css).toContain(
				"@property --lightness {\n\tinherits: true;\n\tinitial-value: 0;\n\tsyntax: '<number>';\n}",
			)
			expect(css).toContain(
				"@property --_mc {\n\tinherits: false;\n\tinitial-value: 0;\n\tsyntax: '<number>';\n}",
			)
		})
	})

	describe('toRuleset', () => {
		it('renders declarations as CSS selector block', () => {
			const set = Properties.make()
			Properties.number(set, '_x', 42)
			Properties.number(set, '_y', 100)

			const css = Properties.toRuleset(set, '.test')

			expect(css).toBe('.test {\n\t--_x: 42;\n\t--_y: 100;\n}')
		})
	})
})
