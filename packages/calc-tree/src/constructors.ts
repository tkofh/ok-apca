import { CalcExpression, ColorExpression } from './expression.ts'
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
	ReferenceNode,
	SignedPowNode,
	SignNode,
	SinNode,
	SubtractNode,
} from './nodes.ts'

export type ExpressionInput<Refs extends string = never> = CalcExpression<Refs> | number

export type InferRefs<T> = T extends CalcExpression<infer R> ? R : never

export function constant(value: number | string): CalcExpression<never> {
	const num = typeof value === 'string' ? Number(value) : value
	if (!Number.isFinite(num)) {
		throw new TypeError('Constant value must be a finite number')
	}
	return new CalcExpression(new ConstantNode(num))
}

export function toExpression<A extends ExpressionInput<string>>(
	input: A,
): CalcExpression<InferRefs<A>> {
	if (typeof input === 'number') {
		return constant(input) as CalcExpression<InferRefs<A>>
	}
	return input as CalcExpression<InferRefs<A>>
}

export function reference<Name extends string>(name: Name): CalcExpression<Name> {
	if (typeof name !== 'string' || name.length === 0) {
		throw new TypeError('Reference name must be a non-empty string')
	}
	return new CalcExpression(new ReferenceNode(name), new Set([name]))
}

function mergeRefs(...exprs: CalcExpression<string>[]): Set<string> {
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
): CalcExpression<InferRefs<A> | InferRefs<B>>
export function add<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
>(a: A, b: B, c: C): CalcExpression<InferRefs<A> | InferRefs<B> | InferRefs<C>>
export function add<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
	D extends ExpressionInput<string>,
>(a: A, b: B, c: C, d: D): CalcExpression<InferRefs<A> | InferRefs<B> | InferRefs<C> | InferRefs<D>>
export function add(
	...args: [ExpressionInput<string>, ExpressionInput<string>, ...ExpressionInput<string>[]]
): CalcExpression<string>
export function add(...args: ExpressionInput<string>[]): CalcExpression<string> {
	const exprs = args.map((a) => toExpression(a))
	if (exprs.every((e) => isConstant(e.node))) {
		const sum = (exprs as CalcExpression<never>[]).reduce(
			(acc, e) => acc + e.node.evaluateConstant(),
			0,
		)
		return new CalcExpression(new ConstantNode(sum), new Set())
	}
	return new CalcExpression(new AddNode(exprs.map((e) => e.node)), mergeRefs(...exprs))
}

export function subtract<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	left: A,
	right: B,
): CalcExpression<InferRefs<A> | InferRefs<B>> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstant(l.node) && isConstant(r.node)
			? new ConstantNode(l.node.value - r.node.value)
			: new SubtractNode(l.node, r.node)
	return new CalcExpression(node, mergeRefs(l, r))
}

export function multiply<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	left: A,
	right: B,
): CalcExpression<InferRefs<A> | InferRefs<B>> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstant(l.node) && isConstant(r.node)
			? new ConstantNode(l.node.value * r.node.value)
			: new MultiplyNode(l.node, r.node)
	return new CalcExpression(node, mergeRefs(l, r))
}

export function divide<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	left: A,
	right: B,
): CalcExpression<InferRefs<A> | InferRefs<B>> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstant(l.node) && isConstant(r.node)
			? new ConstantNode(l.node.value / r.node.value)
			: new DivideNode(l.node, r.node)
	return new CalcExpression(node, mergeRefs(l, r))
}

export function pow<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	base: A,
	exponent: B,
): CalcExpression<InferRefs<A> | InferRefs<B>> {
	const b = toExpression(base)
	const e = toExpression(exponent)
	const node =
		isConstant(b.node) && isConstant(e.node)
			? new ConstantNode(b.node.value ** e.node.value)
			: new PowNode(b.node, e.node)
	return new CalcExpression(node, mergeRefs(b, e))
}

export function signedPow<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	base: A,
	exponent: B,
): CalcExpression<InferRefs<A> | InferRefs<B>> {
	const b = toExpression(base)
	const e = toExpression(exponent)
	const node =
		isConstant(b.node) && isConstant(e.node)
			? new ConstantNode(Math.abs(b.node.value) ** e.node.value * Math.sign(b.node.value))
			: new SignedPowNode(b.node, e.node)
	return new CalcExpression(node, mergeRefs(b, e))
}

export function sin<A extends ExpressionInput<string>>(arg: A): CalcExpression<InferRefs<A>> {
	const a = toExpression(arg)
	const node = isConstant(a.node) ? new ConstantNode(Math.sin(a.node.value)) : new SinNode(a.node)
	return new CalcExpression(node, new Set(a.refs))
}

export function abs<A extends ExpressionInput<string>>(arg: A): CalcExpression<InferRefs<A>> {
	const a = toExpression(arg)
	const node = isConstant(a.node) ? new ConstantNode(Math.abs(a.node.value)) : new AbsNode(a.node)
	return new CalcExpression(node, new Set(a.refs))
}

export function sign<A extends ExpressionInput<string>>(arg: A): CalcExpression<InferRefs<A>> {
	const a = toExpression(arg)
	const node = isConstant(a.node) ? new ConstantNode(Math.sign(a.node.value)) : new SignNode(a.node)
	return new CalcExpression(node, new Set(a.refs))
}

export function max<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	a: A,
	b: B,
): CalcExpression<InferRefs<A> | InferRefs<B>>
export function max<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
>(a: A, b: B, c: C): CalcExpression<InferRefs<A> | InferRefs<B> | InferRefs<C>>
export function max<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
	D extends ExpressionInput<string>,
>(a: A, b: B, c: C, d: D): CalcExpression<InferRefs<A> | InferRefs<B> | InferRefs<C> | InferRefs<D>>
export function max(
	...args: [ExpressionInput<string>, ExpressionInput<string>, ...ExpressionInput<string>[]]
): CalcExpression<string>
export function max(...args: ExpressionInput<string>[]): CalcExpression<string> {
	const exprs = args.map((a) => toExpression(a))
	if (exprs.every((e) => isConstant(e.node))) {
		const result = Math.max(
			...(exprs as CalcExpression<never>[]).map((e) => e.node.evaluateConstant()),
		)
		return new CalcExpression(new ConstantNode(result), new Set())
	}
	return new CalcExpression(new MaxNode(exprs.map((e) => e.node)), mergeRefs(...exprs))
}

export function min<A extends ExpressionInput<string>, B extends ExpressionInput<string>>(
	a: A,
	b: B,
): CalcExpression<InferRefs<A> | InferRefs<B>>
export function min<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
>(a: A, b: B, c: C): CalcExpression<InferRefs<A> | InferRefs<B> | InferRefs<C>>
export function min<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
	D extends ExpressionInput<string>,
>(a: A, b: B, c: C, d: D): CalcExpression<InferRefs<A> | InferRefs<B> | InferRefs<C> | InferRefs<D>>
export function min(
	...args: [ExpressionInput<string>, ExpressionInput<string>, ...ExpressionInput<string>[]]
): CalcExpression<string>
export function min(...args: ExpressionInput<string>[]): CalcExpression<string> {
	const exprs = args.map((a) => toExpression(a))
	if (exprs.every((e) => isConstant(e.node))) {
		const result = Math.min(
			...(exprs as CalcExpression<never>[]).map((e) => e.node.evaluateConstant()),
		)
		return new CalcExpression(new ConstantNode(result), new Set())
	}
	return new CalcExpression(new MinNode(exprs.map((e) => e.node)), mergeRefs(...exprs))
}

export function clamp<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	C extends ExpressionInput<string>,
>(minimum: A, value: B, maximum: C): CalcExpression<InferRefs<A> | InferRefs<B> | InferRefs<C>> {
	const minExpr = toExpression(minimum)
	const valExpr = toExpression(value)
	const maxExpr = toExpression(maximum)
	const node =
		isConstant(minExpr.node) && isConstant(valExpr.node) && isConstant(maxExpr.node)
			? new ConstantNode(
					Math.max(minExpr.node.value, Math.min(valExpr.node.value, maxExpr.node.value)),
				)
			: new ClampNode(minExpr.node, valExpr.node, maxExpr.node)
	return new CalcExpression(node, mergeRefs(minExpr, valExpr, maxExpr))
}

export function lerp<
	A extends ExpressionInput<string>,
	B extends ExpressionInput<string>,
	T extends ExpressionInput<string>,
>(a: A, b: B, t: T): CalcExpression<InferRefs<A> | InferRefs<B> | InferRefs<T>> {
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
