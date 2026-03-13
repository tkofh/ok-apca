import type { ExpressionNode } from './nodes.ts'
import { ConstantNode, ReferenceNode } from './nodes.ts'

export interface NumberExpression<Refs extends string = never> {
	/** @internal */ readonly _node: ExpressionNode
	/** @internal */ readonly _refs: ReadonlySet<Refs>
	readonly kind: 'NumberExpression'
}

export interface ColorExpression<Refs extends string = never> {
	/** @internal */ readonly _node: ExpressionNode
	/** @internal */ readonly _refs: ReadonlySet<Refs>
	readonly kind: 'ColorExpression'
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

export type ExpressionInput<Refs extends string = never> = NumberExpression<Refs> | number | string

export type InferRefs<T> =
	T extends NumberExpression<infer R>
		? R
		: T extends string
			? string extends T
				? never
				: T
			: never

export type ValueRefs<V> =
	V extends NumberExpression<infer R>
		? R
		: V extends string
			? string extends V
				? never // exclude bare 'string' type — only track literal refs
				: V
			: never

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

export function mergeRefs(...exprs: NumberExpression<string>[]): Set<string> {
	const refs = new Set<string>()
	for (const expr of exprs) {
		for (const ref of expr._refs) {
			refs.add(ref)
		}
	}
	return refs
}

export function isConstantNode(node: unknown): node is ConstantNode {
	return node instanceof ConstantNode
}

function applyBindings(
	node: ExpressionNode,
	bindings: Record<string, ExpressionInput<never>> | undefined,
	refs: ReadonlySet<string>,
): ExpressionNode {
	if (!bindings) {
		return node
	}
	const nodeBindings: Record<string, ExpressionNode> = {}
	for (const [key, value] of Object.entries(bindings) as [string, ExpressionInput<never>][]) {
		if (refs.has(key)) {
			nodeBindings[key] = toExpression(value)._node
		}
	}
	return node.substitute(nodeBindings)
}

export function bindImpl<Refs extends string, B>(
	node: ExpressionNode,
	refs: ReadonlySet<string>,
	bindings: B & Partial<Record<Refs, ExpressionInput<string>>>,
): { node: ExpressionNode; refs: ReadonlySet<string> } {
	const nodeBindings: Record<string, ExpressionNode> = {}
	const newRefs = new Set(refs)

	for (const [key, val] of Object.entries(bindings as Record<string, ExpressionInput<string>>)) {
		if (!refs.has(key)) {
			continue
		}
		const expr = toExpression(val)
		nodeBindings[key] = expr._node
		newRefs.delete(key)
		for (const ref of expr._refs) {
			newRefs.add(ref)
		}
	}

	const newNode = node.substitute(nodeBindings)
	return { node: newNode, refs: newRefs }
}

export function serializeImpl(
	node: ExpressionNode,
	refs: ReadonlySet<string>,
	bindings?: Record<string, ExpressionInput<never>>,
): string {
	const substituted = applyBindings(node, bindings as Record<string, ExpressionInput<never>>, refs)
	const declarations: Record<string, string> = {}
	const raw = substituted.serialize(declarations)
	return substituted.needsCalcWrap() ? `calc(${raw})` : raw
}

export function solveImpl(
	node: ExpressionNode,
	refs: ReadonlySet<string>,
	bindings?: Record<string, ExpressionInput<never>>,
): number {
	const substituted = applyBindings(node, bindings as Record<string, ExpressionInput<never>>, refs)

	if (!substituted.isConstant()) {
		throw new Error('Cannot convert expression to number: unbound references remain')
	}

	return substituted.evaluateConstant()
}
