import { getLuminance as _getLuminance, inGamut, OKLCH, P3 } from 'colorjs.io/fn'
import { clampNumber } from './util.ts'

/** A color in absolute OKLCH coordinates. */
export interface Color {
	/** OKLCH lightness in [0, 1]. */
	readonly lightness: number
	/**
	 * OKLCH chroma in absolute coordinates (roughly [0, 0.5]), not the [0, 1]
	 * ratio the CSS `--chroma` input uses.
	 */
	readonly chroma: number
	/** OKLCH hue angle in degrees, [0, 360). */
	readonly hue: number
}

/**
 * Create a Color with clamped values.
 * Lightness is clamped to [0, 1], chroma to [0, 0.5].
 */
export function createColor({ lightness, chroma, hue }: Color): Color {
	return {
		lightness: clampNumber(0, lightness, 1),
		chroma: clampNumber(0, chroma, 0.5),
		hue,
	}
}

/**
 * Get the relative luminance of a color, in the range [0, 1].
 * Assumes `color` is a valid OKLCH color (lightness in [0, 1], chroma in [0, 0.5], hue in [0, 360)).
 */
export function getLuminance({ lightness, chroma, hue }: Color): number {
	return _getLuminance({ space: OKLCH, coords: [lightness, chroma, hue] })
}

/**
 * Check if a color is within the P3 gamut.
 * Assumes `color` is a valid OKLCH color (lightness in [0, 1], chroma in [0, 0.5], hue in [0, 360)).
 */
export function inP3({ lightness, chroma, hue }: Color): boolean {
	return inGamut({ space: OKLCH, coords: [lightness, chroma, hue] }, P3)
}
