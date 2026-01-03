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
 * Input type that accepts either a CalcExpression or a plain number.
 * Numbers are automatically wrapped in constant() internally.
 */
export type ExpressionInput<Refs extends string = never> = CalcExpression<Refs> | number

/**
 * Normalize an input to a CalcExpression.
 * Numbers are wrapped in constant(), expressions pass through unchanged.
 */
export function toExpression<Refs extends string>(
	input: ExpressionInput<Refs>,
): CalcExpression<Refs> {
	if (typeof input === 'number') {
		if (!Number.isFinite(input)) {
			throw new TypeError('Constant value must be a finite number')
		}
		return new CalcExpression(new ConstantNode(input)) as CalcExpression<Refs>
	}
	return input
}

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

/**
 * Subtract right expression from left.
 */
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

/**
 * Multiply two expressions.
 */
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

/**
 * Divide left expression by right.
 */
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

/**
 * Raise base to exponent power.
 */
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

/**
 * Compute sine of an expression.
 */
export function sin<Refs extends string>(arg: ExpressionInput<Refs>): CalcExpression<Refs> {
	const a = toExpression(arg)
	const node = isConstant(a.node) ? new ConstantNode(Math.sin(a.node.value)) : new SinNode(a.node)
	return new CalcExpression(node, new Set(a.refs))
}

/**
 * Compute absolute value of an expression.
 */
export function abs<Refs extends string>(arg: ExpressionInput<Refs>): CalcExpression<Refs> {
	const a = toExpression(arg)
	const node = isConstant(a.node) ? new ConstantNode(Math.abs(a.node.value)) : new AbsNode(a.node)
	return new CalcExpression(node, new Set(a.refs))
}

/**
 * Compute sign of an expression (-1, 0, or 1).
 */
export function sign<Refs extends string>(arg: ExpressionInput<Refs>): CalcExpression<Refs> {
	const a = toExpression(arg)
	const node = isConstant(a.node) ? new ConstantNode(Math.sign(a.node.value)) : new SignNode(a.node)
	return new CalcExpression(node, new Set(a.refs))
}

/**
 * Return the maximum of two expressions.
 */
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

/**
 * Return the minimum of two expressions.
 */
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

/**
 * Clamp a value between minimum and maximum.
 */
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
