import {
	type ApplyBindings,
	type BindingsInput,
	bindImpl,
	type ColorExpression,
	type ExpressionInput,
	makeColor,
	mergeRefs,
	nodeOf,
	refsOf,
	serializeImpl,
	toExpression,
} from './expression.ts'
import { OklchNode } from './nodes.ts'

export type { ColorExpression as Expression } from './expression.ts'

export function bind<Refs extends string, const B extends BindingsInput>(
	expr: ColorExpression<Refs>,
	bindings: B,
): ColorExpression<ApplyBindings<Refs, B>> {
	const result = bindImpl(nodeOf(expr), refsOf(expr), bindings)
	return makeColor(result.node, result.refs)
}

export function serialize<Refs extends string>(
	expr: ColorExpression<Refs>,
	bindings?: Partial<BindingsInput<Refs>>,
): string {
	return serializeImpl(nodeOf(expr), refsOf(expr), bindings as BindingsInput)
}

export function oklch<L = never, C = never, H = never>(
	lightness: ExpressionInput<L & string>,
	chroma: ExpressionInput<C & string>,
	hue: ExpressionInput<H & string>,
): ColorExpression<(L & string) | (C & string) | (H & string)> {
	const l = toExpression(lightness)
	const c = toExpression(chroma)
	const h = toExpression(hue)
	return makeColor(new OklchNode(nodeOf(l), nodeOf(c), nodeOf(h)), mergeRefs(l, c, h))
}
