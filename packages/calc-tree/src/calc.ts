import {
	type ApplyBindings,
	type BindingsInput,
	bindImpl,
	type ExpressionInput,
	isConstantNode,
	makeNumber,
	mergeRefs,
	type NumberExpression,
	nodeOf,
	reference,
	refsOf,
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

export type Input<Refs extends string = string> = ExpressionInput<Refs>

export function ref<Name extends string>(name: Name): NumberExpression<Name> {
	return reference(name)
}

export function bind<Refs extends string, const B extends BindingsInput>(
	expr: NumberExpression<Refs>,
	bindings: B,
): NumberExpression<ApplyBindings<Refs, B>> {
	const result = bindImpl(nodeOf(expr), refsOf(expr), bindings)
	return makeNumber(result.node, result.refs)
}

export function solve(expr: NumberExpression): number
export function solve<Refs extends string, B extends BindingsInput<Refs>>(
	expr: NumberExpression<Refs>,
	bindings: B,
): number
export function solve(expr: NumberExpression, bindings?: BindingsInput): number {
	return solveImpl(nodeOf(expr), refsOf(expr), bindings)
}

export function serialize<Refs extends string>(
	expr: NumberExpression<Refs>,
	bindings?: Partial<BindingsInput<Refs>>,
): string {
	return serializeImpl(nodeOf(expr), refsOf(expr), bindings as BindingsInput)
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
	...args: [ExpressionInput, ExpressionInput, ...ExpressionInput[]]
): NumberExpression
export function add(...args: ExpressionInput[]): NumberExpression {
	const exprs = args.map((a) => toExpression(a))
	const nodes = exprs.map((e) => nodeOf(e))
	if (nodes.every(isConstantNode)) {
		const sum = nodes.reduce((acc, n) => acc + n.evaluateConstant(), 0)
		return makeNumber(new ConstantNode(sum), new Set())
	}
	return makeNumber(new AddNode(nodes), mergeRefs(...exprs))
}

export function subtract<A = never, B = never>(
	left: ExpressionInput<A & string>,
	right: ExpressionInput<B & string>,
): NumberExpression<(A & string) | (B & string)> {
	const l = toExpression(left)
	const r = toExpression(right)
	const lNode = nodeOf(l)
	const rNode = nodeOf(r)
	const node =
		isConstantNode(lNode) && isConstantNode(rNode)
			? new ConstantNode(lNode.value - rNode.value)
			: new SubtractNode(lNode, rNode)
	return makeNumber(node, mergeRefs(l, r))
}

export function multiply<A = never, B = never>(
	left: ExpressionInput<A & string>,
	right: ExpressionInput<B & string>,
): NumberExpression<(A & string) | (B & string)> {
	const l = toExpression(left)
	const r = toExpression(right)
	const lNode = nodeOf(l)
	const rNode = nodeOf(r)
	const node =
		isConstantNode(lNode) && isConstantNode(rNode)
			? new ConstantNode(lNode.value * rNode.value)
			: new MultiplyNode(lNode, rNode)
	return makeNumber(node, mergeRefs(l, r))
}

export function divide<A = never, B = never>(
	left: ExpressionInput<A & string>,
	right: ExpressionInput<B & string>,
): NumberExpression<(A & string) | (B & string)> {
	const l = toExpression(left)
	const r = toExpression(right)
	const lNode = nodeOf(l)
	const rNode = nodeOf(r)
	const node =
		isConstantNode(lNode) && isConstantNode(rNode)
			? new ConstantNode(lNode.value / rNode.value)
			: new DivideNode(lNode, rNode)
	return makeNumber(node, mergeRefs(l, r))
}

export function pow<A = never, B = never>(
	base: ExpressionInput<A & string>,
	exponent: ExpressionInput<B & string>,
): NumberExpression<(A & string) | (B & string)> {
	const b = toExpression(base)
	const e = toExpression(exponent)
	const bNode = nodeOf(b)
	const eNode = nodeOf(e)
	const node =
		isConstantNode(bNode) && isConstantNode(eNode)
			? new ConstantNode(bNode.value ** eNode.value)
			: new PowNode(bNode, eNode)
	return makeNumber(node, mergeRefs(b, e))
}

export function signedPow<A = never, B = never>(
	base: ExpressionInput<A & string>,
	exponent: ExpressionInput<B & string>,
): NumberExpression<(A & string) | (B & string)> {
	const b = toExpression(base)
	const e = toExpression(exponent)
	const bNode = nodeOf(b)
	const eNode = nodeOf(e)
	const node =
		isConstantNode(bNode) && isConstantNode(eNode)
			? new ConstantNode(Math.abs(bNode.value) ** eNode.value * Math.sign(bNode.value))
			: new SignedPowNode(bNode, eNode)
	return makeNumber(node, mergeRefs(b, e))
}

export function sin<A = never>(arg: ExpressionInput<A & string>): NumberExpression<A & string> {
	const a = toExpression(arg)
	const aNode = nodeOf(a)
	const node = isConstantNode(aNode) ? new ConstantNode(Math.sin(aNode.value)) : new SinNode(aNode)
	return makeNumber(node, new Set(refsOf(a)))
}

export function abs<A = never>(arg: ExpressionInput<A & string>): NumberExpression<A & string> {
	const a = toExpression(arg)
	const aNode = nodeOf(a)
	const node = isConstantNode(aNode) ? new ConstantNode(Math.abs(aNode.value)) : new AbsNode(aNode)
	return makeNumber(node, new Set(refsOf(a)))
}

export function sign<A = never>(arg: ExpressionInput<A & string>): NumberExpression<A & string> {
	const a = toExpression(arg)
	const aNode = nodeOf(a)
	const node = isConstantNode(aNode)
		? new ConstantNode(Math.sign(aNode.value))
		: new SignNode(aNode)
	return makeNumber(node, new Set(refsOf(a)))
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
	...args: [ExpressionInput, ExpressionInput, ...ExpressionInput[]]
): NumberExpression
export function max(...args: ExpressionInput[]): NumberExpression {
	const exprs = args.map((a) => toExpression(a))
	const nodes = exprs.map((e) => nodeOf(e))
	if (nodes.every(isConstantNode)) {
		const result = Math.max(...nodes.map((n) => n.evaluateConstant()))
		return makeNumber(new ConstantNode(result), new Set())
	}
	return makeNumber(new MaxNode(nodes), mergeRefs(...exprs))
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
	...args: [ExpressionInput, ExpressionInput, ...ExpressionInput[]]
): NumberExpression
export function min(...args: ExpressionInput[]): NumberExpression {
	const exprs = args.map((a) => toExpression(a))
	const nodes = exprs.map((e) => nodeOf(e))
	if (nodes.every(isConstantNode)) {
		const result = Math.min(...nodes.map((n) => n.evaluateConstant()))
		return makeNumber(new ConstantNode(result), new Set())
	}
	return makeNumber(new MinNode(nodes), mergeRefs(...exprs))
}

export function clamp<A = never, B = never, C = never>(
	minimum: ExpressionInput<A & string>,
	value: ExpressionInput<B & string>,
	maximum: ExpressionInput<C & string>,
): NumberExpression<(A & string) | (B & string) | (C & string)> {
	const minExpr = toExpression(minimum)
	const valExpr = toExpression(value)
	const maxExpr = toExpression(maximum)
	const minNode = nodeOf(minExpr)
	const valNode = nodeOf(valExpr)
	const maxNode = nodeOf(maxExpr)
	const node =
		isConstantNode(minNode) && isConstantNode(valNode) && isConstantNode(maxNode)
			? new ConstantNode(Math.max(minNode.value, Math.min(valNode.value, maxNode.value)))
			: new ClampNode(minNode, valNode, maxNode)
	return makeNumber(node, mergeRefs(minExpr, valExpr, maxExpr))
}

export function lerp<A = never, B = never, T = never>(
	a: ExpressionInput<A & string>,
	b: ExpressionInput<B & string>,
	t: ExpressionInput<T & string>,
): NumberExpression<(A & string) | (B & string) | (T & string)> {
	return add(multiply(subtract(1, t), a), multiply(t, b))
}
