import type { Var } from 'fashionable/var'

/**
 * A union of custom-property names as fashionable `Var` identities:
 * `Reads<'yBg' | 'contrast'>` is `Var.Var<'yBg'> | Var.Var<'contrast'>`.
 *
 * fashionable's `Vars` phantom carries per-name identities, not a name
 * union — the distribution here keeps each name separately subtractable
 * by `Calc.bind`. This is the annotation shorthand for expression trees
 * whose reads are all undeclared.
 */
export type Reads<Names extends string> = Names extends string ? Var.Var<Names> : never

/** Clamp `value` into `[min, max]`. Note the argument order: the value sits in the middle. */
export function clampNumber(min: number, value: number, max: number): number {
	return Math.min(Math.max(value, min), max)
}

export function invariant(condition: boolean, message: string): asserts condition {
	if (!condition) {
		throw new Error(message)
	}
}

export type NonEmptyArray<T> = readonly [T, ...T[]]
export type OneOrMore<T> = T | NonEmptyArray<T>
export type ZeroOrMore<T> = T | T[]

export function toArray<T>(value: OneOrMore<T>): NonEmptyArray<T>
export function toArray<T>(value: ZeroOrMore<T>): readonly T[]
export function toArray<T>(value: ZeroOrMore<T>): readonly T[] {
	if (Array.isArray(value)) {
		return value as never
	}
	return [value] as never
}
