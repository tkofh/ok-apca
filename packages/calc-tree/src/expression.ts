import type { ExpressionNode } from './nodes.ts'
import { ConstantNode, ReferenceNode } from './nodes.ts'

declare const refs: unique symbol

export interface NumberExpression<Refs extends string = never> {
	readonly kind: 'NumberExpression'
	readonly [refs]?: Refs
}

export interface ColorExpression<Refs extends string = never> {
	readonly kind: 'ColorExpression'
	readonly [refs]?: Refs
}

interface InternalNumberExpression<Refs extends string = never> extends NumberExpression<Refs> {
	readonly _node: ExpressionNode
	readonly _refs: ReadonlySet<Refs>
}

export function nodeOf(expr: NumberExpression<string> | ColorExpression<string>): ExpressionNode {
	return (expr as InternalNumberExpression<string>)._node
}

export function refsOf<R extends string>(
	expr: NumberExpression<R> | ColorExpression<R>,
): ReadonlySet<R> {
	return (expr as InternalNumberExpression<R>)._refs
}

export function makeNumber<R extends string>(
	node: ExpressionNode,
	refs: ReadonlySet<string> = new Set(),
): NumberExpression<R> {
	return { _node: node, _refs: refs, kind: 'NumberExpression' } as NumberExpression<R>
}

export function makeColor<R extends string>(
	node: ExpressionNode,
	refs: ReadonlySet<string> = new Set(),
): ColorExpression<R> {
	return { _node: node, _refs: refs, kind: 'ColorExpression' } as ColorExpression<R>
}

export type ExpressionInput<Refs extends string = never> = NumberExpression<Refs> | number

type ValueRefs<V> = V extends NumberExpression<infer R> ? R : never

export type BindingRefs<T> = T extends Record<string, infer V> ? ValueRefs<V> : never

export type RelevantBindingRefs<B, Refs extends string> = BindingRefs<
	Pick<B, Extract<keyof B & string, Refs>>
>

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
	return makeNumber(new ConstantNode(num))
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
	const expr = makeNumber<Name>(new ReferenceNode(name), new Set([name]))
	referenceCache.set(name, expr)
	return expr
}

export function toExpression<Refs extends string>(
	input: ExpressionInput<Refs>,
): NumberExpression<Refs> {
	if (typeof input === 'number') {
		return constant(input) as NumberExpression<Refs>
	}
	return input as NumberExpression<Refs>
}

export function mergeRefs(...exprs: NumberExpression<string>[]): Set<string> {
	const merged = new Set<string>()
	for (const expr of exprs) {
		for (const ref of refsOf(expr)) {
			merged.add(ref)
		}
	}
	return merged
}

export function isConstantNode(node: unknown): node is ConstantNode {
	return node instanceof ConstantNode
}

function applyBindings(
	node: ExpressionNode,
	bindings: Record<string, ExpressionInput<string>> | undefined,
	exprRefs: ReadonlySet<string>,
): ExpressionNode {
	if (!bindings) {
		return node
	}
	const nodeBindings: Record<string, ExpressionNode> = {}
	for (const [key, value] of Object.entries(bindings) as [string, ExpressionInput<string>][]) {
		if (exprRefs.has(key)) {
			nodeBindings[key] = nodeOf(toExpression(value))
		}
	}
	return node.substitute(nodeBindings)
}

export function bindImpl<Refs extends string, B>(
	node: ExpressionNode,
	exprRefs: ReadonlySet<string>,
	bindings: B & Partial<Record<Refs, ExpressionInput<string>>>,
): { node: ExpressionNode; refs: ReadonlySet<string> } {
	const nodeBindings: Record<string, ExpressionNode> = {}
	const newRefs = new Set(exprRefs)

	for (const [key, val] of Object.entries(bindings as Record<string, ExpressionInput<string>>)) {
		if (!exprRefs.has(key)) {
			continue
		}
		const expr = toExpression(val)
		nodeBindings[key] = nodeOf(expr)
		newRefs.delete(key)
		for (const ref of refsOf(expr)) {
			newRefs.add(ref)
		}
	}

	const newNode = node.substitute(nodeBindings)
	return { node: newNode, refs: newRefs }
}

export function serializeImpl(
	node: ExpressionNode,
	exprRefs: ReadonlySet<string>,
	bindings?: Record<string, ExpressionInput<string>>,
): string {
	const substituted = applyBindings(
		node,
		bindings as Record<string, ExpressionInput<string>>,
		exprRefs,
	)
	const declarations: Record<string, string> = {}
	const raw = substituted.serialize(declarations)
	return substituted.needsCalcWrap() ? `calc(${raw})` : raw
}

export function solveImpl(
	node: ExpressionNode,
	exprRefs: ReadonlySet<string>,
	bindings?: Record<string, ExpressionInput<string>>,
): number {
	const substituted = applyBindings(
		node,
		bindings as Record<string, ExpressionInput<string>>,
		exprRefs,
	)

	if (!substituted.isConstant()) {
		throw new Error('Cannot convert expression to number: unbound references remain')
	}

	return substituted.evaluateConstant()
}
