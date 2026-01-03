export interface CSSResult {
	readonly expression: string
	readonly declarations: Record<string, string>
}

interface NumericEvaluationResult {
	readonly type: 'number'
	readonly value: number
	readonly css: CSSResult
}

interface ExpressionEvaluationResult {
	readonly type: 'expression'
	readonly css: CSSResult
}

export type EvaluationResult = NumericEvaluationResult | ExpressionEvaluationResult

export interface CalcNode {
	readonly kind: string

	substitute(bindings: Record<string, CalcNode>): CalcNode
	isConstant(): boolean
	evaluateConstant(): number
	serialize(declarations: Record<string, string>): string
	needsCalcWrap(): boolean
}
