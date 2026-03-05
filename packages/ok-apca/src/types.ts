/**
 * Shared type definitions for ok-apca.
 */

/**
 * Controls how runtime CSS custom property inputs are processed.
 *
 * - `'percentage'` (default): Inputs are 0-100, clamped and normalized to 0-1.
 * - `'normalized'`: Inputs are already 0-1, no clamping or normalization applied.
 *   Use this for closed systems where inputs are guaranteed valid.
 */
export type InputMode = 'percentage' | 'normalized'

export interface ContrastColor {
	readonly label: string
}

/**
 * Options for defining a hue with optional contrast colors.
 * All optional fields have sensible defaults applied by `defineHue`.
 */
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
	 * Controls how runtime CSS custom property inputs are processed.
	 * @default 'percentage'
	 */
	readonly inputMode?: InputMode
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

/**
 * Internal type for generateHueCss input.
 */
export interface HueDefinition {
	readonly hue: number
	readonly selector: string
	readonly output: string
	readonly contrastColors: readonly ContrastColor[]
	readonly inputMode: InputMode
	readonly noContrastInversion: boolean
}

/**
 * Validated and normalized hue with generated CSS.
 * Created by `defineHue`.
 */
export interface Hue {
	readonly hue: number
	readonly selector: string
	readonly css: string
}
