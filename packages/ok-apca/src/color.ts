import { clampNumber } from './util.ts'

export interface Color {
	readonly lightness: number
	readonly chroma: number
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
