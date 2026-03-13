import {
	bindImpl,
	type ExpressionInput,
	isConstantNode,
	makeNumber,
	mergeRefs,
	type NumberExpression,
	type RelevantBindingRefs,
	reference,
	serializeImpl,
	solveImpl,
	toExpression,
} from './expression.ts'
import {
	AbsNode,
	AddNode,
	ClampNode,
	ConstantNode,
	DivideNode,
	MaxNode,
	MinNode,
	MultiplyNode,
	PowNode,
	SignedPowNode,
	SignNode,
	SinNode,
	SubtractNode,
} from './nodes.ts'

export type { NumberExpression as Expression } from './expression.ts'

export type Input<Refs extends string = never> = ExpressionInput<Refs>

export function ref<Name extends string>(name: Name): NumberExpression<Name> {
	return reference(name)
}

export function bind<Refs extends string, const B>(
	expr: NumberExpression<Refs>,
	bindings: B & Partial<Record<Refs, ExpressionInput<string>>>,
): NumberExpression<Exclude<Refs, keyof B & string> | RelevantBindingRefs<B, Refs>> {
	const result = bindImpl(expr._node, expr._refs, bindings)
	return makeNumber(result.node, result.refs) as NumberExpression<
		Exclude<Refs, keyof B & string> | RelevantBindingRefs<B, Refs>
	>
}

export function solve(expr: NumberExpression): number
export function solve<Refs extends string, B extends Record<Refs, ExpressionInput<string>>>(
	expr: NumberExpression<Refs>,
	bindings: B,
): number
export function solve(
	expr: NumberExpression<string>,
	bindings?: Record<string, ExpressionInput<string>>,
): number {
	return solveImpl(expr._node, expr._refs, bindings)
}

export function serialize<Refs extends string>(
	expr: NumberExpression<Refs>,
	bindings?: Partial<Record<Refs, ExpressionInput<string>>>,
): string {
	return serializeImpl(expr._node, expr._refs, bindings as Record<string, ExpressionInput<string>>)
}

export function add<A = never, B = never>(
	a: ExpressionInput<A & string>,
	b: ExpressionInput<B & string>,
): NumberExpression<(A & string) | (B & string)>
export function add<A = never, B = never, C = never>(
	a: ExpressionInput<A & string>,
	b: ExpressionInput<B & string>,
	c: ExpressionInput<C & string>,
): NumberExpression<(A & string) | (B & string) | (C & string)>
export function add<A = never, B = never, C = never, D = never>(
	a: ExpressionInput<A & string>,
	b: ExpressionInput<B & string>,
	c: ExpressionInput<C & string>,
	d: ExpressionInput<D & string>,
): NumberExpression<(A & string) | (B & string) | (C & string) | (D & string)>
export function add(
	...args: [ExpressionInput<string>, ExpressionInput<string>, ...ExpressionInput<string>[]]
): NumberExpression<string>
export function add(...args: ExpressionInput<string>[]): NumberExpression<string> {
	const exprs = args.map((a) => toExpression(a))
	if (exprs.every((e) => isConstantNode(e._node))) {
		const sum = (exprs as NumberExpression<never>[]).reduce(
			(acc, e) => acc + e._node.evaluateConstant(),
			0,
		)
		return makeNumber(new ConstantNode(sum), new Set())
	}
	return makeNumber(new AddNode(exprs.map((e) => e._node)), mergeRefs(...exprs))
}

export function subtract<A = never, B = never>(
	left: ExpressionInput<A & string>,
	right: ExpressionInput<B & string>,
): NumberExpression<(A & string) | (B & string)> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstantNode(l._node) && isConstantNode(r._node)
			? new ConstantNode(l._node.value - r._node.value)
			: new SubtractNode(l._node, r._node)
	return makeNumber(node, mergeRefs(l, r))
}

export function multiply<A = never, B = never>(
	left: ExpressionInput<A & string>,
	right: ExpressionInput<B & string>,
): NumberExpression<(A & string) | (B & string)> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstantNode(l._node) && isConstantNode(r._node)
			? new ConstantNode(l._node.value * r._node.value)
			: new MultiplyNode(l._node, r._node)
	return makeNumber(node, mergeRefs(l, r))
}

export function divide<A = never, B = never>(
	left: ExpressionInput<A & string>,
	right: ExpressionInput<B & string>,
): NumberExpression<(A & string) | (B & string)> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstantNode(l._node) && isConstantNode(r._node)
			? new ConstantNode(l._node.value / r._node.value)
			: new DivideNode(l._node, r._node)
	return makeNumber(node, mergeRefs(l, r))
}

export function pow<A = never, B = never>(
	base: ExpressionInput<A & string>,
	exponent: ExpressionInput<B & string>,
): NumberExpression<(A & string) | (B & string)> {
	const b = toExpression(base)
	const e = toExpression(exponent)
	const node =
		isConstantNode(b._node) && isConstantNode(e._node)
			? new ConstantNode(b._node.value ** e._node.value)
			: new PowNode(b._node, e._node)
	return makeNumber(node, mergeRefs(b, e))
}

export function signedPow<A = never, B = never>(
	base: ExpressionInput<A & string>,
	exponent: ExpressionInput<B & string>,
): NumberExpression<(A & string) | (B & string)> {
	const b = toExpression(base)
	const e = toExpression(exponent)
	const node =
		isConstantNode(b._node) && isConstantNode(e._node)
			? new ConstantNode(Math.abs(b._node.value) ** e._node.value * Math.sign(b._node.value))
			: new SignedPowNode(b._node, e._node)
	return makeNumber(node, mergeRefs(b, e))
}

export function sin<A = never>(arg: ExpressionInput<A & string>): NumberExpression<A & string> {
	const a = toExpression(arg)
	const node = isConstantNode(a._node)
		? new ConstantNode(Math.sin(a._node.value))
		: new SinNode(a._node)
	return makeNumber(node, new Set(a._refs))
}

export function abs<A = never>(arg: ExpressionInput<A & string>): NumberExpression<A & string> {
	const a = toExpression(arg)
	const node = isConstantNode(a._node)
		? new ConstantNode(Math.abs(a._node.value))
		: new AbsNode(a._node)
	return makeNumber(node, new Set(a._refs))
}

export function sign<A = never>(arg: ExpressionInput<A & string>): NumberExpression<A & string> {
	const a = toExpression(arg)
	const node = isConstantNode(a._node)
		? new ConstantNode(Math.sign(a._node.value))
		: new SignNode(a._node)
	return makeNumber(node, new Set(a._refs))
}

export function max<A = never, B = never>(
	a: ExpressionInput<A & string>,
	b: ExpressionInput<B & string>,
): NumberExpression<(A & string) | (B & string)>
export function max<A = never, B = never, C = never>(
	a: ExpressionInput<A & string>,
	b: ExpressionInput<B & string>,
	c: ExpressionInput<C & string>,
): NumberExpression<(A & string) | (B & string) | (C & string)>
export function max<A = never, B = never, C = never, D = never>(
	a: ExpressionInput<A & string>,
	b: ExpressionInput<B & string>,
	c: ExpressionInput<C & string>,
	d: ExpressionInput<D & string>,
): NumberExpression<(A & string) | (B & string) | (C & string) | (D & string)>
export function max(
	...args: [ExpressionInput<string>, ExpressionInput<string>, ...ExpressionInput<string>[]]
): NumberExpression<string>
export function max(...args: ExpressionInput<string>[]): NumberExpression<string> {
	const exprs = args.map((a) => toExpression(a))
	if (exprs.every((e) => isConstantNode(e._node))) {
		const result = Math.max(
			...(exprs as NumberExpression<never>[]).map((e) => e._node.evaluateConstant()),
		)
		return makeNumber(new ConstantNode(result), new Set())
	}
	return makeNumber(new MaxNode(exprs.map((e) => e._node)), mergeRefs(...exprs))
}

export function min<A = never, B = never>(
	a: ExpressionInput<A & string>,
	b: ExpressionInput<B & string>,
): NumberExpression<(A & string) | (B & string)>
export function min<A = never, B = never, C = never>(
	a: ExpressionInput<A & string>,
	b: ExpressionInput<B & string>,
	c: ExpressionInput<C & string>,
): NumberExpression<(A & string) | (B & string) | (C & string)>
export function min<A = never, B = never, C = never, D = never>(
	a: ExpressionInput<A & string>,
	b: ExpressionInput<B & string>,
	c: ExpressionInput<C & string>,
	d: ExpressionInput<D & string>,
): NumberExpression<(A & string) | (B & string) | (C & string) | (D & string)>
export function min(
	...args: [ExpressionInput<string>, ExpressionInput<string>, ...ExpressionInput<string>[]]
): NumberExpression<string>
export function min(...args: ExpressionInput<string>[]): NumberExpression<string> {
	const exprs = args.map((a) => toExpression(a))
	if (exprs.every((e) => isConstantNode(e._node))) {
		const result = Math.min(
			...(exprs as NumberExpression<never>[]).map((e) => e._node.evaluateConstant()),
		)
		return makeNumber(new ConstantNode(result), new Set())
	}
	return makeNumber(new MinNode(exprs.map((e) => e._node)), mergeRefs(...exprs))
}

export function clamp<A = never, B = never, C = never>(
	minimum: ExpressionInput<A & string>,
	value: ExpressionInput<B & string>,
	maximum: ExpressionInput<C & string>,
): NumberExpression<(A & string) | (B & string) | (C & string)> {
	const minExpr = toExpression(minimum)
	const valExpr = toExpression(value)
	const maxExpr = toExpression(maximum)
	const node =
		isConstantNode(minExpr._node) && isConstantNode(valExpr._node) && isConstantNode(maxExpr._node)
			? new ConstantNode(
					Math.max(minExpr._node.value, Math.min(valExpr._node.value, maxExpr._node.value)),
				)
			: new ClampNode(minExpr._node, valExpr._node, maxExpr._node)
	return makeNumber(node, mergeRefs(minExpr, valExpr, maxExpr))
}

export function lerp<A = never, B = never, T = never>(
	a: ExpressionInput<A & string>,
	b: ExpressionInput<B & string>,
	t: ExpressionInput<T & string>,
): NumberExpression<(A & string) | (B & string) | (T & string)> {
	return add(multiply(subtract(1, t), a), multiply(t, b))
}
