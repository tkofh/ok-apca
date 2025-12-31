/**
 * ok-apca - OKLCH color utilities with APCA-based contrast
 */

import { generateHueCss } from './generator.ts'
import type { ContrastColor, Hue, HueOptions } from './types.ts'

export { createColor, gamutMap } from './color.ts'
export { applyContrast } from './contrast.ts'
export type { Color, ContrastColor, Hue, HueOptions } from './types.ts'

const LABEL_REGEX = /^[a-z][a-z0-9_-]*$/i

function validateLabel(label: string): void {
	if (!LABEL_REGEX.test(label)) {
		throw new Error(
			`Invalid contrast color label '${label}'. Labels must start with a letter and contain only letters, numbers, hyphens, and underscores.`,
		)
	}
}

function validateUniqueLabels(labels: readonly string[]): void {
	const seen = new Set<string>()
	for (const label of labels) {
		if (seen.has(label)) {
			throw new Error(
				`Duplicate contrast color label '${label}'. Each contrast color must have a unique label.`,
			)
		}
		seen.add(label)
	}
}

/**
 * Define a hue with optional contrast colors.
 * Validates all inputs and returns a normalized `Hue` with generated CSS.
 *
 * @example
 * ```ts
 * const blue = defineHue({
 *   hue: 240,
 *   selector: '.blue',
 *   contrastColors: [{ label: 'text' }],
 * })
 * console.log(blue.css) // Generated CSS string
 * ```
 */
export function defineHue(options: HueOptions): Hue {
	const hue = ((options.hue % 360) + 360) % 360
	const contrastColors: readonly ContrastColor[] = options.contrastColors ?? []
	const output = options.output ?? 'color'
	const selector = options.selector

	const labels = contrastColors.map((c) => c.label)
	for (const label of labels) {
		validateLabel(label)
	}
	validateUniqueLabels(labels)

	const css = generateHueCss({ hue, selector, output, contrastColors })

	return {
		hue,
		selector,
		css,
	}
}
