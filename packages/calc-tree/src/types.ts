export interface PropertyRule {
	readonly syntax: '<number>' | '<color>'
	readonly inherits: boolean
	readonly initialValue: string
}

export interface CSSResult {
	readonly expression: string
	readonly declarations: Record<string, string>
	readonly properties: Record<string, PropertyRule>

	/**
	 * Format all declarations as a CSS declaration block.
	 * Each declaration is on its own line, ending with a semicolon.
	 */
	toDeclarationBlock(): string

	/**
	 * Format all @property rules as CSS.
	 */
	toPropertyRules(): string
}

export interface ExpressionNode {
	readonly kind: string

	substitute(bindings: Record<string, ExpressionNode>): ExpressionNode
	isConstant(): boolean
	evaluateConstant(): number
	serialize(declarations: Record<string, string>, properties?: Record<string, PropertyRule>): string
	needsCalcWrap(): boolean
}
