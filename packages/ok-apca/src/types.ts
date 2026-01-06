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

export interface Color {
	readonly hue: number
	readonly chroma: number
	readonly lightness: number
}

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

export interface GamutApex {
	readonly lightness: number
	readonly chroma: number
}

export interface GamutSlice {
	readonly apex: GamutApex
	/**
	 * Quadratic curvature correction for the right half of the tent.
	 * The actual gamut boundary curves inward from the linear tent approximation.
	 * Applied as: correctedChroma = linearChroma + curvature * t * (1 - t) * apexChroma
	 * where t = (L - apexL) / (1 - apexL) for the right half (L > apexL).
	 * Always negative (actual boundary is inside linear approximation).
	 */
	readonly curvature: number
}
