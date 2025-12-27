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

export class ColorImpl implements Color {
	readonly hue: number
	readonly chroma: number
	readonly lightness: number

	constructor(hue: number, chroma: number, lightness: number) {
		this.hue = hue
		this.chroma = chroma
		this.lightness = lightness
	}
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
 * Compute Y-conversion coefficients for CSS generation.
 * Returns coefficients for: Y = yc0Coef·C³ + yc1Coef·C²·L + yc2Coef·C·L² + L³
 */
function _computeYConversionCoefficients(hue: number) {
	const hRad = (hue * Math.PI) / 180
	const cosH = Math.cos(hRad)
	const sinH = Math.sin(hRad)

	const aCoef = 0.3963377773761749 * cosH + 0.2158037573099136 * sinH
	const bCoef = -0.1055613458156586 * cosH + -0.0638541728258133 * sinH
	const cCoef = -0.0894841775298119 * cosH + -1.2914855480194092 * sinH

	const yFromL = -0.04077452336091804
	const yFromM = 1.1124921587493157
	const yFromS = -0.07171763538839791

	const yc0Coef = yFromL * aCoef ** 3 + yFromM * bCoef ** 3 + yFromS * cCoef ** 3
	const yc1Coef = yFromL * aCoef ** 2 + yFromM * bCoef ** 2 + yFromS * cCoef ** 2
	const yc2Coef = yFromL * aCoef + yFromM * bCoef + yFromS * cCoef

	return { yc0Coef, yc1Coef, yc2Coef }
}
