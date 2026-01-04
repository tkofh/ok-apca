import { CalcExpression } from './expression.ts'
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
	PowerNode,
	ReferenceNode,
	SignNode,
	SinNode,
	SubtractNode,
} from './nodes.ts'

export type ExpressionInput<Refs extends string = never> = CalcExpression<Refs> | number

export function constant(value: number | string): CalcExpression<never> {
	const num = typeof value === 'string' ? Number(value) : value
	if (!Number.isFinite(num)) {
		throw new TypeError('Constant value must be a finite number')
	}
	return new CalcExpression(new ConstantNode(num))
}

export function toExpression<Refs extends string>(
	input: ExpressionInput<Refs>,
): CalcExpression<Refs> {
	if (typeof input === 'number') {
		return constant(input) as CalcExpression<Refs>
	}
	return input
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

export function add<A extends string, B extends string>(
	left: ExpressionInput<A>,
	right: ExpressionInput<B>,
): CalcExpression<A | B> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstant(l.node) && isConstant(r.node)
			? new ConstantNode(l.node.value + r.node.value)
			: new AddNode(l.node, r.node)
	return new CalcExpression(node, mergeRefs(l, r))
}

export function subtract<A extends string, B extends string>(
	left: ExpressionInput<A>,
	right: ExpressionInput<B>,
): CalcExpression<A | B> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstant(l.node) && isConstant(r.node)
			? new ConstantNode(l.node.value - r.node.value)
			: new SubtractNode(l.node, r.node)
	return new CalcExpression(node, mergeRefs(l, r))
}

export function multiply<A extends string, B extends string>(
	left: ExpressionInput<A>,
	right: ExpressionInput<B>,
): CalcExpression<A | B> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstant(l.node) && isConstant(r.node)
			? new ConstantNode(l.node.value * r.node.value)
			: new MultiplyNode(l.node, r.node)
	return new CalcExpression(node, mergeRefs(l, r))
}

export function divide<A extends string, B extends string>(
	left: ExpressionInput<A>,
	right: ExpressionInput<B>,
): CalcExpression<A | B> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstant(l.node) && isConstant(r.node)
			? new ConstantNode(l.node.value / r.node.value)
			: new DivideNode(l.node, r.node)
	return new CalcExpression(node, mergeRefs(l, r))
}

export function power<A extends string, B extends string>(
	base: ExpressionInput<A>,
	exponent: ExpressionInput<B>,
): CalcExpression<A | B> {
	const b = toExpression(base)
	const e = toExpression(exponent)
	const node =
		isConstant(b.node) && isConstant(e.node)
			? new ConstantNode(b.node.value ** e.node.value)
			: new PowerNode(b.node, e.node)
	return new CalcExpression(node, mergeRefs(b, e))
}

export function sin<Refs extends string>(arg: ExpressionInput<Refs>): CalcExpression<Refs> {
	const a = toExpression(arg)
	const node = isConstant(a.node) ? new ConstantNode(Math.sin(a.node.value)) : new SinNode(a.node)
	return new CalcExpression(node, new Set(a.refs))
}

export function abs<Refs extends string>(arg: ExpressionInput<Refs>): CalcExpression<Refs> {
	const a = toExpression(arg)
	const node = isConstant(a.node) ? new ConstantNode(Math.abs(a.node.value)) : new AbsNode(a.node)
	return new CalcExpression(node, new Set(a.refs))
}

export function sign<Refs extends string>(arg: ExpressionInput<Refs>): CalcExpression<Refs> {
	const a = toExpression(arg)
	const node = isConstant(a.node) ? new ConstantNode(Math.sign(a.node.value)) : new SignNode(a.node)
	return new CalcExpression(node, new Set(a.refs))
}

export function max<A extends string, B extends string>(
	left: ExpressionInput<A>,
	right: ExpressionInput<B>,
): CalcExpression<A | B> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstant(l.node) && isConstant(r.node)
			? new ConstantNode(Math.max(l.node.value, r.node.value))
			: new MaxNode(l.node, r.node)
	return new CalcExpression(node, mergeRefs(l, r))
}

export function min<A extends string, B extends string>(
	left: ExpressionInput<A>,
	right: ExpressionInput<B>,
): CalcExpression<A | B> {
	const l = toExpression(left)
	const r = toExpression(right)
	const node =
		isConstant(l.node) && isConstant(r.node)
			? new ConstantNode(Math.min(l.node.value, r.node.value))
			: new MinNode(l.node, r.node)
	return new CalcExpression(node, mergeRefs(l, r))
}

export function clamp<A extends string, B extends string, C extends string>(
	minimum: ExpressionInput<A>,
	value: ExpressionInput<B>,
	maximum: ExpressionInput<C>,
): CalcExpression<A | B | C> {
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

export function oklch<L extends string, C extends string, H extends string>(
	lightness: ExpressionInput<L>,
	chroma: ExpressionInput<C>,
	hue: ExpressionInput<H>,
): CalcExpression<L | C | H> {
	const l = toExpression(lightness)
	const c = toExpression(chroma)
	const h = toExpression(hue)
	return new CalcExpression(new OklchNode(l.node, c.node, h.node), mergeRefs(l, c, h))
}
