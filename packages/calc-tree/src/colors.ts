import {
	bindImpl,
	type ColorExpression,
	type ExpressionInput,
	makeColor,
	mergeRefs,
	type RelevantBindingRefs,
	serializeImpl,
	toExpression,
} from './expression.ts'
import { OklchNode } from './nodes.ts'

export type { ColorExpression as Expression } from './expression.ts'

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
	bindings?: Partial<Record<Refs, ExpressionInput<string>>>,
): string {
	return serializeImpl(expr._node, expr._refs, bindings as Record<string, ExpressionInput<string>>)
}

export function oklch<L = never, C = never, H = never>(
	lightness: ExpressionInput<L & string>,
	chroma: ExpressionInput<C & string>,
	hue: ExpressionInput<H & string>,
): ColorExpression<(L & string) | (C & string) | (H & string)> {
	const l = toExpression(lightness)
	const c = toExpression(chroma)
	const h = toExpression(hue)
	return makeColor(new OklchNode(l._node, c._node, h._node), mergeRefs(l, c, h))
}
