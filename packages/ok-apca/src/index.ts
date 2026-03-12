/**
 * ok-apca - OKLCH color utilities with APCA-based contrast
 */

import {
	type ColorSystem,
	type ColorsDefinition,
	generateColorsCss,
	type HueEntry,
} from './generator.ts'

export type { Color } from './color.ts'
export { computeContrastColor, measureContrast } from './contrast.ts'
export type { ColorSystem, HueEntry } from './generator.ts'

export interface DefineColorsOptions {
	/**
	 * Base name for output CSS custom properties.
	 * @default 'color'
	 */
	readonly output?: string
	/** Selector for the base color + variant declarations. */
	readonly baseSelector: string
	/** Hue definitions. Each gets a selector setting gamut constants. */
	readonly hues: readonly HueEntry[]
	/**
	 * Contrast variant labels (e.g., `['text', 'fill', 'stroke']`).
	 * Each produces a `--{output}-{variant}` color output.
	 */
	readonly variants?: readonly string[]
	/**
	 * Disables automatic contrast polarity inversion.
	 *
	 * By default, when the preferred polarity direction cannot achieve as much
	 * contrast as the opposite direction, the system automatically inverts to
	 * maximize contrast. Set this to `true` to always use the preferred polarity
	 * direction, clamping to black/white if necessary.
	 *
	 * @default false
	 */
	readonly noContrastInversion?: boolean
}

const LABEL_REGEX = /^[a-z][a-z0-9_-]*$/i

function validateLabel(label: string, context: string): void {
	if (!LABEL_REGEX.test(label)) {
		throw new Error(
			`Invalid ${context} '${label}'. Must start with a letter and contain only letters, numbers, hyphens, and underscores.`,
		)
	}
}

function validateUniqueLabels(labels: readonly string[], context: string): void {
	const seen = new Set<string>()
	for (const label of labels) {
		if (seen.has(label)) {
			throw new Error(`Duplicate ${context} '${label}'. Each must be unique.`)
		}
		seen.add(label)
	}
}

/**
 * Define a multi-hue color system with APCA-based contrast variants.
 *
 * Generates CSS where the base selector contains all color math (using
 * CSS custom properties for gamut constants), and each hue gets a
 * selector that sets those constants.
 *
 * @example
 * ```ts
 * const system = defineColors({
 *   baseSelector: '.color',
 *   hues: [
 *     { name: 'red', hue: 25, selector: '.color-red' },
 *     { name: 'blue', hue: 240, selector: '.color-blue' },
 *   ],
 *   variants: ['text', 'fill'],
 * })
 * console.log(system.css) // Generated CSS string
 * ```
 */
export function defineColors(options: DefineColorsOptions): ColorSystem {
	const output = options.output ?? 'color'
	const variants: readonly string[] = options.variants ?? []
	const noContrastInversion = options.noContrastInversion ?? false

	// Validate hue names
	const hueNames = options.hues.map((h) => h.name)
	for (const name of hueNames) {
		validateLabel(name, 'hue name')
	}
	validateUniqueLabels(hueNames, 'hue name')

	// Validate variant labels
	for (const variant of variants) {
		validateLabel(variant, 'variant label')
	}
	validateUniqueLabels(variants, 'variant label')

	const definition: ColorsDefinition = {
		output,
		baseSelector: options.baseSelector,
		hues: options.hues,
		variants,
		noContrastInversion,
	}

	return generateColorsCss(definition)
}
