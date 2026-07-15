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

/**
 * CIE Y extraction weights for each LMS cone channel.
 * Second row of the LMS->XYZ matrix (recalculated D65, from colorjs.io).
 */
const Y_FROM_L = -0.0405757452148008
const Y_FROM_M = 1.112286803280317
const Y_FROM_S = -0.0717110580655164

/**
 * OKLab->LMS' chroma coefficients for each cone channel.
 * Each cone's response to chroma is: k_i = KA_i*cos(hue) + KB_i*sin(hue).
 * The lightness coefficient is implicitly 1 for all channels.
 */
const L_PRIME_KA = 0.3963377773761749
const L_PRIME_KB = 0.2158037573099136
const M_PRIME_KA = -0.1055613458156586
const M_PRIME_KB = -0.0638541728258133
const S_PRIME_KA = -0.0894841775298119
const S_PRIME_KB = -1.2914855480194092

/**
 * All hue-dependent data: gamut boundary geometry and Y correction coefficients.
 * Computed once per hue and cached. Use {@link computeGamutSlice} to create.
 */
export type GamutSlice = {
	/** The hue angle (0–360). */
	readonly hue: number
	/** Lightness at the gamut boundary apex (maximum chroma point). */
	readonly apexL: number
	/** Maximum chroma at the apex lightness. */
	readonly apexC: number
	/**
	 * Curvature correction for the right half of the tent.
	 * The actual gamut boundary curves inward from the linear tent approximation.
	 * Applied via pow(sin(t * pi), exponent) basis function.
	 * Always negative (actual boundary is inside linear approximation).
	 */
	readonly tentK: number
	/** Y polynomial coefficient for L^2*C term. */
	readonly yCoeffA: number
	/** Y polynomial coefficient for L*C^2 term. */
	readonly yCoeffB: number
	/** Y polynomial coefficient for C^3 term. */
	readonly yCoeffD: number
	/**
	 * Pre-scaled Y correction coefficients for the k-polynomial.
	 * k = (apexC / apexL) * chromaRatio, so the polynomial 1 + A*k + B*k^2 + D*k^3
	 * becomes 1 + fA*chroma + fB*chroma^2 + fD*chroma^3.
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
	let apexC = 0
	let apexL = 0

	for (let i = 0; i <= samples; i++) {
		const l = i / samples
		const c = findMaxChromaAtLightness(hue, l)

		if (c > apexC) {
			apexC = c
			apexL = l
		}
	}

	const tentK = fitCurvature(hue, apexL, apexC)

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

	const kScale = apexC / apexL

	const slice: GamutSlice = {
		hue,
		apexL,
		apexC,
		tentK,
		yCoeffA,
		yCoeffB,
		yCoeffD,
		fA: yCoeffA * kScale,
		fB: yCoeffB * kScale ** 2,
		fD: yCoeffD * kScale ** 3,
		maxChroma: Calc.bind(maxChromaExpr, { apexL, apexC, tentK }),
	}

	gamutSliceCache.set(hue, slice)
	return slice
}

/** Binary-search the largest chroma that still sits inside Display P3 at this hue and lightness. */
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
 * Uses pow(sin(t * pi), 0.95) as the basis function, which:
 * - Peaks at t=0.5 (like t*(1-t))
 * - Optimal exponent determined by testing across all 360 hues
 * - Keeps t to a single reference in the emitted CSS: sin(t * pi) names t once,
 *   where the algebraic bump t*(1-t) would name it twice. That halving is what
 *   keeps the fully-expanded maxChromaExpr small (see the DevTools expansion
 *   constraint in CLAUDE.md).
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

/**
 * Display P3 max chroma as a function of `lightness`, for one hue's geometry.
 *
 * A tent: chroma rises linearly from 0 at black to `apexC` at `apexL`, then falls
 * back to 0 at white. The real boundary bows inward from that right-hand ramp, so
 * past the apex a sine curvature term scaled by `tentK` (always negative) is added.
 * Left of the apex the lerp selects the bare linear ramp, so that half stays exact.
 *
 * The sine basis is chosen so sin() names its argument once, keeping the
 * fully-expanded CSS small (see fitCurvature and the DevTools expansion constraint
 * in CLAUDE.md). Bind `apexL`, `apexC`, and `tentK` from a GamutSlice. `lightness`
 * stays a runtime input.
 */
export const maxChromaExpr: Calc.Expression<'lightness' | 'apexL' | 'apexC' | 'tentK'> = Calc.lerp(
	Calc.divide(Calc.multiply(Calc.ref('apexC'), Calc.ref('lightness')), Calc.ref('apexL')),
	Calc.add(
		Calc.divide(
			Calc.multiply(Calc.ref('apexC'), Calc.subtract(1, Calc.ref('lightness'))),
			Calc.subtract(1, Calc.ref('apexL')),
		),
		Calc.multiply(
			Calc.multiply(
				Calc.ref('tentK'),
				Calc.pow(
					Calc.sin(
						Calc.multiply(
							Calc.max(
								0,
								Calc.divide(
									Calc.subtract(Calc.ref('lightness'), Calc.ref('apexL')),
									Calc.subtract(1, Calc.ref('apexL')),
								),
							),
							Math.PI,
						),
					),
					GAMUT_SINE_CURVATURE_EXPONENT,
				),
			),
			Calc.ref('apexC'),
		),
	),
	Calc.max(0, Calc.sign(Calc.subtract(Calc.ref('lightness'), Calc.ref('apexL')))),
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
