/**
 * Expression trees for OKLCH gamut mapping and APCA contrast calculations.
 * Single source of truth for both JS evaluation and CSS generation.
 */

import type { CalcExpression } from '@ok-apca/calc-tree'
import * as ct from '@ok-apca/calc-tree'
import {
	APCA_BG_EXP_NORMAL,
	APCA_BG_EXP_REVERSE,
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

/**
 * Max in-gamut chroma using tent function with sine-based curvature correction.
 * Left half (L ≤ apex): linear from origin to apex
 * Right half (L > apex): linear with sine correction from apex to white
 */
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

	// Select via sign: isRight = max(0, sign(L - apexL))
	const isRight = ct.max(0, ct.sign(ct.subtract(L, apexL)))
	return ct.add(ct.multiply(ct.subtract(1, isRight), leftHalf), ct.multiply(isRight, rightHalf))
}

/**
 * Y_min for normal polarity at smoothing threshold.
 * Formula: signedPow(Ybg^0.56 - thresholdOffset, 1/0.57)
 */
function createYMinNormal(): CalcExpression<'yBg'> {
	const term = ct.subtract(
		ct.power(ct.reference('yBg'), APCA_BG_EXP_NORMAL),
		APCA_SMOOTH_THRESHOLD_OFFSET,
	)
	return ct.multiply(ct.power(ct.abs(term), APCA_NORMAL_INV_EXP), ct.sign(term))
}

/**
 * Y_min for reverse polarity at smoothing threshold.
 * Formula: (Ybg^0.65 + thresholdOffset)^(1/0.62)
 */
function createYMinReverse(): CalcExpression<'yBg'> {
	const term = ct.add(
		ct.power(ct.reference('yBg'), APCA_BG_EXP_REVERSE),
		APCA_SMOOTH_THRESHOLD_OFFSET,
	)
	return ct.power(term, APCA_REVERSE_INV_EXP)
}

/**
 * Solve for target Y using normal polarity (darker foreground).
 * Uses sine-based smoothing for low contrast values.
 */
export function createNormalPolaritySolver(): CalcExpression<'yBg' | 'x'> {
	const yBg = ct.reference('yBg')
	const x = ct.reference('x')

	// Direct: Yfg = signedPow(Ybg^0.56 - (x + 0.027)/1.14, 1/0.57)
	const term = ct.subtract(
		ct.power(yBg, APCA_BG_EXP_NORMAL),
		ct.divide(ct.add(x, APCA_OFFSET), APCA_SCALE),
	)
	const directSolution = ct.multiply(ct.power(ct.abs(term), APCA_NORMAL_INV_EXP), ct.sign(term))

	// Smooth: blend from yBg to yMin using sin(t * π/2)^2.46
	const t = ct.min(ct.divide(x, APCA_SMOOTH_THRESHOLD), 1)
	const blend = ct.power(ct.sin(ct.multiply(t, Math.PI / 2)), APCA_SMOOTH_POWER)
	const smoothSolution = ct.add(yBg, ct.multiply(ct.subtract(createYMinNormal(), yBg), blend))

	const aboveThreshold = ct.max(0, ct.sign(ct.subtract(x, APCA_SMOOTH_THRESHOLD)))
	return ct.add(
		ct.multiply(aboveThreshold, directSolution),
		ct.multiply(ct.subtract(1, aboveThreshold), smoothSolution),
	)
}

/**
 * Solve for target Y using reverse polarity (lighter foreground).
 * Uses sine-based smoothing for low contrast values.
 */
export function createReversePolaritySolver(): CalcExpression<'yBg' | 'x'> {
	const yBg = ct.reference('yBg')
	const x = ct.reference('x')

	// Direct: Yfg = (Ybg^0.65 + (x + 0.027)/1.14)^(1/0.62)
	const term = ct.add(
		ct.power(yBg, APCA_BG_EXP_REVERSE),
		ct.divide(ct.add(x, APCA_OFFSET), APCA_SCALE),
	)
	const directSolution = ct.power(term, APCA_REVERSE_INV_EXP)

	// Smooth: blend from yBg to yMin
	const t = ct.min(ct.divide(x, APCA_SMOOTH_THRESHOLD), 1)
	const blend = ct.power(ct.sin(ct.multiply(t, Math.PI / 2)), APCA_SMOOTH_POWER)
	const smoothSolution = ct.add(yBg, ct.multiply(ct.subtract(createYMinReverse(), yBg), blend))

	const aboveThreshold = ct.max(0, ct.sign(ct.subtract(x, APCA_SMOOTH_THRESHOLD)))
	return ct.add(
		ct.multiply(aboveThreshold, directSolution),
		ct.multiply(ct.subtract(1, aboveThreshold), smoothSolution),
	)
}

/**
 * Solve for target Y given signed contrast.
 * Positive = lighter foreground (reverse), negative = darker (normal).
 * Result clamped to [0, 1].
 */
export function createContrastSolver(): CalcExpression<'yBg' | 'signedContrast' | 'contrastScale'> {
	const signedContrast = ct.reference('signedContrast')
	const yBg = ct.reference('yBg')
	const x = ct.divide(ct.abs(signedContrast), ct.reference('contrastScale'))

	const normalExpr = createNormalPolaritySolver().bind('x', x)
	const reverseExpr = createReversePolaritySolver().bind('x', x)

	// Polarity selection: preferLight when > 0, preferDark when < 0, yBg when = 0
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

/** Convert OKLCH lightness to luminance: Y = L³ */
export function createYFromLightness(): CalcExpression<'lightness'> {
	return ct.power(ct.reference('lightness'), 3)
}

/** Convert luminance to OKLCH lightness: L = Y^(1/3) */
export function createLightnessFromY() {
	return ct.power(ct.reference('y'), 1 / 3)
}

/**
 * Clamp a numeric value to a range.
 */
export function clamp(minimum: number, value: number, maximum: number): number {
	return ct.clamp(minimum, value, maximum).toNumber()
}
