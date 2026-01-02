import { CalcExpression, NODE, REFS } from './expression.ts'
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
	const node = new ConstantNode(num)
	return CalcExpression._create(node, new Set())
}

/**
 * Create a reference expression that requires a binding.
 */
export function reference<Name extends string>(name: Name): CalcExpression<Name> {
	if (typeof name !== 'string' || name.length === 0) {
		throw new TypeError('Reference name must be a non-empty string')
	}
	const node = new ReferenceNode(name)
	return CalcExpression._create(node, new Set([name]))
}

/**
 * Add two expressions.
 */
export function add<A extends string, B extends string>(
	left: CalcExpression<A>,
	right: CalcExpression<B>,
): CalcExpression<A | B> {
	const leftNode = left[NODE]
	const rightNode = right[NODE]
	const node =
		ConstantNode.is(leftNode) && ConstantNode.is(rightNode)
			? new ConstantNode(leftNode.value + rightNode.value)
			: new AddNode(leftNode, rightNode)
	const refs = new Set([...left[REFS], ...right[REFS]])
	return CalcExpression._create(node, refs)
}

/**
 * Subtract right expression from left.
 */
export function subtract<A extends string, B extends string>(
	left: CalcExpression<A>,
	right: CalcExpression<B>,
): CalcExpression<A | B> {
	const leftNode = left[NODE]
	const rightNode = right[NODE]
	const node =
		ConstantNode.is(leftNode) && ConstantNode.is(rightNode)
			? new ConstantNode(leftNode.value - rightNode.value)
			: new SubtractNode(leftNode, rightNode)
	const refs = new Set([...left[REFS], ...right[REFS]])
	return CalcExpression._create(node, refs)
}

/**
 * Multiply two expressions.
 */
export function multiply<A extends string, B extends string>(
	left: CalcExpression<A>,
	right: CalcExpression<B>,
): CalcExpression<A | B> {
	const leftNode = left[NODE]
	const rightNode = right[NODE]
	const node =
		ConstantNode.is(leftNode) && ConstantNode.is(rightNode)
			? new ConstantNode(leftNode.value * rightNode.value)
			: new MultiplyNode(leftNode, rightNode)
	const refs = new Set([...left[REFS], ...right[REFS]])
	return CalcExpression._create(node, refs)
}

/**
 * Divide left expression by right.
 */
export function divide<A extends string, B extends string>(
	left: CalcExpression<A>,
	right: CalcExpression<B>,
): CalcExpression<A | B> {
	const leftNode = left[NODE]
	const rightNode = right[NODE]
	const node =
		ConstantNode.is(leftNode) && ConstantNode.is(rightNode)
			? new ConstantNode(leftNode.value / rightNode.value)
			: new DivideNode(leftNode, rightNode)
	const refs = new Set([...left[REFS], ...right[REFS]])
	return CalcExpression._create(node, refs)
}

/**
 * Raise base to exponent power.
 */
export function power<A extends string, B extends string>(
	base: CalcExpression<A>,
	exponent: CalcExpression<B>,
): CalcExpression<A | B> {
	const baseNode = base[NODE]
	const expNode = exponent[NODE]
	const node =
		ConstantNode.is(baseNode) && ConstantNode.is(expNode)
			? new ConstantNode(baseNode.value ** expNode.value)
			: new PowerNode(baseNode, expNode)
	const refs = new Set([...base[REFS], ...exponent[REFS]])
	return CalcExpression._create(node, refs)
}

/**
 * Compute sine of an expression.
 */
export function sin<Refs extends string>(arg: CalcExpression<Refs>): CalcExpression<Refs> {
	const argNode = arg[NODE]
	const node = ConstantNode.is(argNode)
		? new ConstantNode(Math.sin(argNode.value))
		: new SinNode(argNode)
	return CalcExpression._create(node, new Set(arg[REFS]))
}

/**
 * Compute absolute value of an expression.
 */
export function abs<Refs extends string>(arg: CalcExpression<Refs>): CalcExpression<Refs> {
	const argNode = arg[NODE]
	const node = ConstantNode.is(argNode)
		? new ConstantNode(Math.abs(argNode.value))
		: new AbsNode(argNode)
	return CalcExpression._create(node, new Set(arg[REFS]))
}

/**
 * Compute sign of an expression (-1, 0, or 1).
 */
export function sign<Refs extends string>(arg: CalcExpression<Refs>): CalcExpression<Refs> {
	const argNode = arg[NODE]
	const node = ConstantNode.is(argNode)
		? new ConstantNode(Math.sign(argNode.value))
		: new SignNode(argNode)
	return CalcExpression._create(node, new Set(arg[REFS]))
}

/**
 * Return the maximum of two expressions.
 */
export function max<A extends string, B extends string>(
	left: CalcExpression<A>,
	right: CalcExpression<B>,
): CalcExpression<A | B> {
	const leftNode = left[NODE]
	const rightNode = right[NODE]
	const node =
		ConstantNode.is(leftNode) && ConstantNode.is(rightNode)
			? new ConstantNode(Math.max(leftNode.value, rightNode.value))
			: new MaxNode(leftNode, rightNode)
	const refs = new Set([...left[REFS], ...right[REFS]])
	return CalcExpression._create(node, refs)
}

/**
 * Return the minimum of two expressions.
 */
export function min<A extends string, B extends string>(
	left: CalcExpression<A>,
	right: CalcExpression<B>,
): CalcExpression<A | B> {
	const leftNode = left[NODE]
	const rightNode = right[NODE]
	const node =
		ConstantNode.is(leftNode) && ConstantNode.is(rightNode)
			? new ConstantNode(Math.min(leftNode.value, rightNode.value))
			: new MinNode(leftNode, rightNode)
	const refs = new Set([...left[REFS], ...right[REFS]])
	return CalcExpression._create(node, refs)
}

/**
 * Clamp a value between minimum and maximum.
 */
export function clamp<A extends string, B extends string, C extends string>(
	minimum: CalcExpression<A>,
	value: CalcExpression<B>,
	maximum: CalcExpression<C>,
): CalcExpression<A | B | C> {
	const minNode = minimum[NODE]
	const valNode = value[NODE]
	const maxNode = maximum[NODE]
	const node =
		ConstantNode.is(minNode) && ConstantNode.is(valNode) && ConstantNode.is(maxNode)
			? new ConstantNode(Math.max(minNode.value, Math.min(valNode.value, maxNode.value)))
			: new ClampNode(minNode, valNode, maxNode)
	const refs = new Set([...minimum[REFS], ...value[REFS], ...maximum[REFS]])
	return CalcExpression._create(node, refs)
}
