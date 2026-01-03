/**
 * OKLCH color representation and Display P3 gamut mapping.
 */

import { constant } from '@ok-apca/calc-tree'
import _Color from 'colorjs.io'
import { GAMUT_SINE_CURVATURE_EXPONENT } from './constants.ts'
import { createMaxChromaExpr } from './expressions.ts'
import type { Color, GamutApex, GamutSlice } from './types.ts'
import { clamp } from './util.ts'

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

const gamutSliceCache = new Map<number, GamutSlice>()

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
 * Fit curvature correction for the right half of the tent using a sine basis.
 * The correction models how the actual gamut boundary curves inward
 * from the linear tent approximation.
 *
 * Uses pow(sin(t * π), 0.95) as the basis function, which:
 * - Peaks at t=0.5 (like t*(1-t))
 * - Optimal exponent determined by testing across all 360 hues
 * - Allows single evaluation of t in CSS (sin only uses t once)
 */
function fitCurvature(hue: number, apex: GamutApex): number {
	const samples = 50
	let sumProduct = 0
	let sumBasisSquared = 0

	for (let i = 0; i <= samples; i++) {
		const t = i / samples
		const L = apex.lightness + (1 - apex.lightness) * t
		const actualChroma = findMaxChromaAtLightness(hue, L)
		const linearChroma = (apex.chroma * (1 - L)) / (1 - apex.lightness)
		const error = actualChroma - linearChroma

		const basis = Math.sin(t * Math.PI) ** GAMUT_SINE_CURVATURE_EXPONENT * apex.chroma
		sumProduct += error * basis
		sumBasisSquared += basis * basis
	}

	return sumProduct / sumBasisSquared
}

/**
 * Find the gamut slice for a hue in Display P3.
 * Returns the apex (lightness and chroma at maximum) and curvature correction.
 * Results are cached.
 */
export function findGamutSlice(hue: number): GamutSlice {
	const cached = gamutSliceCache.get(hue)
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

	const apex: GamutApex = {
		lightness: lightnessAtMaxChroma,
		chroma: maxChroma,
	}

	const curvature = fitCurvature(hue, apex)

	const slice: GamutSlice = { apex, curvature }

	gamutSliceCache.set(hue, slice)
	return slice
}

/**
 * Compute the maximum chroma at a given lightness using the tent function
 * with sine-based curvature correction on the right half.
 *
 * Uses the shared expression tree from expressions.ts to ensure parity
 * with CSS generation.
 */
function computeMaxChromaInternal(L: number, slice: GamutSlice): number {
	const { apex, curvature } = slice

	// Edge cases not handled by the expression (division by zero)
	if (L <= 0 || L >= 1) {
		return 0
	}
	if (apex.lightness <= 0 || apex.lightness >= 1) {
		return 0
	}

	const result = createMaxChromaExpr().evaluate({
		lightness: constant(L),
		apexL: constant(apex.lightness),
		apexChroma: constant(apex.chroma),
		curvature: constant(curvature),
	})

	if (result.type !== 'number') {
		throw new Error('Expected numeric result from constant expression')
	}

	return result.value
}

/**
 * Compute the maximum in-gamut chroma at a given lightness for a hue.
 * Uses the tent function with sine-based curvature correction.
 */
export function getMaxChroma(lightness: number, hue: number): number {
	const slice = findGamutSlice(hue)
	return computeMaxChromaInternal(lightness, slice)
}

/**
 * Clamp chroma to Display P3 gamut boundary using tent function
 * with curvature correction.
 */
export function gamutMap(color: Color): Color {
	const { hue, chroma, lightness } = color
	const slice = findGamutSlice(hue)

	const L = clamp(0, lightness, 1)
	const maxChroma = computeMaxChromaInternal(L, slice)
	const clampedChroma = clamp(0, chroma, maxChroma)

	return new ColorImpl(hue, clampedChroma, L)
}

/**
 * Get the relative luminance (Y in XYZ-D65) of an OKLCH color.
 */
export function getLuminance(color: Color): number {
	const c = new _Color('oklch', [color.lightness, color.chroma, color.hue])
	return c.luminance
}
