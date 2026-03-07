import { getLuminance, inGamut, OKLCH, P3 } from 'colorjs.io/fn'
import {
	APCA_BG_EXP_NORMAL,
	APCA_BG_EXP_REVERSE,
	APCA_FG_EXP_NORMAL,
	APCA_FG_EXP_REVERSE,
	APCA_OFFSET,
	APCA_SCALE,
	APCA_SMOOTH_THRESHOLD,
	GAMUT_SINE_CURVATURE_EXPONENT,
} from './constants.ts'
import { maxChroma } from './expressions.ts'
import { clampNumber } from './util.ts'

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

export interface ColorCoords {
	readonly hue: number
	readonly chroma: number
	readonly lightness: number
}

class Color implements ColorCoords {
	readonly lightness: number
	readonly chroma: number
	readonly hue: number

	constructor({ lightness, chroma, hue }: ColorCoords) {
		this.lightness = clampNumber(0, lightness, 1)
		this.chroma = clampNumber(0, chroma, 0.5)
		this.hue = hue
	}
}

export type { Color }
export type ColorInput = Color | ColorCoords

/**
 * Create a new Color instance.
 */
export function toColor(input: ColorInput): Color {
	return input instanceof Color ? input : new Color(input)
}

const gamutSliceCache = new Map<number, GamutSlice>()

function findMaxChromaAtLightness(hue: number, lightness: number): number {
	let low = 0
	let high = 0.4
	const tolerance = 0.0001

	while (high - low > tolerance) {
		const mid = (low + high) / 2
		if (inGamut({ space: OKLCH, coords: [lightness, mid, hue] }, P3)) {
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
export function computeMaxChroma(lightness: number, slice: GamutSlice): number {
	const { apex } = slice

	// Edge cases not handled by the expression (division by zero)
	if (lightness <= 0 || lightness >= 1) {
		return 0
	}
	if (apex.lightness <= 0 || apex.lightness >= 1) {
		return 0
	}

	return maxChroma.solve({
		lightness,
		apexL: slice.apex.lightness,
		apexC: slice.apex.chroma,
		curvature: slice.curvature,
	})
}

/**
 * Compute the maximum in-gamut chroma at a given lightness for a hue.
 * Uses the tent function with sine-based curvature correction.
 */
export function getMaxChroma(lightness: number, hue: number): number {
	const slice = findGamutSlice(hue)
	return computeMaxChroma(lightness, slice)
}

/**
 * Clamp chroma to Display P3 gamut boundary using tent function
 * with curvature correction.
 */
export function gamutMap(color: ColorInput): Color {
	const { hue, chroma, lightness } = toColor(color)

	return new Color({
		hue,
		chroma: clampNumber(0, chroma, computeMaxChroma(lightness, findGamutSlice(hue))),
		lightness,
	})
}

/**
 * APCA 0.0.98G constants (W3 version)
 * The following are specific to measurement only.
 */

// Black level soft clamp factor
// biome-ignore lint/suspicious/noApproximativeNumericConstant: w3 spec uses 1.414
const BLACK_CLAMP = 1.414

// Minimum delta Y to avoid division issues
const DELTA_Y_MIN = 0.0005

// Low contrast clipping threshold
const LOW_CLIP = 0.1

function colorLuminance(color: ColorInput): number {
	const { lightness, chroma, hue } = toColor(color)
	return getLuminance({ space: OKLCH, coords: [lightness, chroma, hue] })
}

/**
 * Measure APCA contrast between colors.
 * Returns signed Lc value: positive = dark on light, negative = light on dark.
 */
export function measureContrast(baseColor: ColorInput, contrastColor: ColorInput): number {
	let bgY = colorLuminance(baseColor)
	let fgY = colorLuminance(contrastColor)

	// Input validation
	if (
		!(Number.isFinite(fgY) && Number.isFinite(bgY)) ||
		Math.min(fgY, bgY) < 0 ||
		Math.max(fgY, bgY) > 1.1
	) {
		return 0
	}

	// Soft clamp black levels
	fgY = fgY > APCA_SMOOTH_THRESHOLD ? fgY : fgY + (APCA_SMOOTH_THRESHOLD - fgY) ** BLACK_CLAMP
	bgY = bgY > APCA_SMOOTH_THRESHOLD ? bgY : bgY + (APCA_SMOOTH_THRESHOLD - bgY) ** BLACK_CLAMP

	// Return 0 for extremely low delta Y
	if (Math.abs(bgY - fgY) < DELTA_Y_MIN) {
		return 0
	}

	let outputContrast: number

	if (bgY > fgY) {
		// Normal polarity: dark text on light background (BoW)
		const sapc = (bgY ** APCA_BG_EXP_NORMAL - fgY ** APCA_FG_EXP_NORMAL) * APCA_SCALE
		outputContrast = sapc < LOW_CLIP ? 0 : sapc - APCA_OFFSET
	} else {
		// Reverse polarity: light text on dark background (WoB)
		const sapc = (bgY ** APCA_BG_EXP_REVERSE - fgY ** APCA_FG_EXP_REVERSE) * APCA_SCALE
		outputContrast = sapc > -LOW_CLIP ? 0 : sapc + APCA_OFFSET
	}

	return outputContrast * 100
}
