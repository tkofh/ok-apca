import { type ExpressionInput, toExpression } from './constructors.ts'
import { ConstantNode, PropertyNode } from './nodes.ts'
import type { CalcNode, CSSResult } from './types.ts'

function createCSSResult(expression: string, declarations: Record<string, string>): CSSResult {
	return {
		expression,
		declarations,
		toDeclarationBlock() {
			return Object.entries(declarations)
				.map(([name, value]) => `${name}: ${value};`)
				.join('\n')
		},
	}
}

function applyBindings(
	node: CalcNode,
	bindings: Record<string, ExpressionInput<never>> | undefined,
): CalcNode {
	if (!bindings) {
		return node
	}
	const nodeBindings: Record<string, CalcNode> = {}
	for (const [key, value] of Object.entries(bindings) as [string, ExpressionInput<never>][]) {
		if (typeof value === 'number') {
			nodeBindings[key] = new ConstantNode(value)
		} else {
			nodeBindings[key] = value.node
		}
	}
	return node.substitute(nodeBindings)
}

// Extract the union of all refs from values in a binding record
type BindingRefs<T> = T extends Record<string, ExpressionInput<infer R>> ? R : never

/**
 * Abstract base class for expression trees.
 * Provides shared functionality for binding, CSS generation, and property creation.
 */
export abstract class BaseExpression<Refs extends string = never> {
	readonly node: CalcNode
	readonly refs: ReadonlySet<string>

	constructor(node: CalcNode, refs: ReadonlySet<string> = new Set()) {
		this.node = node
		this.refs = refs
	}

	/**
	 * Factory method for creating new instances of the same type.
	 * Subclasses must implement this to return their own type.
	 */
	protected abstract create<R extends string>(
		node: CalcNode,
		refs: ReadonlySet<string>,
	): BaseExpression<R>

	// Single key-value binding
	bind<K extends Refs, R extends string>(
		key: K,
		value: ExpressionInput<R>,
	): BaseExpression<Exclude<Refs, K> | R>

	// Record binding - bind multiple keys at once (partial allowed)
	bind<B extends Partial<Record<Refs, ExpressionInput<string>>>>(
		bindings: B,
	): BaseExpression<Exclude<Refs, keyof B & Refs> | BindingRefs<B>>

	bind<K extends Refs>(
		keyOrBindings: K | Record<K, ExpressionInput<string>>,
		value?: ExpressionInput<string>,
	): BaseExpression<string> {
		// Single key-value case
		if (typeof keyOrBindings === 'string') {
			const expr = toExpression(value as ExpressionInput<string>)
			const newNode = this.node.substitute({ [keyOrBindings]: expr.node })

			const newRefs = new Set(this.refs)
			newRefs.delete(keyOrBindings)
			for (const ref of expr.refs) {
				newRefs.add(ref)
			}

			return this.create(newNode, newRefs)
		}

		// Record case
		const bindings = keyOrBindings
		const nodeBindings: Record<string, CalcNode> = {}
		const newRefs = new Set(this.refs)

		for (const [key, val] of Object.entries(bindings) as [string, ExpressionInput<string>][]) {
			const expr = toExpression(val)
			nodeBindings[key] = expr.node
			newRefs.delete(key)
			for (const ref of expr.refs) {
				newRefs.add(ref)
			}
		}

		const newNode = this.node.substitute(nodeBindings)
		return this.create(newNode, newRefs)
	}

	asProperty(name: string): BaseExpression<Refs> {
		return this.create(new PropertyNode(name, this.node), new Set(this.refs))
	}

	/**
	 * Generate CSS from the expression.
	 * Optionally accepts bindings to substitute before serialization.
	 */
	toCss(bindings?: Partial<Record<Refs, ExpressionInput<never>>>): CSSResult {
		const substituted = applyBindings(this.node, bindings as Record<string, ExpressionInput<never>>)
		const declarations: Record<string, string> = {}
		const rawExpression = substituted.serialize(declarations)
		const expression = substituted.needsCalcWrap() ? `calc(${rawExpression})` : rawExpression
		return createCSSResult(expression, declarations)
	}
}

/**
 * Expression tree for numeric calculations.
 * Can be evaluated to a number or serialized to CSS calc().
 */
export class CalcExpression<Refs extends string = never> extends BaseExpression<Refs> {
	protected override create<R extends string>(
		node: CalcNode,
		refs: ReadonlySet<string>,
	): CalcExpression<R> {
		return new CalcExpression<R>(node, refs)
	}

	override bind<K extends Refs, R extends string>(
		key: K,
		value: ExpressionInput<R>,
	): CalcExpression<Exclude<Refs, K> | R>

	override bind<B extends Partial<Record<Refs, ExpressionInput<string>>>>(
		bindings: B,
	): CalcExpression<Exclude<Refs, keyof B & Refs> | BindingRefs<B>>

	override bind<K extends Refs>(
		keyOrBindings: K | Record<K, ExpressionInput<string>>,
		value?: ExpressionInput<string>,
	): CalcExpression<string> {
		return super.bind(
			keyOrBindings as K,
			value as ExpressionInput<string>,
		) as CalcExpression<string>
	}

	override asProperty(name: string): CalcExpression<Refs> {
		return super.asProperty(name) as CalcExpression<Refs>
	}

	/**
	 * Evaluate the expression to a numeric value.
	 * Throws if the expression contains unbound references after applying bindings.
	 */
	toNumber(
		bindings: [Refs] extends [never]
			? Record<string, never> | undefined
			: Record<Refs, ExpressionInput<never>> = {} as Record<string, never>,
	): number {
		const substituted = applyBindings(this.node, bindings as Record<string, ExpressionInput<never>>)

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
		node: CalcNode,
		refs: ReadonlySet<string>,
	): ColorExpression<R> {
		return new ColorExpression<R>(node, refs)
	}

	override bind<K extends Refs, R extends string>(
		key: K,
		value: ExpressionInput<R>,
	): ColorExpression<Exclude<Refs, K> | R>

	override bind<B extends Partial<Record<Refs, ExpressionInput<string>>>>(
		bindings: B,
	): ColorExpression<Exclude<Refs, keyof B & Refs> | BindingRefs<B>>

	override bind<K extends Refs>(
		keyOrBindings: K | Record<K, ExpressionInput<string>>,
		value?: ExpressionInput<string>,
	): ColorExpression<string> {
		return super.bind(
			keyOrBindings as K,
			value as ExpressionInput<string>,
		) as ColorExpression<string>
	}

	override asProperty(name: string): ColorExpression<Refs> {
		return super.asProperty(name) as ColorExpression<Refs>
	}
}
