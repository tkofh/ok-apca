export interface CSSResult {
	readonly expression: string
	readonly declarations: Record<string, string>

	/**
	 * Format all declarations as a CSS declaration block.
	 * Each declaration is on its own line, ending with a semicolon.
	 */
	toDeclarationBlock(): string
}

export interface CalcNode {
	readonly kind: string

	substitute(bindings: Record<string, CalcNode>): CalcNode
	isConstant(): boolean
	evaluateConstant(): number
	serialize(declarations: Record<string, string>): string
	needsCalcWrap(): boolean
}
