/**
 * ok-apca - OKLCH color utilities with APCA-based contrast
 */

import { type ContrastColor, generateHueCss } from './generator.ts'

export type { Color } from './color.ts'
export { computeContrastColor, measureContrast } from './contrast.ts'
export type { ContrastColor, HueDefinition } from './generator.ts'

export interface HueOptions {
	readonly hue: number
	readonly selector: string
	readonly contrastColors?: readonly ContrastColor[]
	/**
	 * Base name for the output CSS custom properties.
	 * @default 'color'
	 */
	readonly output?: string
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

export interface Hue {
	readonly hue: number
	readonly selector: string
	readonly css: string
}

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
	const noContrastInversion = options.noContrastInversion ?? false
	const selector = options.selector

	const labels = contrastColors.map((c) => c.label)
	for (const label of labels) {
		validateLabel(label)
	}
	validateUniqueLabels(labels)

	const css = generateHueCss({
		hue,
		selector,
		output,
		contrastColors,
		noContrastInversion,
	})

	return {
		hue,
		selector,
		css,
	}
}
