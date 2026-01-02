/**
 * Result of CSS serialization
 */
export type CSSResult = {
	expression: string
	declarations: Record<string, string>
}

/**
 * Evaluation result - either a computed number or an expression with unbound references
 */
export type EvaluationResult =
	| { type: 'number'; value: number; css: CSSResult }
	| { type: 'expression'; css: CSSResult }

/**
 * Internal node interface - implemented by all expression node classes
 */
export interface CalcNode {
	readonly kind: string

	/**
	 * Substitute references with their bound nodes
	 */
	substitute(bindings: Record<string, CalcNode>): CalcNode

	/**
	 * Check if this node (and all children) are constants
	 */
	isConstant(): boolean

	/**
	 * Evaluate this node to a number (only valid if isConstant() is true)
	 */
	evaluateConstant(): number

	/**
	 * Serialize this node to CSS, collecting property declarations
	 */
	serialize(declarations: Record<string, string>): string

	/**
	 * Whether this node requires calc() wrapping when used as a CSS value.
	 * True for arithmetic operations (+, -, *, /), false for literals, var(), and function calls.
	 */
	needsCalcWrap(): boolean
}
