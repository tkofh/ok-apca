import type { CalcExpression } from '@ok-apca/calc-tree'
import * as ct from '@ok-apca/calc-tree'
import type { GamutSlice } from './color.ts'
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

const xRef = ct.reference('x')
const yBgRef = ct.reference('yBg')
const yFgRef = ct.reference('yFg')

const yMinNormal = ct.signedPow(
	ct.subtract(ct.pow(yBgRef, APCA_BG_EXP_NORMAL), APCA_SMOOTH_THRESHOLD_OFFSET),
	APCA_NORMAL_INV_EXP,
)

const yMinReverse = ct.pow(
	ct.add(ct.pow(yBgRef, APCA_BG_EXP_REVERSE), APCA_SMOOTH_THRESHOLD_OFFSET),
	APCA_REVERSE_INV_EXP,
)

const contrastDelta = ct.divide(ct.add(xRef, APCA_OFFSET), APCA_SCALE)

const smoothingBlend = ct.pow(
	ct.sin(ct.multiply(ct.min(ct.divide(xRef, APCA_SMOOTH_THRESHOLD), 1), Math.PI / 2)),
	APCA_SMOOTH_POWER,
)

export function createMaxChromaExpr(slice: GamutSlice): CalcExpression<'lightness'> {
	const L = ct.reference('lightness')
	const apexL = slice.apex.lightness
	const apexC = slice.apex.chroma
	const curv = slice.curvature
	const oneMinusApexL = 1 - apexL

	const leftHalf = ct.divide(ct.multiply(apexC, L), apexL)

	const t = ct.max(0, ct.divide(ct.subtract(L, apexL), oneMinusApexL))
	const linearChroma = ct.divide(ct.multiply(apexC, ct.subtract(1, L)), oneMinusApexL)
	const correction = ct.multiply(
		ct.multiply(curv, ct.pow(ct.sin(ct.multiply(t, Math.PI)), GAMUT_SINE_CURVATURE_EXPONENT)),
		apexC,
	)
	const rightHalf = ct.add(linearChroma, correction)

	const isRight = ct.max(0, ct.sign(ct.subtract(L, apexL)))
	return ct.lerp(leftHalf, rightHalf, isRight)
}

const aboveThreshold = ct.max(0, ct.sign(ct.subtract(xRef, APCA_SMOOTH_THRESHOLD)))

export const normalPolarity: CalcExpression<'yBg' | 'x'> = ct.lerp(
	ct.lerp(yBgRef, yMinNormal, smoothingBlend),
	ct.signedPow(ct.subtract(ct.pow(yBgRef, APCA_BG_EXP_NORMAL), contrastDelta), APCA_NORMAL_INV_EXP),
	aboveThreshold,
)

export const reversePolarity: CalcExpression<'yBg' | 'x'> = ct.lerp(
	ct.lerp(yBgRef, yMinReverse, smoothingBlend),
	ct.pow(ct.add(ct.pow(yBgRef, APCA_BG_EXP_REVERSE), contrastDelta), APCA_REVERSE_INV_EXP),
	aboveThreshold,
)

const contrastRef = ct.reference('contrast')
const contrastMagnitude = ct.abs(contrastRef)
const contrastSign = ct.sign(contrastRef)
const contrastPreferLight = ct.max(0, contrastSign)
const contrastPreferDark = ct.max(0, ct.multiply(-1, contrastSign))
const contrastIsZero = ct.subtract(1, ct.max(contrastPreferLight, contrastPreferDark))

export const contrastSolver: CalcExpression<'yBg' | 'contrast'> = ct.clamp(
	0,
	ct.add(
		ct.multiply(contrastPreferLight, reversePolarity.bind({ x: contrastMagnitude })),
		ct.multiply(contrastPreferDark, normalPolarity.bind({ x: contrastMagnitude })),
		ct.multiply(contrastIsZero, yBgRef),
	),
	1,
)

/**
 * Measure achieved contrast for reverse polarity (light text on dark background).
 * Simplified APCA formula without low-contrast smoothing (only used for comparison).
 *
 * Formula: max(0, 1.14 * (Y_fg^0.62 - Y_bg^0.65) - 0.027)
 */
export const contrastMeasurementReverse: CalcExpression<'yBg' | 'yFg'> = ct.max(
	0,
	ct.subtract(
		ct.multiply(
			APCA_SCALE,
			ct.subtract(ct.pow(yFgRef, APCA_FG_EXP_REVERSE), ct.pow(yBgRef, APCA_BG_EXP_REVERSE)),
		),
		APCA_OFFSET,
	),
)

/**
 * Measure achieved contrast for normal polarity (dark text on light background).
 * Simplified APCA formula without low-contrast smoothing (only used for comparison).
 *
 * Formula: max(0, 1.14 * (Y_bg^0.56 - Y_fg^0.57) - 0.027)
 */
export const contrastMeasurementNormal: CalcExpression<'yBg' | 'yFg'> = ct.max(
	0,
	ct.subtract(
		ct.multiply(
			APCA_SCALE,
			ct.subtract(ct.pow(yBgRef, APCA_BG_EXP_NORMAL), ct.pow(yFgRef, APCA_FG_EXP_NORMAL)),
		),
		APCA_OFFSET,
	),
)

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
export function createContrastSolverWithInversion(): CalcExpression<
	'yBg' | 'contrast' | 'yLight' | 'yDark' | 'lcLight' | 'lcDark'
> {
	// Pre-computed clamped Y values (passed as properties from generator)
	const yLight = ct.reference('yLight')
	const yDark = ct.reference('yDark')

	// Pre-computed achieved contrasts (passed as properties from generator)
	const lcLight = ct.reference('lcLight')
	const lcDark = ct.reference('lcDark')

	// Check if both contrasts are below threshold (low contrast regime)
	// In this regime, APCA asymmetry makes comparison unreliable, so use preference
	const belowThreshold = ct.multiply(
		ct.max(0, ct.sign(ct.subtract(INVERSION_THRESHOLD, lcLight))),
		ct.max(0, ct.sign(ct.subtract(INVERSION_THRESHOLD, lcDark))),
	) // 1 if both below threshold

	// Compare achieved contrasts (only meaningful when at least one is above threshold)
	// Use epsilon tolerance to avoid floating-point precision issues
	const lcDiff = ct.subtract(lcLight, lcDark)

	const outsideEpsilon = ct.subtract(
		1,
		ct.max(0, ct.sign(ct.subtract(COMPARISON_EPSILON, ct.abs(lcDiff)))),
	)

	// Only declare a winner if difference is outside epsilon
	const lightWins = ct.multiply(outsideEpsilon, ct.max(0, ct.sign(lcDiff))) // Only wins if outside epsilon
	const darkWins = ct.multiply(outsideEpsilon, ct.max(0, ct.sign(ct.multiply(-1, lcDiff)))) // Only wins if outside epsilon
	const isTie = ct.subtract(1, ct.max(lightWins, darkWins)) // 1 if within epsilon or equal

	// Preference for tie-breaking (from signed contrast)
	const signVal = ct.sign(contrastRef)
	const preferLight = ct.max(0, signVal)
	const preferDark = ct.max(0, ct.multiply(-1, signVal))
	const isZero = ct.subtract(1, ct.max(preferLight, preferDark))

	// In low contrast regime, use preference directly
	// Otherwise, winner takes all with ties using preference
	const useLightNormal = ct.max(lightWins, ct.multiply(isTie, preferLight))
	const useDarkNormal = ct.max(darkWins, ct.multiply(isTie, preferDark))

	// Final selection: low contrast uses preference, normal uses comparison
	// Result: selected Y + fallback to yBg for zero contrast
	return ct.add(
		ct.multiply(ct.lerp(useLightNormal, preferLight, belowThreshold), yLight),
		ct.multiply(ct.lerp(useDarkNormal, preferDark, belowThreshold), yDark),
		ct.multiply(isZero, yBgRef),
	)
}
