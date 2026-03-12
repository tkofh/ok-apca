import { Calc } from '@ok-apca/calc-tree'
import { type Color, createColor, inP3 } from './color.ts'
import { clampNumber } from './util.ts'

/**
 * Exponent for sine-based curvature correction on the right half of the
 * gamut boundary tent function.
 *
 * Value 0.95 was determined empirically by testing across all 360 hues.
 */
const GAMUT_SINE_CURVATURE_EXPONENT = 0.95

// =============================================================================
// Hue Data
// =============================================================================

/**
 * All hue-dependent data: gamut boundary geometry and Y correction coefficients.
 * Computed once per hue and cached. Use {@link computeGamutSlice} to create.
 */
export interface GamutSlice {
	/** The hue angle (0–360). */
	readonly hue: number
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
	/**
	 * Pre-scaled Y correction coefficients for the k-polynomial.
	 * k = (apexC / apexL) · chromaRatio, so the polynomial 1 + A·k + B·k² + D·k³
	 * becomes 1 + fA·chroma + fB·chroma² + fD·chroma³.
	 */
	readonly fA: number
	readonly fB: number
	readonly fD: number
	/** Max chroma expression tree pre-bound to this slice's geometry. */
	readonly maxChroma: Calc.Expression<'lightness'>
}

const gamutSliceCache = new Map<number, GamutSlice>()

/**
 * Compute all hue-dependent data: gamut boundary and Y correction coefficients.
 * Results are cached by hue.
 */
export function computeGamutSlice(hue: number): GamutSlice {
	const cached = gamutSliceCache.get(hue)
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

	const yCoeffA = 3 * (Y_FROM_L * kL + Y_FROM_M * kM + Y_FROM_S * kS)
	const yCoeffB = 3 * (Y_FROM_L * kL * kL + Y_FROM_M * kM * kM + Y_FROM_S * kS * kS)
	const yCoeffD = Y_FROM_L * kL ** 3 + Y_FROM_M * kM ** 3 + Y_FROM_S * kS ** 3

	const kScale = maxC / lightnessAtMaxChroma

	const slice: GamutSlice = {
		hue,
		apexL: lightnessAtMaxChroma,
		apexC: maxC,
		curvature,
		yCoeffA,
		yCoeffB,
		yCoeffD,
		fA: yCoeffA * kScale,
		fB: yCoeffB * kScale ** 2,
		fD: yCoeffD * kScale ** 3,
		maxChroma: Calc.bind(maxChromaExpr, {
			apexL: lightnessAtMaxChroma,
			apexC: maxC,
			curvature,
		}),
	}

	gamutSliceCache.set(hue, slice)
	return slice
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
		if (inP3({ lightness, chroma: mid, hue })) {
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

const oneMinusApexL = Calc.subtract(1, 'apexL')

export const maxChromaExpr: Calc.Expression<'lightness' | 'apexL' | 'apexC' | 'curvature'> =
	Calc.lerp(
		Calc.divide(Calc.multiply('apexC', 'lightness'), 'apexL'),
		Calc.add(
			Calc.divide(Calc.multiply('apexC', Calc.subtract(1, 'lightness')), oneMinusApexL),
			Calc.multiply(
				Calc.multiply(
					'curvature',
					Calc.pow(
						Calc.sin(
							Calc.multiply(
								Calc.max(0, Calc.divide(Calc.subtract('lightness', 'apexL'), oneMinusApexL)),
								Math.PI,
							),
						),
						GAMUT_SINE_CURVATURE_EXPONENT,
					),
				),
				'apexC',
			),
		),
		Calc.max(0, Calc.sign(Calc.subtract('lightness', 'apexL'))),
	)

/**
 * Clamp chroma to Display P3 gamut boundary using tent function
 * with curvature correction.
 */
export function gamutMap(color: Color): Color {
	const { hue, chroma, lightness } = createColor(color)
	const slice = computeGamutSlice(hue)

	return createColor({
		hue,
		chroma: clampNumber(0, chroma, Calc.solve(slice.maxChroma, { lightness })),
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
export const exactY: Calc.Expression<'lightness' | 'yChroma' | 'yCoeffA' | 'yCoeffB' | 'yCoeffD'> =
	Calc.add(
		Calc.pow('lightness', 3),
		Calc.multiply('yCoeffA', Calc.multiply(Calc.pow('lightness', 2), 'yChroma')),
		Calc.multiply('yCoeffB', Calc.multiply('lightness', Calc.pow('yChroma', 2))),
		Calc.multiply('yCoeffD', Calc.pow('yChroma', 3)),
	)
