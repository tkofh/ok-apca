import { property } from './constructors.ts'
import type { ColorExpression, NumberExpression } from './expression.ts'
import { formatNumber } from './nodes.ts'
import type { PropertyRule } from './types.ts'

/**
 * Collects CSS declarations and @property rules from expression trees.
 *
 * Wraps `ct.property()` — each call creates the expression AND collects
 * its CSS output internally. Provides rendering methods for @property rules
 * and selector blocks.
 */
class DeclarationBlock {
	private readonly declarations: Record<string, string> = {}
	private readonly properties: Record<string, PropertyRule> = {}

	/** Declare a numeric input property. */
	property<const N extends string>(name: N, type: 'number', inherits?: boolean): NumberExpression<N>
	/** Declare a color input property. */
	property<const N extends string>(name: N, type: 'color', inherits?: boolean): ColorExpression<N>
	/** Wrap a numeric expression as a computed property. */
	property<const N extends string, Refs extends string>(
		name: N,
		value: NumberExpression<Refs> | number,
		inherits?: boolean,
	): NumberExpression<Refs>
	/** Wrap a color expression as a computed property. */
	property<const N extends string, Refs extends string>(
		name: N,
		value: ColorExpression<Refs>,
		inherits?: boolean,
	): ColorExpression<Refs>
	property(
		name: string,
		typeOrValue: 'number' | 'color' | NumberExpression<string> | ColorExpression<string> | number,
		inherits?: boolean,
	): NumberExpression<string> | ColorExpression<string> {
		const expr = property(name, typeOrValue as 'number', inherits)
		const css = expr.toCss()
		Object.assign(this.declarations, css.declarations)
		Object.assign(this.properties, css.properties)
		return expr
	}

	/**
	 * Set a literal CSS declaration value.
	 * Numbers are formatted to match calc-tree's precision (5 decimal places max).
	 */
	set(name: string, value: number | string): void {
		this.declarations[`--${name}`] = typeof value === 'number' ? formatNumber(value) : value
	}

	/** Assign multiple literal declarations from an object. */
	assign(values: Record<string, number | string>): this
	/** Assign multiple literal declarations from an object, prefixing each key. */
	assign(prefix: string, values: Record<string, number | string>): this
	assign(
		prefixOrValues: string | Record<string, number | string>,
		maybeValues?: Record<string, number | string>,
	): this {
		const [prefix, values] =
			typeof prefixOrValues === 'string'
				? [prefixOrValues, maybeValues as Record<string, string | number>]
				: ['', prefixOrValues]
		for (const [key, value] of Object.entries(values)) {
			this.set(`${prefix}${key}`, value)
		}

		return this
	}

	/** Format all collected @property rules as CSS. */
	toPropertyRules(): string {
		return Object.entries(this.properties)
			.map(
				([name, rule]) =>
					`@property ${name} {\n\tinherits: ${rule.inherits ? 'true' : 'false'};\n\tinitial-value: ${rule.initialValue};\n\tsyntax: '${rule.syntax}';\n}`,
			)
			.join('\n')
	}

	/** Format as a CSS selector block. */
	toSelector(selector: string): string {
		const decls = Object.entries(this.declarations)
			.map(([name, value]) => `\t${name}: ${value};`)
			.join('\n')
		return `${selector} {\n${decls}\n}`
	}
}
export type { DeclarationBlock }

/** Create a new declaration block for collecting CSS output. */
export function declarations(): DeclarationBlock {
	return new DeclarationBlock()
}
