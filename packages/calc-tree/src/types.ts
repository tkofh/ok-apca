export interface CSSResult {
	readonly expression: string
	readonly declarations: Record<string, string>
}

export interface CalcNode {
	readonly kind: string

	substitute(bindings: Record<string, CalcNode>): CalcNode
	isConstant(): boolean
	evaluateConstant(): number
	serialize(declarations: Record<string, string>): string
	needsCalcWrap(): boolean
}
