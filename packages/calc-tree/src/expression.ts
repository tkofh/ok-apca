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

export class CalcExpression<Refs extends string = never> {
	readonly node: CalcNode
	readonly refs: ReadonlySet<string>

	constructor(node: CalcNode, refs: ReadonlySet<string> = new Set()) {
		this.node = node
		this.refs = refs
	}

	// Single key-value binding
	bind<K extends Refs, R extends string>(
		key: K,
		value: ExpressionInput<R>,
	): CalcExpression<Exclude<Refs, K> | R>

	// Record binding - bind multiple keys at once (partial allowed)
	bind<B extends Partial<Record<Refs, ExpressionInput<string>>>>(
		bindings: B,
	): CalcExpression<Exclude<Refs, keyof B & Refs> | BindingRefs<B>>

	bind<K extends Refs>(
		keyOrBindings: K | Record<K, ExpressionInput<string>>,
		value?: ExpressionInput<string>,
	): CalcExpression<string> {
		// Single key-value case
		if (typeof keyOrBindings === 'string') {
			const expr = toExpression(value as ExpressionInput<string>)
			const newNode = this.node.substitute({ [keyOrBindings]: expr.node })

			const newRefs = new Set(this.refs)
			newRefs.delete(keyOrBindings)
			for (const ref of expr.refs) {
				newRefs.add(ref)
			}

			return new CalcExpression(newNode, newRefs)
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
		return new CalcExpression(newNode, newRefs)
	}

	asProperty(name: string): CalcExpression<Refs> {
		return new CalcExpression(new PropertyNode(name, this.node), new Set(this.refs))
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
