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

const yMinNormal = ct.signedPow(
	ct.subtract(ct.pow(ct.reference('yBg'), APCA_BG_EXP_NORMAL), APCA_SMOOTH_THRESHOLD_OFFSET),
	APCA_NORMAL_INV_EXP,
)

const yMinReverse = ct.pow(
	ct.add(ct.pow(ct.reference('yBg'), APCA_BG_EXP_REVERSE), APCA_SMOOTH_THRESHOLD_OFFSET),
	APCA_REVERSE_INV_EXP,
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
	return ct.add(ct.multiply(ct.subtract(1, isRight), leftHalf), ct.multiply(isRight, rightHalf))
}

export function solveNormalPolarity(yBg: number, x: number): number
export function solveNormalPolarity(): CalcExpression<'yBg' | 'x'>
export function solveNormalPolarity(
	yBg?: number,
	x?: number,
): number | CalcExpression<'yBg' | 'x'> {
	const yBgRef = ct.reference('yBg')
	const xRef = ct.reference('x')

	const directSolution = ct.signedPow(
		ct.subtract(
			ct.pow(yBgRef, APCA_BG_EXP_NORMAL),
			ct.divide(ct.add(xRef, APCA_OFFSET), APCA_SCALE),
		),
		APCA_NORMAL_INV_EXP,
	)

	const t = ct.min(ct.divide(xRef, APCA_SMOOTH_THRESHOLD), 1)
	const blend = ct.pow(ct.sin(ct.multiply(t, Math.PI / 2)), APCA_SMOOTH_POWER)
	const smoothSolution = ct.add(yBgRef, ct.multiply(ct.subtract(yMinNormal, yBgRef), blend))

	const aboveThreshold = ct.max(0, ct.sign(ct.subtract(xRef, APCA_SMOOTH_THRESHOLD)))
	const solver = ct.add(
		ct.multiply(aboveThreshold, directSolution),
		ct.multiply(ct.subtract(1, aboveThreshold), smoothSolution),
	)

	if (yBg === undefined || x === undefined) {
		return solver
	}

	return solver.toNumber({ yBg, x })
}

export function solveReversePolarity(yBg: number, x: number): number
export function solveReversePolarity(): CalcExpression<'yBg' | 'x'>
export function solveReversePolarity(
	yBg?: number,
	x?: number,
): number | CalcExpression<'yBg' | 'x'> {
	const yBgRef = ct.reference('yBg')
	const xRef = ct.reference('x')

	const term = ct.add(
		ct.pow(yBgRef, APCA_BG_EXP_REVERSE),
		ct.divide(ct.add(xRef, APCA_OFFSET), APCA_SCALE),
	)
	const directSolution = ct.pow(term, APCA_REVERSE_INV_EXP)

	const t = ct.min(ct.divide(xRef, APCA_SMOOTH_THRESHOLD), 1)
	const blend = ct.pow(ct.sin(ct.multiply(t, Math.PI / 2)), APCA_SMOOTH_POWER)
	const smoothSolution = ct.add(yBgRef, ct.multiply(ct.subtract(yMinReverse, yBgRef), blend))

	const aboveThreshold = ct.max(0, ct.sign(ct.subtract(xRef, APCA_SMOOTH_THRESHOLD)))
	const solver = ct.add(
		ct.multiply(aboveThreshold, directSolution),
		ct.multiply(ct.subtract(1, aboveThreshold), smoothSolution),
	)

	if (yBg === undefined || x === undefined) {
		return solver
	}

	return solver.toNumber({ yBg, x })
}

export function createContrastSolver(): CalcExpression<'yBg' | 'signedContrast' | 'contrastScale'> {
	const signedContrast = ct.reference('signedContrast')
	const yBg = ct.reference('yBg')
	const x = ct.divide(ct.abs(signedContrast), ct.reference('contrastScale'))

	const signVal = ct.sign(signedContrast)
	const preferLight = ct.max(0, signVal)
	const preferDark = ct.max(0, ct.multiply(-1, signVal))
	const isZero = ct.subtract(1, ct.max(preferLight, preferDark))

	return ct.clamp(
		0,
		ct.add(
			ct.add(
				ct.multiply(preferLight, solveReversePolarity().bind('x', x)),
				ct.multiply(preferDark, solveNormalPolarity().bind('x', x)),
			),
			ct.multiply(isZero, yBg),
		),
		1,
	)
}

/**
 * Measure achieved contrast for reverse polarity (light text on dark background).
 * Simplified APCA formula without low-contrast smoothing (only used for comparison).
 *
 * Formula: max(0, 1.14 * (Y_fg^0.62 - Y_bg^0.65) - 0.027)
 */
export function createContrastMeasurementReverse(): CalcExpression<'yBg' | 'yFg'> {
	const yBg = ct.reference('yBg')
	const yFg = ct.reference('yFg')

	return ct.max(
		0,
		ct.subtract(
			ct.multiply(
				APCA_SCALE,
				ct.subtract(ct.pow(yFg, APCA_FG_EXP_REVERSE), ct.pow(yBg, APCA_BG_EXP_REVERSE)),
			),
			APCA_OFFSET,
		),
	)
}

/**
 * Measure achieved contrast for normal polarity (dark text on light background).
 * Simplified APCA formula without low-contrast smoothing (only used for comparison).
 *
 * Formula: max(0, 1.14 * (Y_bg^0.56 - Y_fg^0.57) - 0.027)
 */
export function createContrastMeasurementNormal(): CalcExpression<'yBg' | 'yFg'> {
	const yBg = ct.reference('yBg')
	const yFg = ct.reference('yFg')

	return ct.max(
		0,
		ct.subtract(
			ct.multiply(
				APCA_SCALE,
				ct.subtract(ct.pow(yBg, APCA_BG_EXP_NORMAL), ct.pow(yFg, APCA_FG_EXP_NORMAL)),
			),
			APCA_OFFSET,
		),
	)
}

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
	'yBg' | 'signedContrast' | 'contrastScale' | 'yLight' | 'yDark' | 'lcLight' | 'lcDark'
> {
	const signedContrast = ct.reference('signedContrast')
	const yBg = ct.reference('yBg')

	// Pre-computed clamped Y values (passed as properties from generator)
	const yLight = ct.reference('yLight')
	const yDark = ct.reference('yDark')

	// Pre-computed achieved contrasts (passed as properties from generator)
	const lcLight = ct.reference('lcLight')
	const lcDark = ct.reference('lcDark')

	// Check if both contrasts are below threshold (low contrast regime)
	// In this regime, APCA asymmetry makes comparison unreliable, so use preference
	const lightBelowThreshold = ct.max(0, ct.sign(ct.subtract(INVERSION_THRESHOLD, lcLight))) // 1 if lcLight < threshold
	const darkBelowThreshold = ct.max(0, ct.sign(ct.subtract(INVERSION_THRESHOLD, lcDark))) // 1 if lcDark < threshold
	const bothBelowThreshold = ct.multiply(lightBelowThreshold, darkBelowThreshold) // 1 if both below threshold

	// Compare achieved contrasts (only meaningful when at least one is above threshold)
	// Use epsilon tolerance to avoid floating-point precision issues
	const lcDiff = ct.subtract(lcLight, lcDark)

	const outsideEpsilon = ct.subtract(
		1,
		ct.max(0, ct.sign(ct.subtract(COMPARISON_EPSILON, ct.abs(lcDiff)))),
	)

	// Only declare a winner if difference is outside epsilon
	const lightWinsRaw = ct.max(0, ct.sign(lcDiff)) // 1 if light > dark
	const darkWinsRaw = ct.max(0, ct.sign(ct.multiply(-1, lcDiff))) // 1 if dark > light
	const lightWins = ct.multiply(outsideEpsilon, lightWinsRaw) // Only wins if outside epsilon
	const darkWins = ct.multiply(outsideEpsilon, darkWinsRaw) // Only wins if outside epsilon
	const isTie = ct.subtract(1, ct.max(lightWins, darkWins)) // 1 if within epsilon or equal

	// Preference for tie-breaking (from signed contrast)
	const signVal = ct.sign(signedContrast)
	const preferLight = ct.max(0, signVal)
	const preferDark = ct.max(0, ct.multiply(-1, signVal))
	const isZero = ct.subtract(1, ct.max(preferLight, preferDark))

	// In low contrast regime, use preference directly
	// Otherwise, winner takes all with ties using preference
	const useLightNormal = ct.max(lightWins, ct.multiply(isTie, preferLight))
	const useDarkNormal = ct.max(darkWins, ct.multiply(isTie, preferDark))

	// Final selection: low contrast uses preference, normal uses comparison
	const aboveThreshold = ct.subtract(1, bothBelowThreshold)
	const useLight = ct.add(
		ct.multiply(bothBelowThreshold, preferLight),
		ct.multiply(aboveThreshold, useLightNormal),
	)
	const useDark = ct.add(
		ct.multiply(bothBelowThreshold, preferDark),
		ct.multiply(aboveThreshold, useDarkNormal),
	)

	// Result: selected Y + fallback to yBg for zero contrast
	return ct.add(
		ct.add(ct.multiply(useLight, yLight), ct.multiply(useDark, yDark)),
		ct.multiply(isZero, yBg),
	)
}
