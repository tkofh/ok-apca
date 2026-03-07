import type { CalcExpression } from '@ok-apca/calc-tree'
import * as ct from '@ok-apca/calc-tree'
import {
	APCA_BG_EXP_NORMAL,
	APCA_BG_EXP_REVERSE,
	APCA_FG_EXP_NORMAL,
	APCA_FG_EXP_REVERSE,
	APCA_NORMAL_INV_EXP,
	APCA_OFFSET,
	APCA_REVERSE_INV_EXP,
	APCA_SCALE,
	APCA_SMOOTH_POWER,
	APCA_SMOOTH_THRESHOLD,
	APCA_SMOOTH_THRESHOLD_OFFSET,
	COMPARISON_EPSILON,
	GAMUT_SINE_CURVATURE_EXPONENT,
	INVERSION_THRESHOLD,
} from './constants.ts'

const lightnessRef = ct.reference('lightness')
const contrastMagnitudeRef = ct.reference('contrastMagnitude')
const yBgRef = ct.reference('yBg')
const yFgRef = ct.reference('yFg')
const contrastRef = ct.reference('contrast')
const apexLRef = ct.reference('apexL')
const apexCRef = ct.reference('apexC')
const curvatureRef = ct.reference('curvature')
const yLightRef = ct.reference('yLight')
const yDarkRef = ct.reference('yDark')
const lcLightRef = ct.reference('lcLight')
const lcDarkRef = ct.reference('lcDark')

// --- Max chroma (gamut boundary) ---

const oneMinusApexL = ct.subtract(1, apexLRef)
const gamutLeftHalf = ct.divide(ct.multiply(apexCRef, lightnessRef), apexLRef)
const gamutT = ct.max(0, ct.divide(ct.subtract(lightnessRef, apexLRef), oneMinusApexL))
const linearChroma = ct.divide(ct.multiply(apexCRef, ct.subtract(1, lightnessRef)), oneMinusApexL)
const curvatureCorrection = ct.multiply(
	ct.multiply(
		curvatureRef,
		ct.pow(ct.sin(ct.multiply(gamutT, Math.PI)), GAMUT_SINE_CURVATURE_EXPONENT),
	),
	apexCRef,
)
const gamutRightHalf = ct.add(linearChroma, curvatureCorrection)
const isRightOfApex = ct.max(0, ct.sign(ct.subtract(lightnessRef, apexLRef)))

export const maxChroma: CalcExpression<'lightness' | 'apexL' | 'apexC' | 'curvature'> = ct.lerp(
	gamutLeftHalf,
	gamutRightHalf,
	isRightOfApex,
)

// --- Contrast polarity solver ---

const contrastDelta = ct.divide(ct.add(contrastMagnitudeRef, APCA_OFFSET), APCA_SCALE)

const smoothingBlend = ct.pow(
	ct.sin(ct.multiply(ct.min(ct.divide(contrastMagnitudeRef, APCA_SMOOTH_THRESHOLD), 1), Math.PI / 2)),
	APCA_SMOOTH_POWER,
)

const aboveSmoothThreshold = ct.max(0, ct.sign(ct.subtract(contrastMagnitudeRef, APCA_SMOOTH_THRESHOLD)))

export const normalPolarity: CalcExpression<'yBg' | 'contrastMagnitude'> = ct.lerp(
	ct.lerp(
		yBgRef,
		ct.signedPow(
			ct.subtract(ct.pow(yBgRef, APCA_BG_EXP_NORMAL), APCA_SMOOTH_THRESHOLD_OFFSET),
			APCA_NORMAL_INV_EXP,
		),
		smoothingBlend,
	),
	ct.signedPow(ct.subtract(ct.pow(yBgRef, APCA_BG_EXP_NORMAL), contrastDelta), APCA_NORMAL_INV_EXP),
	aboveSmoothThreshold,
)

export const reversePolarity: CalcExpression<'yBg' | 'contrastMagnitude'> = ct.lerp(
	ct.lerp(
		yBgRef,
		ct.pow(
			ct.add(ct.pow(yBgRef, APCA_BG_EXP_REVERSE), APCA_SMOOTH_THRESHOLD_OFFSET),
			APCA_REVERSE_INV_EXP,
		),
		smoothingBlend,
	),
	ct.pow(ct.add(ct.pow(yBgRef, APCA_BG_EXP_REVERSE), contrastDelta), APCA_REVERSE_INV_EXP),
	aboveSmoothThreshold,
)

const contrastMagnitude = ct.abs(contrastRef)
const contrastSign = ct.sign(contrastRef)
const contrastPreferLight = ct.max(0, contrastSign)
const contrastPreferDark = ct.max(0, ct.multiply(-1, contrastSign))
const contrastIsZero = ct.subtract(1, ct.max(contrastPreferLight, contrastPreferDark))

export const contrastSolver: CalcExpression<'yBg' | 'contrast'> = ct.clamp(
	0,
	ct.add(
		ct.multiply(contrastPreferLight, reversePolarity.bind({ contrastMagnitude })),
		ct.multiply(contrastPreferDark, normalPolarity.bind({ contrastMagnitude })),
		ct.multiply(contrastIsZero, yBgRef),
	),
	1,
)

/**
 * Measure achieved contrast for reverse polarity (light text on dark background).
 * Uses raw Y values (no soft clamp) so the measurement matches what the polarity
 * solver actually computes, preventing premature inversion decisions.
 *
 * Formula: max(0, 1.14 * (Y_fg^0.62 - Y_bg^0.65) - 0.027)
 */
export const contrastMeasurementReverse: CalcExpression<'yBg' | 'yFg'> = ct.max(
	0,
	ct.subtract(
		ct.multiply(
			APCA_SCALE,
			ct.subtract(
				ct.pow(yFgRef, APCA_FG_EXP_REVERSE),
				ct.pow(yBgRef, APCA_BG_EXP_REVERSE),
			),
		),
		APCA_OFFSET,
	),
)

/**
 * Measure achieved contrast for normal polarity (dark text on light background).
 * Uses raw Y values (no soft clamp) so the measurement matches what the polarity
 * solver actually computes, preventing premature inversion decisions.
 *
 * Formula: max(0, 1.14 * (Y_bg^0.56 - Y_fg^0.57) - 0.027)
 */
export const contrastMeasurementNormal: CalcExpression<'yBg' | 'yFg'> = ct.max(
	0,
	ct.subtract(
		ct.multiply(
			APCA_SCALE,
			ct.subtract(
				ct.pow(yBgRef, APCA_BG_EXP_NORMAL),
				ct.pow(yFgRef, APCA_FG_EXP_NORMAL),
			),
		),
		APCA_OFFSET,
	),
)

// --- Contrast solver with inversion ---

const belowInvertThreshold = ct.multiply(
	ct.max(0, ct.sign(ct.subtract(INVERSION_THRESHOLD, lcLightRef))),
	ct.max(0, ct.sign(ct.subtract(INVERSION_THRESHOLD, lcDarkRef))),
) // 1 if both below threshold

const lcDiff = ct.subtract(lcLightRef, lcDarkRef)

const outsideEpsilon = ct.subtract(
	1,
	ct.max(0, ct.sign(ct.subtract(COMPARISON_EPSILON, ct.abs(lcDiff)))),
)

// Only declare a winner if difference is outside epsilon
const lightWins = ct.multiply(outsideEpsilon, ct.max(0, ct.sign(lcDiff)))
const darkWins = ct.multiply(outsideEpsilon, ct.max(0, ct.sign(ct.multiply(-1, lcDiff))))
const isTie = ct.subtract(1, ct.max(lightWins, darkWins)) // 1 if within epsilon or equal

// In low contrast regime, use preference directly
// Otherwise, winner takes all with ties using preference
const useLightNormal = ct.max(lightWins, ct.multiply(isTie, contrastPreferLight))
const useDarkNormal = ct.max(darkWins, ct.multiply(isTie, contrastPreferDark))

/**
 * Contrast solver with automatic polarity inversion.
 *
 * Computes both polarity solutions, measures achieved contrast for each,
 * and selects the one that achieves higher absolute contrast.
 * The signed contrast input acts as a preference that breaks ties.
 *
 * At low contrast values (both < INVERSION_THRESHOLD), preference is used
 * directly because APCA formula asymmetry makes comparisons unreliable.
 *
 * Property chain:
 * - Y_light: clamped reverse polarity result (lighter)
 * - Y_dark: clamped normal polarity result (darker)
 * - Lc_light: achieved contrast for light solution
 * - Lc_dark: achieved contrast for dark solution
 * - Selection based on max(Lc_light, Lc_dark) with preference tie-breaking
 */
export const contrastSolverWithInversion: CalcExpression<
	'yBg' | 'contrast' | 'yLight' | 'yDark' | 'lcLight' | 'lcDark'
> = ct.add(
	ct.multiply(ct.lerp(useLightNormal, contrastPreferLight, belowInvertThreshold), yLightRef),
	ct.multiply(ct.lerp(useDarkNormal, contrastPreferDark, belowInvertThreshold), yDarkRef),
	ct.multiply(contrastIsZero, yBgRef),
)
