import { ColorExpression, NumberExpression } from './expression.ts'
import {
	AbsNode,
	AddNode,
	ClampNode,
	ConstantNode,
	DivideNode,
	MaxNode,
	MinNode,
	MultiplyNode,
	OklchNode,
	PowNode,
	PropertyNode,
	ReferenceNode,
	SignedPowNode,
	SignNode,
	SinNode,
	SubtractNode,
} from './nodes.ts'

export type ExpressionInput<Refs extends string = never> = NumberExpression<Refs> | number | string

export type InferRefs<T> =
	T extends NumberExpression<infer R>
		? R
		: T extends string
			? string extends T
				? never
				: T
			: never

class ConstantValueTypeError extends TypeError {
	readonly value: unknown
	constructor(value: unknown) {
		super(`Constant value must be a finite number, got ${value}`)
		this.value = value
	}
}

export function constant(value: number | string): NumberExpression<never> {
	const num = typeof value === 'string' ? Number(value) : value
	if (!Number.isFinite(num)) {
		throw new ConstantValueTypeError(value)
	}
	return new NumberExpression(new ConstantNode(num))
}

const referenceCache = new Map<string, NumberExpression<string>>()

export function reference<Name extends string>(name: Name): NumberExpression<Name> {
	const cached = referenceCache.get(name)
	if (cached) {
		return cached as NumberExpression<Name>
	}
	if (name.length === 0) {
		throw new TypeError('Reference name must be a non-empty string')
	}
	const expr = new NumberExpression(new ReferenceNode(name), new Set([name]))
	referenceCache.set(name, expr)
	return expr
}

export function toExpression<A extends ExpressionInput<string>>(
	input: A,
): NumberExpression<InferRefs<A>> {
	if (typeof input === 'number') {
		return constant(input) as NumberExpression<InferRefs<A>>
	}
	if (typeof input === 'string') {
		return reference(input) as NumberExpression<InferRefs<A>>
	}
	return input as NumberExpression<InferRefs<A>>
}

function mergeRefs(...exprs: NumberExpression<string>[]): Set<string> {
	const refs = new Set<string>()
	for (const expr of exprs) {
		for (const ref of expr.refs) {
			refs.add(ref)
		}
	}
	return refs
}

function isConstant(node: unknown): node is ConstantNode {
	return node instanceof ConstantNode
}

export function add<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	a: A,
	b: B,
): NumberExpression<InferRefs<A> | InferRefs<B>>
export function add<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
>(a: A, b: B, c: C): NumberExpression<InferRefs<A> | InferRefs<B> | InferRefs<C>>
export function add<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
	D extends ExpressionInput<string>,
>(
	a: A,
	b: B,
	c: C,
	d: D,
): NumberExpression<InferRefs<A> | InferRefs<B> | InferRefs<C> | InferRefs<D>>
export function add(
	...args: [ExpressionInput<string>, ExpressionInput<string>, ...ExpressionInput<string>[]]
): NumberExpression<string>
export function add(...args: ExpressionInput<string>[]): NumberExpression<string> {
	const exprs = args.map((a) => toExpression(a))
	if (exprs.every((e) => isConstant(e.node))) {
		const sum = (exprs as NumberExpression<never>[]).reduce(
			(acc, e) => acc + e.node.evaluateConstant(),
			0,
		)
		return new NumberExpression(new ConstantNode(sum), new Set())
	}
	return new NumberExpression(new AddNode(exprs.map((e) => e.node)), mergeRefs(...exprs))
}

export function subtract<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	left: A,
	right: B,
): NumberExpression<InferRefs<A> | InferRefs<B>> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstant(l.node) && isConstant(r.node)
			? new ConstantNode(l.node.value - r.node.value)
			: new SubtractNode(l.node, r.node)
	return new NumberExpression(node, mergeRefs(l, r))
}

export function multiply<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	left: A,
	right: B,
): NumberExpression<InferRefs<A> | InferRefs<B>> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstant(l.node) && isConstant(r.node)
			? new ConstantNode(l.node.value * r.node.value)
			: new MultiplyNode(l.node, r.node)
	return new NumberExpression(node, mergeRefs(l, r))
}

export function divide<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	left: A,
	right: B,
): NumberExpression<InferRefs<A> | InferRefs<B>> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstant(l.node) && isConstant(r.node)
			? new ConstantNode(l.node.value / r.node.value)
			: new DivideNode(l.node, r.node)
	return new NumberExpression(node, mergeRefs(l, r))
}

export function pow<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	base: A,
	exponent: B,
): NumberExpression<InferRefs<A> | InferRefs<B>> {
	const b = toExpression(base)
	const e = toExpression(exponent)
	const node =
		isConstant(b.node) && isConstant(e.node)
			? new ConstantNode(b.node.value ** e.node.value)
			: new PowNode(b.node, e.node)
	return new NumberExpression(node, mergeRefs(b, e))
}

export function signedPow<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	base: A,
	exponent: B,
): NumberExpression<InferRefs<A> | InferRefs<B>> {
	const b = toExpression(base)
	const e = toExpression(exponent)
	const node =
		isConstant(b.node) && isConstant(e.node)
			? new ConstantNode(Math.abs(b.node.value) ** e.node.value * Math.sign(b.node.value))
			: new SignedPowNode(b.node, e.node)
	return new NumberExpression(node, mergeRefs(b, e))
}

export function sin<A extends ExpressionInput<string>>(arg: A): NumberExpression<InferRefs<A>> {
	const a = toExpression(arg)
	const node = isConstant(a.node) ? new ConstantNode(Math.sin(a.node.value)) : new SinNode(a.node)
	return new NumberExpression(node, new Set(a.refs))
}

export function abs<A extends ExpressionInput<string>>(arg: A): NumberExpression<InferRefs<A>> {
	const a = toExpression(arg)
	const node = isConstant(a.node) ? new ConstantNode(Math.abs(a.node.value)) : new AbsNode(a.node)
	return new NumberExpression(node, new Set(a.refs))
}

export function sign<A extends ExpressionInput<string>>(arg: A): NumberExpression<InferRefs<A>> {
	const a = toExpression(arg)
	const node = isConstant(a.node) ? new ConstantNode(Math.sign(a.node.value)) : new SignNode(a.node)
	return new NumberExpression(node, new Set(a.refs))
}

export function max<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	a: A,
	b: B,
): NumberExpression<InferRefs<A> | InferRefs<B>>
export function max<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
>(a: A, b: B, c: C): NumberExpression<InferRefs<A> | InferRefs<B> | InferRefs<C>>
export function max<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
	D extends ExpressionInput<string>,
>(
	a: A,
	b: B,
	c: C,
	d: D,
): NumberExpression<InferRefs<A> | InferRefs<B> | InferRefs<C> | InferRefs<D>>
export function max(
	...args: [ExpressionInput<string>, ExpressionInput<string>, ...ExpressionInput<string>[]]
): NumberExpression<string>
export function max(...args: ExpressionInput<string>[]): NumberExpression<string> {
	const exprs = args.map((a) => toExpression(a))
	if (exprs.every((e) => isConstant(e.node))) {
		const result = Math.max(
			...(exprs as NumberExpression<never>[]).map((e) => e.node.evaluateConstant()),
		)
		return new NumberExpression(new ConstantNode(result), new Set())
	}
	return new NumberExpression(new MaxNode(exprs.map((e) => e.node)), mergeRefs(...exprs))
}

export function min<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	a: A,
	b: B,
): NumberExpression<InferRefs<A> | InferRefs<B>>
export function min<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
>(a: A, b: B, c: C): NumberExpression<InferRefs<A> | InferRefs<B> | InferRefs<C>>
export function min<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
	D extends ExpressionInput<string>,
>(
	a: A,
	b: B,
	c: C,
	d: D,
): NumberExpression<InferRefs<A> | InferRefs<B> | InferRefs<C> | InferRefs<D>>
export function min(
	...args: [ExpressionInput<string>, ExpressionInput<string>, ...ExpressionInput<string>[]]
): NumberExpression<string>
export function min(...args: ExpressionInput<string>[]): NumberExpression<string> {
	const exprs = args.map((a) => toExpression(a))
	if (exprs.every((e) => isConstant(e.node))) {
		const result = Math.min(
			...(exprs as NumberExpression<never>[]).map((e) => e.node.evaluateConstant()),
		)
		return new NumberExpression(new ConstantNode(result), new Set())
	}
	return new NumberExpression(new MinNode(exprs.map((e) => e.node)), mergeRefs(...exprs))
}

export function clamp<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
>(minimum: A, value: B, maximum: C): NumberExpression<InferRefs<A> | InferRefs<B> | InferRefs<C>> {
	const minExpr = toExpression(minimum)
	const valExpr = toExpression(value)
	const maxExpr = toExpression(maximum)
	const node =
		isConstant(minExpr.node) && isConstant(valExpr.node) && isConstant(maxExpr.node)
			? new ConstantNode(
					Math.max(minExpr.node.value, Math.min(valExpr.node.value, maxExpr.node.value)),
				)
			: new ClampNode(minExpr.node, valExpr.node, maxExpr.node)
	return new NumberExpression(node, mergeRefs(minExpr, valExpr, maxExpr))
}

export function lerp<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	T extends ExpressionInput<string>,
>(a: A, b: B, t: T): NumberExpression<InferRefs<A> | InferRefs<B> | InferRefs<T>> {
	return add(multiply(subtract(1, t), a), multiply(t, b))
}

export function oklch<
	L extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
	H extends ExpressionInput<string>,
>(lightness: L, chroma: C, hue: H): ColorExpression<InferRefs<L> | InferRefs<C> | InferRefs<H>> {
	const l = toExpression(lightness)
	const c = toExpression(chroma)
	const h = toExpression(hue)
	return new ColorExpression(new OklchNode(l.node, c.node, h.node), mergeRefs(l, c, h))
}

/** Declare a numeric input property. */
export function property<const N extends string>(
	name: N,
	type: 'number',
	inherits?: boolean,
): NumberExpression<N>
/** Declare a color input property. */
export function property<const N extends string>(
	name: N,
	type: 'color',
	inherits?: boolean,
): ColorExpression<N>
/** Wrap a numeric expression as a computed property. */
export function property<const N extends string, Refs extends string>(
	name: N,
	value: NumberExpression<Refs> | number,
	inherits?: boolean,
): NumberExpression<Refs>
/** Wrap a color expression as a computed property. */
export function property<const N extends string, Refs extends string>(
	name: N,
	value: ColorExpression<Refs>,
	inherits?: boolean,
): ColorExpression<Refs>
export function property(
	name: string,
	typeOrValue: 'number' | 'color' | NumberExpression<string> | ColorExpression<string> | number,
	inherits = false,
): NumberExpression<string> | ColorExpression<string> {
	if (typeOrValue === 'number') {
		return new NumberExpression(new PropertyNode(name, null, '<number>', inherits), new Set([name]))
	}
	if (typeOrValue === 'color') {
		return new ColorExpression(new PropertyNode(name, null, '<color>', inherits), new Set([name]))
	}
	if (typeOrValue instanceof ColorExpression) {
		return new ColorExpression(
			new PropertyNode(name, typeOrValue.node, '<color>', inherits),
			typeOrValue.refs,
		)
	}
	const expr = toExpression(typeOrValue)
	return new NumberExpression(new PropertyNode(name, expr.node, '<number>', inherits), expr.refs)
}
