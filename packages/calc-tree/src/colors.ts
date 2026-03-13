import {
	bindImpl,
	type ColorExpression,
	type ExpressionInput,
	makeColor,
	mergeRefs,
	nodeOf,
	type RelevantBindingRefs,
	refsOf,
	serializeImpl,
	toExpression,
} from './expression.ts'
import { OklchNode } from './nodes.ts'

export type { ColorExpression as Expression } from './expression.ts'

export function bind<Refs extends string, const B>(
	expr: ColorExpression<Refs>,
	bindings: B & Partial<Record<Refs, ExpressionInput<string>>>,
): ColorExpression<Exclude<Refs, keyof B & string> | RelevantBindingRefs<B, Refs>> {
	const result = bindImpl(nodeOf(expr), refsOf(expr), bindings)
	return makeColor(result.node, result.refs) as ColorExpression<
		Exclude<Refs, keyof B & string> | RelevantBindingRefs<B, Refs>
	>
}

export function serialize<Refs extends string>(
	expr: ColorExpression<Refs>,
	bindings?: Partial<Record<Refs, ExpressionInput<string>>>,
): string {
	return serializeImpl(
		nodeOf(expr),
		refsOf(expr),
		bindings as Record<string, ExpressionInput<string>>,
	)
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
