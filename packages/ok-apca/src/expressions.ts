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
	GAMUT_SINE_CURVATURE_EXPONENT,
} from './constants.ts'
import type { GamutSlice } from './types.ts'

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
		ct.multiply(curv, ct.power(ct.sin(ct.multiply(t, Math.PI)), GAMUT_SINE_CURVATURE_EXPONENT)),
		apexC,
	)
	const rightHalf = ct.add(linearChroma, correction)

	const isRight = ct.max(0, ct.sign(ct.subtract(L, apexL)))
	return ct.add(ct.multiply(ct.subtract(1, isRight), leftHalf), ct.multiply(isRight, rightHalf))
}

function createYMinNormal(): CalcExpression<'yBg'> {
	const term = ct.subtract(
		ct.power(ct.reference('yBg'), APCA_BG_EXP_NORMAL),
		APCA_SMOOTH_THRESHOLD_OFFSET,
	)
	return ct.multiply(ct.power(ct.abs(term), APCA_NORMAL_INV_EXP), ct.sign(term))
}

function createYMinReverse(): CalcExpression<'yBg'> {
	const term = ct.add(
		ct.power(ct.reference('yBg'), APCA_BG_EXP_REVERSE),
		APCA_SMOOTH_THRESHOLD_OFFSET,
	)
	return ct.power(term, APCA_REVERSE_INV_EXP)
}

export function createNormalPolaritySolver(): CalcExpression<'yBg' | 'x'> {
	const yBg = ct.reference('yBg')
	const x = ct.reference('x')

	const term = ct.subtract(
		ct.power(yBg, APCA_BG_EXP_NORMAL),
		ct.divide(ct.add(x, APCA_OFFSET), APCA_SCALE),
	)
	const directSolution = ct.multiply(ct.power(ct.abs(term), APCA_NORMAL_INV_EXP), ct.sign(term))

	const t = ct.min(ct.divide(x, APCA_SMOOTH_THRESHOLD), 1)
	const blend = ct.power(ct.sin(ct.multiply(t, Math.PI / 2)), APCA_SMOOTH_POWER)
	const smoothSolution = ct.add(yBg, ct.multiply(ct.subtract(createYMinNormal(), yBg), blend))

	const aboveThreshold = ct.max(0, ct.sign(ct.subtract(x, APCA_SMOOTH_THRESHOLD)))
	return ct.add(
		ct.multiply(aboveThreshold, directSolution),
		ct.multiply(ct.subtract(1, aboveThreshold), smoothSolution),
	)
}

export function createReversePolaritySolver(): CalcExpression<'yBg' | 'x'> {
	const yBg = ct.reference('yBg')
	const x = ct.reference('x')

	const term = ct.add(
		ct.power(yBg, APCA_BG_EXP_REVERSE),
		ct.divide(ct.add(x, APCA_OFFSET), APCA_SCALE),
	)
	const directSolution = ct.power(term, APCA_REVERSE_INV_EXP)

	const t = ct.min(ct.divide(x, APCA_SMOOTH_THRESHOLD), 1)
	const blend = ct.power(ct.sin(ct.multiply(t, Math.PI / 2)), APCA_SMOOTH_POWER)
	const smoothSolution = ct.add(yBg, ct.multiply(ct.subtract(createYMinReverse(), yBg), blend))

	const aboveThreshold = ct.max(0, ct.sign(ct.subtract(x, APCA_SMOOTH_THRESHOLD)))
	return ct.add(
		ct.multiply(aboveThreshold, directSolution),
		ct.multiply(ct.subtract(1, aboveThreshold), smoothSolution),
	)
}

export function createContrastSolver(): CalcExpression<'yBg' | 'signedContrast' | 'contrastScale'> {
	const signedContrast = ct.reference('signedContrast')
	const yBg = ct.reference('yBg')
	const x = ct.divide(ct.abs(signedContrast), ct.reference('contrastScale'))

	const normalExpr = createNormalPolaritySolver().bind('x', x)
	const reverseExpr = createReversePolaritySolver().bind('x', x)

	const signVal = ct.sign(signedContrast)
	const preferLight = ct.max(0, signVal)
	const preferDark = ct.max(0, ct.multiply(-1, signVal))
	const isZero = ct.subtract(1, ct.max(preferLight, preferDark))

	return ct.clamp(
		0,
		ct.add(
			ct.add(ct.multiply(preferLight, reverseExpr), ct.multiply(preferDark, normalExpr)),
			ct.multiply(isZero, yBg),
		),
		1,
	)
}

export function createYFromLightness(): CalcExpression<'lightness'> {
	return ct.power(ct.reference('lightness'), 3)
}

export function createLightnessFromY() {
	return ct.power(ct.reference('y'), 1 / 3)
}

export function clamp(minimum: number, value: number, maximum: number): number {
	return ct.clamp(minimum, value, maximum).toNumber()
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
				ct.subtract(ct.power(yFg, APCA_FG_EXP_REVERSE), ct.power(yBg, APCA_BG_EXP_REVERSE)),
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
				ct.subtract(ct.power(yBg, APCA_BG_EXP_NORMAL), ct.power(yFg, APCA_FG_EXP_NORMAL)),
			),
			APCA_OFFSET,
		),
	)
}

/**
 * Minimum contrast threshold for inversion consideration.
 * Below this threshold, we respect the user's polarity preference
 * rather than trying to maximize contrast, because the APCA formula
 * has inherent asymmetry that makes very low contrast comparisons unreliable.
 */
const INVERSION_THRESHOLD = 0.08 // ~8 Lc

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
	const lcDiff = ct.subtract(lcLight, lcDark)
	const lightWins = ct.max(0, ct.sign(lcDiff)) // 1 if light achieves more
	const darkWins = ct.max(0, ct.sign(ct.multiply(-1, lcDiff))) // 1 if dark achieves more
	const isTie = ct.subtract(1, ct.max(lightWins, darkWins)) // 1 if equal

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

/**
 * Create expression for the raw (unclamped) reverse polarity solution.
 * Used to compute Y_light before clamping.
 */
export function createRawReverseSolution(): CalcExpression<'yBg' | 'x'> {
	return createReversePolaritySolver()
}

/**
 * Create expression for the raw (unclamped) normal polarity solution.
 * Used to compute Y_dark before clamping.
 */
export function createRawNormalSolution(): CalcExpression<'yBg' | 'x'> {
	return createNormalPolaritySolver()
}
