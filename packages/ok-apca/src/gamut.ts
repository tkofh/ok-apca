import * as ct from '@ok-apca/calc-tree'
import { inGamut, OKLCH, P3 } from 'colorjs.io/fn'
import { type Color, createColor } from './color.ts'
import { GAMUT_SINE_CURVATURE_EXPONENT } from './constants.ts'
import { clampNumber } from './util.ts'

// =============================================================================
// Hue Data
// =============================================================================

/**
 * All hue-dependent data: gamut boundary geometry and Y correction coefficients.
 * Computed once per hue and cached.
 */
export interface HueData {
	/** Lightness at the gamut boundary apex (maximum chroma point). */
	readonly apexL: number
	/** Maximum chroma at the apex lightness. */
	readonly apexC: number
	/**
	 * Curvature correction for the right half of the tent.
	 * The actual gamut boundary curves inward from the linear tent approximation.
	 * Applied via pow(sin(t * π), exponent) basis function.
	 * Always negative (actual boundary is inside linear approximation).
	 */
	readonly curvature: number
	/** Y polynomial coefficient for L²·C term. */
	readonly yCoeffA: number
	/** Y polynomial coefficient for L·C² term. */
	readonly yCoeffB: number
	/** Y polynomial coefficient for C³ term. */
	readonly yCoeffD: number
}

const hueDataCache = new Map<number, HueData>()

/**
 * Compute all hue-dependent data: gamut boundary and Y correction coefficients.
 * Results are cached by hue.
 */
export function computeHueData(hue: number): HueData {
	const cached = hueDataCache.get(hue)
	if (cached !== undefined) {
		return cached
	}

	// Gamut boundary
	const samples = 1000
	let maxC = 0
	let lightnessAtMaxChroma = 0

	for (let i = 0; i <= samples; i++) {
		const l = i / samples
		const c = findMaxChromaAtLightness(hue, l)

		if (c > maxC) {
			maxC = c
			lightnessAtMaxChroma = l
		}
	}

	const curvature = fitCurvature(hue, lightnessAtMaxChroma, maxC)

	// Y correction coefficients
	const hRad = (hue * Math.PI) / 180
	const alpha = Math.cos(hRad)
	const beta = Math.sin(hRad)

	const kL = L_PRIME_KA * alpha + L_PRIME_KB * beta
	const kM = M_PRIME_KA * alpha + M_PRIME_KB * beta
	const kS = S_PRIME_KA * alpha + S_PRIME_KB * beta

	const hueData: HueData = {
		apexL: lightnessAtMaxChroma,
		apexC: maxC,
		curvature,
		yCoeffA: 3 * (Y_FROM_L * kL + Y_FROM_M * kM + Y_FROM_S * kS),
		yCoeffB: 3 * (Y_FROM_L * kL * kL + Y_FROM_M * kM * kM + Y_FROM_S * kS * kS),
		yCoeffD: Y_FROM_L * kL ** 3 + Y_FROM_M * kM ** 3 + Y_FROM_S * kS ** 3,
	}

	hueDataCache.set(hue, hueData)
	return hueData
}

// =============================================================================
// Gamut Boundary Computation (colorjs.io)
// =============================================================================

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
function fitCurvature(hue: number, apexL: number, apexC: number): number {
	const samples = 50
	let sumProduct = 0
	let sumBasisSquared = 0

	for (let i = 0; i <= samples; i++) {
		const t = i / samples
		const L = apexL + (1 - apexL) * t
		const actualChroma = findMaxChromaAtLightness(hue, L)
		const linearChroma = (apexC * (1 - L)) / (1 - apexL)
		const error = actualChroma - linearChroma

		const basis = Math.sin(t * Math.PI) ** GAMUT_SINE_CURVATURE_EXPONENT * apexC
		sumProduct += error * basis
		sumBasisSquared += basis * basis
	}

	return sumProduct / sumBasisSquared
}

// =============================================================================
// Max Chroma Expression Tree
// =============================================================================

const oneMinusApexL = ct.subtract(1, 'apexL')
const gamutLeftHalf = ct.divide(ct.multiply('apexC', 'lightness'), 'apexL')
const gamutT = ct.max(0, ct.divide(ct.subtract('lightness', 'apexL'), oneMinusApexL))
const linearChroma = ct.divide(ct.multiply('apexC', ct.subtract(1, 'lightness')), oneMinusApexL)
const curvatureCorrection = ct.multiply(
	ct.multiply(
		'curvature',
		ct.pow(ct.sin(ct.multiply(gamutT, Math.PI)), GAMUT_SINE_CURVATURE_EXPONENT),
	),
	'apexC',
)
const gamutRightHalf = ct.add(linearChroma, curvatureCorrection)
const isRightOfApex = ct.max(0, ct.sign(ct.subtract('lightness', 'apexL')))

export const maxChromaExpr: ct.CalcExpression<'lightness' | 'apexL' | 'apexC' | 'curvature'> =
	ct.lerp(gamutLeftHalf, gamutRightHalf, isRightOfApex)

// =============================================================================
// Max Chroma Runtime
// =============================================================================

/**
 * Compute the maximum chroma at a given lightness using the tent function
 * with sine-based curvature correction on the right half.
 *
 * Uses the shared expression tree to ensure parity with CSS generation.
 */
export function computeMaxChroma(lightness: number, hueData: HueData): number {
	// Edge cases not handled by the expression (division by zero)
	if (lightness <= 0 || lightness >= 1) {
		return 0
	}
	if (hueData.apexL <= 0 || hueData.apexL >= 1) {
		return 0
	}

	return maxChromaExpr.solve({
		lightness,
		apexL: hueData.apexL,
		apexC: hueData.apexC,
		curvature: hueData.curvature,
	})
}

/**
 * Compute the maximum in-gamut chroma at a given lightness for a hue.
 * Uses the tent function with sine-based curvature correction.
 */
export function getMaxChroma(lightness: number, hue: number): number {
	return computeMaxChroma(lightness, computeHueData(hue))
}

/**
 * Clamp chroma to Display P3 gamut boundary using tent function
 * with curvature correction.
 */
export function gamutMap(color: Color): Color {
	const { hue, chroma, lightness } = createColor(color)
	const hueData = computeHueData(hue)

	return createColor({
		hue,
		chroma: clampNumber(0, chroma, computeMaxChroma(lightness, hueData)),
		lightness,
	})
}

// =============================================================================
// OKLab → CIE Y Constants
// =============================================================================

/**
 * CIE Y extraction weights for each LMS cone channel.
 * Second row of the LMS→XYZ matrix (recalculated D65, from colorjs.io).
 */
const Y_FROM_L = -0.0405757452148008
const Y_FROM_M = 1.112286803280317
const Y_FROM_S = -0.0717110580655164

/**
 * OKLab→LMS' chroma coefficients for each cone channel.
 * Each cone's response to chroma is: k_i = KA_i·cos(hue) + KB_i·sin(hue).
 * The lightness coefficient is implicitly 1 for all channels.
 */
const L_PRIME_KA = 0.3963377773761749
const L_PRIME_KB = 0.2158037573099136
const M_PRIME_KA = -0.1055613458156586
const M_PRIME_KB = -0.0638541728258133
const S_PRIME_KA = -0.0894841775298119
const S_PRIME_KB = -1.2914855480194092

// =============================================================================
// Y Expression Trees
// =============================================================================

/**
 * Exact CIE Y from OKLCH lightness and chroma at a fixed hue.
 *
 * Y = L³ + A·L²·C + B·L·C² + D·C³
 *
 * Coefficients A, B, D are derived from the OKLab→XYZ matrices and depend
 * only on hue (precomputed at build time). For achromatic colors (C=0),
 * this reduces to Y = L³.
 */
export const exactY: ct.CalcExpression<
	'lightness' | 'yChroma' | 'yCoeffA' | 'yCoeffB' | 'yCoeffD'
> = ct.add(
	ct.pow('lightness', 3),
	ct.multiply('yCoeffA', ct.multiply(ct.pow('lightness', 2), 'yChroma')),
	ct.multiply('yCoeffB', ct.multiply('lightness', ct.pow('yChroma', 2))),
	ct.multiply('yCoeffD', ct.pow('yChroma', 3)),
)

// --- Y correction factor ---
//
// On the left half of the gamut tent, C is proportional to L:
//   C = (apexC / apexL) · L · chromaRatio = k · L
//
// Substituting into Y = L³ + A·L²·C + B·L·C² + D·C³:
//   Y = L³ · (1 + A·k + B·k² + D·k³) = L³ · f
//
// where f depends only on hue and the ratio k = C/L (not on L itself).
// This means:
//   Forward:  Y = pow(L, 3) · f
//   Inverse:  L = pow(Y / f, 1/3)
//
// For the inverse, we compute f using k = C_approx / L_approx, where
// L_approx = Y^(1/3) and C_approx = maxChroma(L_approx) · chromaRatio.
// This handles both left-half (exact) and right-half (good approximation,
// since chroma decreases toward white making the correction smaller).

/**
 * Y correction factor: f = 1 + A·k + B·k² + D·k³
 *
 * where k = C/L (the chroma-to-lightness ratio at a given point).
 * Multiply by L³ to get Y, or divide Y by f before taking the cube root to get L.
 */
export const yCorrectionFactor: ct.CalcExpression<
	'yCorrectionK' | 'yCoeffA' | 'yCoeffB' | 'yCoeffD'
> = ct.add(
	1,
	ct.multiply('yCoeffA', 'yCorrectionK'),
	ct.multiply('yCoeffB', ct.pow('yCorrectionK', 2)),
	ct.multiply('yCoeffD', ct.pow('yCorrectionK', 3)),
)

// =============================================================================
// CSS Generation Helpers
// =============================================================================

/**
 * Precompute the k-polynomial coefficients for the Y correction factor.
 * k = (apexC / apexL) · chromaRatio, so the polynomial 1 + A·k + B·k² + D·k³
 * becomes 1 + fA·chroma + fB·chroma² + fD·chroma³ with precomputed fA, fB, fD.
 */
export function correctionCoeffs(hueData: HueData) {
	const kScale = hueData.apexC / hueData.apexL
	return {
		fA: hueData.yCoeffA * kScale,
		fB: hueData.yCoeffB * kScale ** 2,
		fD: hueData.yCoeffD * kScale ** 3,
	}
}
