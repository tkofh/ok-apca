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
	PowerNode,
	ReferenceNode,
	SignNode,
	SinNode,
	SubtractNode,
} from './nodes.ts'

/**
 * Create a constant numeric expression.
 * Accepts numbers or numeric strings.
 */
export function constant(value: number | string): CalcExpression<never> {
	const num = typeof value === 'string' ? Number(value) : value
	if (!Number.isFinite(num)) {
		throw new TypeError('Constant value must be a finite number')
	}
	return new CalcExpression(new ConstantNode(num))
}

/**
 * Create a reference expression that requires a binding.
 */
export function reference<Name extends string>(name: Name): CalcExpression<Name> {
	if (typeof name !== 'string' || name.length === 0) {
		throw new TypeError('Reference name must be a non-empty string')
	}
	return new CalcExpression(new ReferenceNode(name), new Set([name]))
}

// Helper to merge refs from multiple expressions
function mergeRefs(...exprs: CalcExpression<string>[]): Set<string> {
	const refs = new Set<string>()
	for (const expr of exprs) {
		for (const ref of expr.refs) {
			refs.add(ref)
		}
	}
	return refs
}

// Helper to check if a node is constant
function isConstant(node: unknown): node is ConstantNode {
	return node instanceof ConstantNode
}

/**
 * Add two expressions.
 */
export function add<A extends string, B extends string>(
	left: CalcExpression<A>,
	right: CalcExpression<B>,
): CalcExpression<A | B> {
	const node =
		isConstant(left.node) && isConstant(right.node)
			? new ConstantNode(left.node.value + right.node.value)
			: new AddNode(left.node, right.node)
	return new CalcExpression(node, mergeRefs(left, right))
}

/**
 * Subtract right expression from left.
 */
export function subtract<A extends string, B extends string>(
	left: CalcExpression<A>,
	right: CalcExpression<B>,
): CalcExpression<A | B> {
	const node =
		isConstant(left.node) && isConstant(right.node)
			? new ConstantNode(left.node.value - right.node.value)
			: new SubtractNode(left.node, right.node)
	return new CalcExpression(node, mergeRefs(left, right))
}

/**
 * Multiply two expressions.
 */
export function multiply<A extends string, B extends string>(
	left: CalcExpression<A>,
	right: CalcExpression<B>,
): CalcExpression<A | B> {
	const node =
		isConstant(left.node) && isConstant(right.node)
			? new ConstantNode(left.node.value * right.node.value)
			: new MultiplyNode(left.node, right.node)
	return new CalcExpression(node, mergeRefs(left, right))
}

/**
 * Divide left expression by right.
 */
export function divide<A extends string, B extends string>(
	left: CalcExpression<A>,
	right: CalcExpression<B>,
): CalcExpression<A | B> {
	const node =
		isConstant(left.node) && isConstant(right.node)
			? new ConstantNode(left.node.value / right.node.value)
			: new DivideNode(left.node, right.node)
	return new CalcExpression(node, mergeRefs(left, right))
}

/**
 * Raise base to exponent power.
 */
export function power<A extends string, B extends string>(
	base: CalcExpression<A>,
	exponent: CalcExpression<B>,
): CalcExpression<A | B> {
	const node =
		isConstant(base.node) && isConstant(exponent.node)
			? new ConstantNode(base.node.value ** exponent.node.value)
			: new PowerNode(base.node, exponent.node)
	return new CalcExpression(node, mergeRefs(base, exponent))
}

/**
 * Compute sine of an expression.
 */
export function sin<Refs extends string>(arg: CalcExpression<Refs>): CalcExpression<Refs> {
	const node = isConstant(arg.node)
		? new ConstantNode(Math.sin(arg.node.value))
		: new SinNode(arg.node)
	return new CalcExpression(node, new Set(arg.refs))
}

/**
 * Compute absolute value of an expression.
 */
export function abs<Refs extends string>(arg: CalcExpression<Refs>): CalcExpression<Refs> {
	const node = isConstant(arg.node)
		? new ConstantNode(Math.abs(arg.node.value))
		: new AbsNode(arg.node)
	return new CalcExpression(node, new Set(arg.refs))
}

/**
 * Compute sign of an expression (-1, 0, or 1).
 */
export function sign<Refs extends string>(arg: CalcExpression<Refs>): CalcExpression<Refs> {
	const node = isConstant(arg.node)
		? new ConstantNode(Math.sign(arg.node.value))
		: new SignNode(arg.node)
	return new CalcExpression(node, new Set(arg.refs))
}

/**
 * Return the maximum of two expressions.
 */
export function max<A extends string, B extends string>(
	left: CalcExpression<A>,
	right: CalcExpression<B>,
): CalcExpression<A | B> {
	const node =
		isConstant(left.node) && isConstant(right.node)
			? new ConstantNode(Math.max(left.node.value, right.node.value))
			: new MaxNode(left.node, right.node)
	return new CalcExpression(node, mergeRefs(left, right))
}

/**
 * Return the minimum of two expressions.
 */
export function min<A extends string, B extends string>(
	left: CalcExpression<A>,
	right: CalcExpression<B>,
): CalcExpression<A | B> {
	const node =
		isConstant(left.node) && isConstant(right.node)
			? new ConstantNode(Math.min(left.node.value, right.node.value))
			: new MinNode(left.node, right.node)
	return new CalcExpression(node, mergeRefs(left, right))
}

/**
 * Clamp a value between minimum and maximum.
 */
export function clamp<A extends string, B extends string, C extends string>(
	minimum: CalcExpression<A>,
	value: CalcExpression<B>,
	maximum: CalcExpression<C>,
): CalcExpression<A | B | C> {
	const node =
		isConstant(minimum.node) && isConstant(value.node) && isConstant(maximum.node)
			? new ConstantNode(
					Math.max(minimum.node.value, Math.min(value.node.value, maximum.node.value)),
				)
			: new ClampNode(minimum.node, value.node, maximum.node)
	return new CalcExpression(node, mergeRefs(minimum, value, maximum))
}
