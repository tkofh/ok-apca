import { type ExpressionInput, toExpression } from './constructors.ts'
import { ConstantNode, PropertyNode } from './nodes.ts'
import type { CalcNode, CSSResult, EvaluationResult } from './types.ts'

/**
 * A mathematical expression that can be evaluated or serialized to CSS.
 * Generic over `Refs` - a union of string literal reference names required by this expression.
 */
export class CalcExpression<Refs extends string = never> {
	readonly node: CalcNode
	readonly refs: ReadonlySet<string>

	constructor(node: CalcNode, refs: ReadonlySet<string> = new Set()) {
		this.node = node
		this.refs = refs
	}

	/**
	 * Bind a single reference to an expression or number.
	 * Returns a new expression with the reference removed and any references
	 * from the bound expression added.
	 */
	bind<K extends Refs, R extends string>(
		key: K,
		value: ExpressionInput<R>,
	): CalcExpression<Exclude<Refs, K> | R> {
		const expr = toExpression(value)
		const newNode = this.node.substitute({ [key]: expr.node })

		const newRefs = new Set(this.refs)
		newRefs.delete(key)
		for (const ref of expr.refs) {
			newRefs.add(ref)
		}

		return new CalcExpression(newNode, newRefs)
	}

	/**
	 * Wrap this expression as a CSS custom property.
	 * The expression value will be assigned to the property and var(--name) used in its place.
	 */
	asProperty(name: string): CalcExpression<Refs> {
		return new CalcExpression(new PropertyNode(name, this.node), new Set(this.refs))
	}

	/**
	 * Evaluate this expression with the given bindings.
	 * Bindings can be CalcExpressions or plain numbers.
	 * If all references resolve to constants, returns a number result.
	 * Otherwise returns an expression result with CSS output.
	 */
	evaluate(
		bindings: [Refs] extends [never]
			? Record<string, never> | undefined
			: Record<Refs, ExpressionInput<never>> = {} as Record<string, never>,
	): EvaluationResult {
		const nodeBindings: Record<string, CalcNode> = {}
		if (bindings) {
			for (const [key, value] of Object.entries(bindings) as [string, ExpressionInput<never>][]) {
				// Handle numbers directly without going through toExpression
				if (typeof value === 'number') {
					nodeBindings[key] = new ConstantNode(value)
				} else {
					nodeBindings[key] = value.node
				}
			}
		}

		const substituted = this.node.substitute(nodeBindings)

		const declarations: Record<string, string> = {}
		const rawExpression = substituted.serialize(declarations)
		const expression = substituted.needsCalcWrap() ? `calc(${rawExpression})` : rawExpression

		if (substituted.isConstant()) {
			const value = substituted.evaluateConstant()
			return { type: 'number', value, css: { expression, declarations } }
		}

		return { type: 'expression', css: { expression, declarations } }
	}

	/**
	 * Serialize this expression to CSS without evaluation.
	 * Useful for getting the CSS representation of expressions with unbound refs.
	 */
	toCss(): CSSResult {
		const declarations: Record<string, string> = {}
		const rawExpression = this.node.serialize(declarations)
		const expression = this.node.needsCalcWrap() ? `calc(${rawExpression})` : rawExpression
		return { expression, declarations }
	}
}
