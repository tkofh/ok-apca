import {
	bindImpl,
	type ColorExpression,
	type ExpressionInput,
	type InferRefs,
	makeColor,
	mergeRefs,
	type RelevantBindingRefs,
	serializeImpl,
	toExpression,
} from './expression.ts'
import { OklchNode } from './nodes.ts'

// =============================================================================
// Re-exported Types
// =============================================================================

export type { ColorExpression as Expression } from './expression.ts'

// =============================================================================
// Expression Operations
// =============================================================================

export function bind<Refs extends string, const B>(
	expr: ColorExpression<Refs>,
	bindings: B & Partial<Record<Refs, ExpressionInput<string>>>,
): ColorExpression<Exclude<Refs, keyof B & string> | RelevantBindingRefs<B, Refs>> {
	const result = bindImpl(expr._node, expr._refs, bindings)
	return makeColor(result.node, result.refs) as ColorExpression<
		Exclude<Refs, keyof B & string> | RelevantBindingRefs<B, Refs>
	>
}

export function serialize<Refs extends string>(
	expr: ColorExpression<Refs>,
	bindings?: Partial<Record<Refs, ExpressionInput<never>>>,
): string {
	return serializeImpl(expr._node, expr._refs, bindings as Record<string, ExpressionInput<never>>)
}

// =============================================================================
// Color Constructor
// =============================================================================

export function oklch<
	L extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
	H extends ExpressionInput<string>,
>(lightness: L, chroma: C, hue: H): ColorExpression<InferRefs<L> | InferRefs<C> | InferRefs<H>> {
	const l = toExpression(lightness)
	const c = toExpression(chroma)
	const h = toExpression(hue)
	return makeColor(new OklchNode(l._node, c._node, h._node), mergeRefs(l, c, h))
}
