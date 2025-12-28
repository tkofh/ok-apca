/**
 * OKLCH color representation and Display P3 gamut mapping.
 */

import _Color from 'colorjs.io'
import type { GamutBoundary } from './types.ts'

export interface Color {
	readonly hue: number
	readonly chroma: number
	readonly lightness: number
}

class ColorImpl implements Color {
	readonly hue: number
	readonly chroma: number
	readonly lightness: number

	constructor(hue: number, chroma: number, lightness: number) {
		this.hue = hue
		this.chroma = chroma
		this.lightness = lightness
	}
}

/**
 * Create a new Color instance.
 */
export function createColor(hue: number, chroma: number, lightness: number): Color {
	return new ColorImpl(hue, chroma, lightness)
}

const gamutBoundaryCache = new Map<number, GamutBoundary>()

function findMaxChromaAtLightness(hue: number, lightness: number): number {
	let low = 0
	let high = 0.4
	const tolerance = 0.0001

	while (high - low > tolerance) {
		const mid = (low + high) / 2
		const color = new _Color('oklch', [lightness, mid, hue])

		if (color.inGamut('p3')) {
			low = mid
		} else {
			high = mid
		}
	}

	return low
}

/**
 * Find Display P3 gamut boundary for a hue.
 * Returns lMax (lightness at peak chroma) and cPeak (maximum chroma value).
 * Results are cached.
 */
export function findGamutBoundary(hue: number): GamutBoundary {
	const cached = gamutBoundaryCache.get(hue)
	if (cached !== undefined) {
		return cached
	}

	const samples = 1000
	let maxChroma = 0
	let lightnessAtMaxChroma = 0

	for (let i = 0; i <= samples; i++) {
		const l = i / samples
		const c = findMaxChromaAtLightness(hue, l)

		if (c > maxChroma) {
			maxChroma = c
			lightnessAtMaxChroma = l
		}
	}

	const boundary: GamutBoundary = {
		lMax: lightnessAtMaxChroma,
		cPeak: maxChroma,
	}

	gamutBoundaryCache.set(hue, boundary)
	return boundary
}

function computeTent(L: number, lMax: number): number {
	if (L <= 0 || L >= 1) {
		return 0
	}
	if (lMax <= 0 || lMax >= 1) {
		return 0
	}
	return Math.min(L / lMax, (1 - L) / (1 - lMax))
}

/**
 * Clamp chroma to Display P3 gamut boundary using tent function approximation.
 * Matches CSS implementation exactly.
 */
export function gamutMap(color: Color): Color {
	const { hue, chroma, lightness } = color
	const { lMax, cPeak } = findGamutBoundary(hue)

	const L = Math.max(0, Math.min(1, lightness))
	const tent = computeTent(L, lMax)
	const maxChroma = cPeak * tent
	const clampedChroma = Math.min(Math.max(0, chroma), maxChroma)

	return new ColorImpl(hue, clampedChroma, L)
}

/**
 * Get the relative luminance (Y in XYZ-D65) of an OKLCH color.
 */
export function getLuminance(color: Color): number {
	const c = new _Color('oklch', [color.lightness, color.chroma, color.hue])
	return c.luminance
}
