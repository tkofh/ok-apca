import { type ExpressionInput, toExpression } from './constructors.ts'
import type { ExpressionNode } from './nodes.ts'

function applyBindings(
	node: ExpressionNode,
	bindings: Record<string, ExpressionInput<never>> | undefined,
	refs: ReadonlySet<string>,
): ExpressionNode {
	if (!bindings) {
		return node
	}
	const nodeBindings: Record<string, ExpressionNode> = {}
	for (const [key, value] of Object.entries(bindings) as [string, ExpressionInput<never>][]) {
		if (refs.has(key)) {
			nodeBindings[key] = toExpression(value).node
		}
	}
	return node.substitute(nodeBindings)
}

// Extract the union of all refs from values in a binding record
type ValueRefs<V> =
	V extends NumberExpression<infer R>
		? R
		: V extends string
			? string extends V
				? never // exclude bare 'string' type — only track literal refs
				: V
			: never
type BindingRefs<T> = T extends Record<string, infer V> ? ValueRefs<V> : never

// Pick only the binding entries that match actual expression refs
type RelevantBindingRefs<B, Refs extends string> = BindingRefs<
	Pick<B, Extract<keyof B & string, Refs>>
>

/**
 * Abstract base class for expression trees.
 * Provides shared functionality for binding and CSS generation.
 */
export abstract class BaseExpression<Refs extends string = never> {
	readonly node: ExpressionNode
	readonly refs: ReadonlySet<string>

	constructor(node: ExpressionNode, refs: ReadonlySet<string> = new Set()) {
		this.node = node
		this.refs = refs
	}

	/**
	 * Factory method for creating new instances of the same type.
	 * Subclasses must implement this to return their own type.
	 */
	protected abstract create<R extends string>(
		node: ExpressionNode,
		refs: ReadonlySet<string>,
	): BaseExpression<R>

	bind<B>(
		bindings: B & Partial<Record<Refs, ExpressionInput<string>>>,
	): BaseExpression<Exclude<Refs, keyof B & string> | RelevantBindingRefs<B, Refs>> {
		const nodeBindings: Record<string, ExpressionNode> = {}
		const newRefs = new Set(this.refs)

		for (const [key, val] of Object.entries(bindings as Record<string, ExpressionInput<string>>)) {
			if (!this.refs.has(key)) {
				continue
			}
			const expr = toExpression(val)
			nodeBindings[key] = expr.node
			newRefs.delete(key)
			for (const ref of expr.refs) {
				newRefs.add(ref)
			}
		}

		const newNode = this.node.substitute(nodeBindings)
		return this.create(newNode, newRefs) as BaseExpression<
			Exclude<Refs, keyof B & string> | RelevantBindingRefs<B, Refs>
		>
	}

	/**
	 * Serialize the expression to a CSS string.
	 * Optionally accepts bindings to substitute before serialization.
	 */
	serialize(bindings?: Partial<Record<Refs, ExpressionInput<never>>>): string {
		const substituted = applyBindings(
			this.node,
			bindings as Record<string, ExpressionInput<never>>,
			this.refs,
		)
		const declarations: Record<string, string> = {}
		const raw = substituted.serialize(declarations)
		return substituted.needsCalcWrap() ? `calc(${raw})` : raw
	}
}

/**
 * Expression tree for numeric calculations.
 * Can be evaluated to a number or serialized to CSS calc().
 */
export class NumberExpression<Refs extends string = never> extends BaseExpression<Refs> {
	protected override create<R extends string>(
		node: ExpressionNode,
		refs: ReadonlySet<string>,
	): NumberExpression<R> {
		return new NumberExpression<R>(node, refs)
	}

	override bind<const B>(
		bindings: B & Partial<Record<Refs, ExpressionInput<string>>>,
	): NumberExpression<Exclude<Refs, keyof B & string> | RelevantBindingRefs<B, Refs>> {
		return super.bind(bindings) as NumberExpression<
			Exclude<Refs, keyof B & string> | RelevantBindingRefs<B, Refs>
		>
	}

	/**
	 * Evaluate the expression to a numeric value.
	 * Throws if the expression contains unbound references after applying bindings.
	 */
	solve<B = Record<string, never>>(
		bindings: [Refs] extends [never]
			? Record<string, never> | undefined
			: B & Record<Refs, ExpressionInput<never>> = {} as never,
	): number {
		const substituted = applyBindings(
			this.node,
			bindings as Record<string, ExpressionInput<never>>,
			this.refs,
		)

		if (!substituted.isConstant()) {
			throw new Error('Cannot convert expression to number: unbound references remain')
		}

		return substituted.evaluateConstant()
	}
}

/**
 * Expression tree for color values.
 * Can be serialized to CSS but cannot be evaluated to a number.
 * Cannot be used in arithmetic operations.
 */
export class ColorExpression<Refs extends string = never> extends BaseExpression<Refs> {
	protected override create<R extends string>(
		node: ExpressionNode,
		refs: ReadonlySet<string>,
	): ColorExpression<R> {
		return new ColorExpression<R>(node, refs)
	}

	override bind<B>(
		bindings: B & Partial<Record<Refs, ExpressionInput<string>>>,
	): ColorExpression<Exclude<Refs, keyof B & string> | RelevantBindingRefs<B, Refs>> {
		return super.bind(bindings) as ColorExpression<
			Exclude<Refs, keyof B & string> | RelevantBindingRefs<B, Refs>
		>
	}
}
