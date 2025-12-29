export function signedPow(x: number, exp: number): number {
	return Math.sign(x) * Math.abs(x) ** exp
}

export function clamp(min: number, value: number, max: number): number {
	return Math.max(min, Math.min(max, value))
}

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
