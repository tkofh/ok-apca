import {
	type ColorExpression,
	makeColor,
	makeNumber,
	type NumberExpression,
	nodeOf,
	refsOf,
	toExpression,
} from './expression.ts'
import { formatNumber, PropertyNode } from './nodes.ts'

export interface PropertyEntry {
	readonly rule: PropertyRule
	readonly declaration?: string
}

export interface PropertyRule {
	readonly syntax: '<number>' | '<color>'
	readonly inherits: boolean
	readonly initialValue: string
}

declare const brand: unique symbol

/**
 * A mutable collection of CSS `@property` rules and declarations.
 *
 * Created via `Properties.make()`. Child sets contribute their `@property`
 * rules to a parent, enabling shared rule emission across multiple selector
 * blocks.
 */
export interface Properties {
	readonly [brand]?: true
}

interface InternalProperties extends Properties {
	readonly _entries: Map<string, PropertyEntry>
	readonly _children: InternalProperties[]
	readonly _parent: InternalProperties | null
}

function internal(set: Properties): InternalProperties {
	return set as InternalProperties
}

function inheritsFromName(name: string): boolean {
	return !name.startsWith('_')
}

function addEntry(
	set: InternalProperties,
	cssName: string,
	rule: PropertyRule,
	declaration?: string,
): void {
	const existing = set._entries.get(cssName)
	if (existing) {
		if (existing.rule.syntax !== rule.syntax || existing.rule.inherits !== rule.inherits) {
			throw new Error(`Property '${cssName}' defined multiple times with different rules`)
		}
		if (
			declaration !== undefined &&
			existing.declaration !== undefined &&
			existing.declaration !== declaration
		) {
			throw new Error(`Property '${cssName}' defined multiple times with different values`)
		}
	}

	const decl = declaration ?? existing?.declaration
	set._entries.set(cssName, decl !== undefined ? { rule, declaration: decl } : { rule })

	// Propagate @property rule to parent (rule only, not declaration)
	if (set._parent && !set._parent._entries.has(cssName)) {
		set._parent._entries.set(cssName, { rule })
	}
}

function makeRule(syntax: '<number>' | '<color>', inherits: boolean): PropertyRule {
	return { syntax, inherits, initialValue: syntax === '<color>' ? 'transparent' : '0' }
}

/** Create a new property set, optionally linked to a parent. */
export function make(parent?: Properties): Properties {
	const p = parent ? internal(parent) : null
	const set: InternalProperties = {
		_entries: new Map(),
		_children: [],
		_parent: p,
	}
	if (p) {
		p._children.push(set)
	}
	return set
}

/**
 * Walk an expression's property nodes and register all `@property` rules
 * and declarations into the given property set.
 */
export function collect(set: Properties, expr: NumberExpression | ColorExpression): void {
	const s = internal(set)
	const declarations: Record<string, string> = {}
	const properties: Record<string, PropertyRule> = {}
	nodeOf(expr).serialize(declarations, properties)
	for (const [name, rule] of Object.entries(properties)) {
		addEntry(s, name, rule, declarations[name])
	}
}

/** Declare a numeric input property (no set, pure expression). */
export function number<const N extends string>(name: N): NumberExpression<N>
/** Wrap a numeric expression as a computed property (no set, pure expression). */
export function number<const N extends string, Refs extends string>(
	name: N,
	value: NumberExpression<Refs> | number,
): NumberExpression<Refs>
/** Declare a numeric input property (no value) or computed property (with value). */
export function number<const N extends string>(set: Properties, name: N): NumberExpression<N>
export function number<Refs extends string>(
	set: Properties,
	name: string,
	value: NumberExpression<Refs> | number,
): NumberExpression<Refs>
export function number(
	setOrName: Properties | string,
	nameOrValue?: string | NumberExpression | number,
	value?: NumberExpression | number,
): NumberExpression {
	// No-set overloads: number(name) or number(name, value)
	if (typeof setOrName === 'string') {
		const name = setOrName
		const inherits = inheritsFromName(name)
		if (nameOrValue === undefined) {
			return makeNumber(new PropertyNode(name, null, '<number>', inherits), new Set([name]))
		}
		const expr = typeof nameOrValue === 'number' ? toExpression(nameOrValue) : nameOrValue
		return makeNumber(
			new PropertyNode(name, nodeOf(expr as NumberExpression), '<number>', inherits),
			refsOf(expr as NumberExpression),
		)
	}

	// Set overloads: delegate to no-set, then collect
	const set = setOrName
	const name = nameOrValue as string
	const result = value === undefined ? number(name) : number(name, value)
	collect(set, result)
	return result
}

/** Wrap a color expression as a computed property (no set, pure expression). */
export function color<const N extends string, Refs extends string>(
	name: N,
	value: ColorExpression<Refs>,
): ColorExpression<Refs>
/** Declare a color output property. Color properties always require a value. */
export function color<Refs extends string>(
	set: Properties,
	name: string,
	value: ColorExpression<Refs>,
): ColorExpression<Refs>
export function color(
	setOrName: Properties | string,
	nameOrValue: string | ColorExpression,
	value?: ColorExpression,
): ColorExpression {
	// No-set overload: color(name, value)
	if (typeof setOrName === 'string') {
		const name = setOrName
		const expr = nameOrValue as ColorExpression
		return makeColor(
			new PropertyNode(name, nodeOf(expr), '<color>', inheritsFromName(name)),
			refsOf(expr),
		)
	}

	// Set overload: delegate to no-set, then collect
	const set = setOrName
	const name = nameOrValue as string
	const colorValue = value as ColorExpression
	const result = color(name, colorValue)
	collect(set, result)
	return result
}

/** Batch-define numeric properties from a record of values. */
export function numbers(set: Properties, values: Record<string, number | NumberExpression>): void {
	const s = internal(set)
	for (const [name, value] of Object.entries(values)) {
		if (typeof value === 'number') {
			addEntry(s, `--${name}`, makeRule('<number>', inheritsFromName(name)), formatNumber(value))
		} else {
			number(set, name, value)
		}
	}
}

function mergeEntryInto(
	target: Map<string, PropertyEntry>,
	name: string,
	entry: PropertyEntry,
): void {
	const existing = target.get(name)
	if (
		existing &&
		(existing.rule.syntax !== entry.rule.syntax || existing.rule.inherits !== entry.rule.inherits)
	) {
		throw new Error(`Property '${name}' defined multiple times with different rules`)
	}
	target.set(name, entry)
}

/** Merge multiple property sets into a single set. */
export function merge(...sets: Properties[]): Properties {
	const merged = internal(make())
	for (const set of sets) {
		const s = internal(set)
		for (const [name, entry] of s._entries) {
			mergeEntryInto(merged._entries, name, entry)
		}
		for (const child of s._children) {
			for (const [name, entry] of child._entries) {
				if (!merged._entries.has(name)) {
					merged._entries.set(name, { rule: entry.rule })
				}
			}
		}
	}
	return merged
}

function collectAllRules(set: InternalProperties): Map<string, PropertyRule> {
	const rules = new Map<string, PropertyRule>()
	for (const [name, entry] of set._entries) {
		rules.set(name, entry.rule)
	}
	for (const child of set._children) {
		for (const [name, entry] of child._entries) {
			if (!rules.has(name)) {
				rules.set(name, entry.rule)
			}
		}
	}
	return rules
}

/** Iterate over all property entries in this set. */
export function entries(set: Properties): IterableIterator<[string, PropertyEntry]> {
	return internal(set)._entries.entries()
}

/** Render all `@property` rules from this set and its children as CSS. */
export function toAtRules(set: Properties): string {
	const rules = collectAllRules(internal(set))
	return [...rules.entries()]
		.map(
			([name, rule]) =>
				`@property ${name} {\n\tinherits: ${rule.inherits ? 'true' : 'false'};\n\tinitial-value: ${rule.initialValue};\n\tsyntax: '${rule.syntax}';\n}`,
		)
		.join('\n')
}

/** Render this set's declarations as a CSS selector block. */
export function toRuleset(set: Properties, selector: string): string {
	const decls: string[] = []
	for (const [name, entry] of internal(set)._entries) {
		if (entry.declaration !== undefined) {
			decls.push(`\t${name}: ${entry.declaration};`)
		}
	}
	return `${selector} {\n${decls.join('\n')}\n}`
}
