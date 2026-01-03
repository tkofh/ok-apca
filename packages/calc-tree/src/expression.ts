import { type ExpressionInput, toExpression } from './constructors.ts'
import { ConstantNode, PropertyNode } from './nodes.ts'
import type { CalcNode, CSSResult, EvaluationResult } from './types.ts'

export class CalcExpression<Refs extends string = never> {
	readonly node: CalcNode
	readonly refs: ReadonlySet<string>

	constructor(node: CalcNode, refs: ReadonlySet<string> = new Set()) {
		this.node = node
		this.refs = refs
	}

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

	asProperty(name: string): CalcExpression<Refs> {
		return new CalcExpression(new PropertyNode(name, this.node), new Set(this.refs))
	}

	evaluate(
		bindings: [Refs] extends [never]
			? Record<string, never> | undefined
			: Record<Refs, ExpressionInput<never>> = {} as Record<string, never>,
	): EvaluationResult {
		const nodeBindings: Record<string, CalcNode> = {}
		if (bindings) {
			for (const [key, value] of Object.entries(bindings) as [string, ExpressionInput<never>][]) {
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

	toCss(): CSSResult {
		const declarations: Record<string, string> = {}
		const rawExpression = this.node.serialize(declarations)
		const expression = this.node.needsCalcWrap() ? `calc(${rawExpression})` : rawExpression
		return { expression, declarations }
	}
}
