const hasFirstLineContentRe = /^[ \t]*\S/
const leadingIndentRe = /^[ \t]+/
const newlineWithIndentRe = /(?:\r\n|\r|\n)([ \t]*)(?:\S|$)/
const edgeSpaceRe = /^[ \t]*(?:\r\n|\r|\n)|(?:\r\n|\r|\n)[ \t]*$/g
const newlineSplitRe = /\r\n|\r|\n/

function printValue(value: unknown, prefix: string) {
	if (
		typeof value === 'string' ||
		(Array.isArray(value) && value.every((v) => typeof v === 'string'))
	) {
		return outdent(Array.isArray(value) ? value.join('\n') : value)
			.split(newlineSplitRe)
			.map((line, i) => (i === 0 || !line ? line : `${prefix}${line}`))
			.join('\n')
	}

	return String(value)
}

// biome-ignore lint/suspicious/noExplicitAny: the official way to type variadic template literal values
export function outdent(input: string | TemplateStringsArray, ...values: any[]) {
	const parts = typeof input === 'string' ? [input] : input

	const stripIndentRe = new RegExp(
		String.raw`(\r\n|\r|\n).{0,${parts[0] ? ((hasFirstLineContentRe.test(parts[0]) ? parts[0].match(leadingIndentRe)?.[0]?.length : parts[0].match(newlineWithIndentRe)?.[1]?.length) ?? 0) : 0}}`,
		'g',
	)

	let result = ''
	for (const [index, part] of parts.entries()) {
		result += part.replaceAll(stripIndentRe, '$1')
		if (index < values.length) {
			result += printValue(
				values[index],
				(result.split(newlineSplitRe).at(-1) ?? '').match(leadingIndentRe)?.[0] ?? '',
			)
		}
	}

	return result.replaceAll(edgeSpaceRe, '')
}

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
