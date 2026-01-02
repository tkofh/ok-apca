import { PropertyNode } from './nodes.ts'
import type { CalcNode, CSSResult, EvaluationResult } from './types.ts'

/**
 * Symbol for accessing private node - used by constructors
 */
export const NODE = Symbol('node')

/**
 * Symbol for accessing private refs - used by constructors
 */
export const REFS = Symbol('refs')

/**
 * A mathematical expression that can be evaluated or serialized to CSS.
 * Generic over `Refs` - a union of string literal reference names required by this expression.
 */
export class CalcExpression<Refs extends string = never> {
	readonly [NODE]: CalcNode
	readonly [REFS]: Set<string>

	private constructor(node: CalcNode, refs: Set<string>) {
		this[NODE] = node
		this[REFS] = refs
	}

	/**
	 * Create a CalcExpression from a node and refs set.
	 * Internal factory - use constructors from constructors.ts instead.
	 */
	static _create<R extends string>(node: CalcNode, refs: Set<string>): CalcExpression<R> {
		return new CalcExpression(node, refs) as CalcExpression<R>
	}

	/**
	 * Bind a single reference to an expression.
	 * Returns a new expression with the reference removed and any references
	 * from the bound expression added.
	 */
	bind<K extends Refs, R extends string>(
		key: K,
		expr: CalcExpression<R>,
	): CalcExpression<Exclude<Refs, K> | R> {
		// Substitute the reference in the tree
		const nodeBindings: Record<string, CalcNode> = { [key]: expr[NODE] }
		const newNode = this[NODE].substitute(nodeBindings)

		// Update reference set
		const newRefs = new Set(this[REFS])
		newRefs.delete(key)

		// Add references from the bound expression
		for (const ref of expr[REFS]) {
			newRefs.add(ref)
		}

		return CalcExpression._create(newNode, newRefs)
	}

	/**
	 * Wrap this expression as a CSS custom property.
	 * The expression value will be assigned to the property and var(--name) used in its place.
	 */
	asProperty(name: string): CalcExpression<Refs> {
		const propertyNode = new PropertyNode(name, this[NODE])
		return CalcExpression._create(propertyNode, new Set(this[REFS]))
	}

	/**
	 * Evaluate this expression with the given bindings.
	 * If all references resolve to constants, returns a number result.
	 * Otherwise returns an expression result with CSS output.
	 */
	evaluate(
		...[bindings]: [Refs] extends [never]
			? [bindings?: Record<string, CalcExpression<never>>]
			: [bindings: Record<Refs, CalcExpression<never>>]
	): EvaluationResult {
		// Extract nodes from bound expressions
		const nodeBindings: Record<string, CalcNode> = {}
		if (bindings) {
			for (const key of Object.keys(bindings)) {
				const expr = (bindings as Record<string, CalcExpression<never>>)[key]
				if (expr) {
					nodeBindings[key] = expr[NODE]
				}
			}
		}

		// Substitute all bound references
		const substituted = this[NODE].substitute(nodeBindings)

		// Check if result is fully constant
		if (substituted.isConstant()) {
			const value = substituted.evaluateConstant()
			const declarations: Record<string, string> = {}
			const expression = substituted.serialize(declarations)
			return { type: 'number', value, css: { expression, declarations } }
		}

		// Has unbound references - return expression result
		const declarations: Record<string, string> = {}
		const expression = substituted.serialize(declarations)
		return { type: 'expression', css: { expression, declarations } }
	}

	/**
	 * Serialize this expression to CSS without evaluation.
	 * Useful for getting the CSS representation of expressions with unbound refs.
	 */
	toCss(): CSSResult {
		const declarations: Record<string, string> = {}
		const expression = this[NODE].serialize(declarations)
		return { expression, declarations }
	}
}
