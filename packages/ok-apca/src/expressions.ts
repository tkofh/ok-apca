/**
 * Expression trees for OKLCH gamut mapping and APCA contrast calculations.
 * Single source of truth for both JS evaluation and CSS generation.
 */

import {
	abs,
	add,
	type CalcExpression,
	clamp,
	divide,
	max,
	min,
	multiply,
	power,
	reference,
	sign,
	sin,
	subtract,
} from '@ok-apca/calc-tree'
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
	const L = reference('lightness')
	const apexL = slice.apex.lightness
	const apexC = slice.apex.chroma
	const curv = slice.curvature
	const oneMinusApexL = 1 - apexL

	const leftHalf = divide(multiply(apexC, L), apexL)

	const t = max(0, divide(subtract(L, apexL), oneMinusApexL))
	const linearChroma = divide(multiply(apexC, subtract(1, L)), oneMinusApexL)
	const correction = multiply(
		multiply(curv, power(sin(multiply(t, Math.PI)), GAMUT_SINE_CURVATURE_EXPONENT)),
		apexC,
	)
	const rightHalf = add(linearChroma, correction)

	// Select via sign: isRight = max(0, sign(L - apexL))
	const isRight = max(0, sign(subtract(L, apexL)))
	return add(multiply(subtract(1, isRight), leftHalf), multiply(isRight, rightHalf))
}

/**
 * Y_min for normal polarity at smoothing threshold.
 * Formula: signedPow(Ybg^0.56 - thresholdOffset, 1/0.57)
 */
function createYMinNormal(): CalcExpression<'yBg'> {
	const term = subtract(power(reference('yBg'), APCA_BG_EXP_NORMAL), APCA_SMOOTH_THRESHOLD_OFFSET)
	return multiply(power(abs(term), APCA_NORMAL_INV_EXP), sign(term))
}

/**
 * Y_min for reverse polarity at smoothing threshold.
 * Formula: (Ybg^0.65 + thresholdOffset)^(1/0.62)
 */
function createYMinReverse(): CalcExpression<'yBg'> {
	const term = add(power(reference('yBg'), APCA_BG_EXP_REVERSE), APCA_SMOOTH_THRESHOLD_OFFSET)
	return power(term, APCA_REVERSE_INV_EXP)
}

/**
 * Solve for target Y using normal polarity (darker foreground).
 * Uses sine-based smoothing for low contrast values.
 */
export function createNormalPolaritySolver(): CalcExpression<'yBg' | 'x'> {
	const yBg = reference('yBg')
	const x = reference('x')

	// Direct: Yfg = signedPow(Ybg^0.56 - (x + 0.027)/1.14, 1/0.57)
	const term = subtract(power(yBg, APCA_BG_EXP_NORMAL), divide(add(x, APCA_OFFSET), APCA_SCALE))
	const directSolution = multiply(power(abs(term), APCA_NORMAL_INV_EXP), sign(term))

	// Smooth: blend from yBg to yMin using sin(t * π/2)^2.46
	const t = min(divide(x, APCA_SMOOTH_THRESHOLD), 1)
	const blend = power(sin(multiply(t, Math.PI / 2)), APCA_SMOOTH_POWER)
	const smoothSolution = add(yBg, multiply(subtract(createYMinNormal(), yBg), blend))

	const aboveThreshold = max(0, sign(subtract(x, APCA_SMOOTH_THRESHOLD)))
	return add(
		multiply(aboveThreshold, directSolution),
		multiply(subtract(1, aboveThreshold), smoothSolution),
	)
}

/**
 * Solve for target Y using reverse polarity (lighter foreground).
 * Uses sine-based smoothing for low contrast values.
 */
export function createReversePolaritySolver(): CalcExpression<'yBg' | 'x'> {
	const yBg = reference('yBg')
	const x = reference('x')

	// Direct: Yfg = (Ybg^0.65 + (x + 0.027)/1.14)^(1/0.62)
	const term = add(power(yBg, APCA_BG_EXP_REVERSE), divide(add(x, APCA_OFFSET), APCA_SCALE))
	const directSolution = power(term, APCA_REVERSE_INV_EXP)

	// Smooth: blend from yBg to yMin
	const t = min(divide(x, APCA_SMOOTH_THRESHOLD), 1)
	const blend = power(sin(multiply(t, Math.PI / 2)), APCA_SMOOTH_POWER)
	const smoothSolution = add(yBg, multiply(subtract(createYMinReverse(), yBg), blend))

	const aboveThreshold = max(0, sign(subtract(x, APCA_SMOOTH_THRESHOLD)))
	return add(
		multiply(aboveThreshold, directSolution),
		multiply(subtract(1, aboveThreshold), smoothSolution),
	)
}

/**
 * Solve for target Y given signed contrast.
 * Positive = lighter foreground (reverse), negative = darker (normal).
 * Result clamped to [0, 1].
 */
export function createContrastSolver(): CalcExpression<'yBg' | 'signedContrast' | 'contrastScale'> {
	const signedContrast = reference('signedContrast')
	const yBg = reference('yBg')
	const x = divide(abs(signedContrast), reference('contrastScale'))

	const normalExpr = createNormalPolaritySolver().bind('x', x)
	const reverseExpr = createReversePolaritySolver().bind('x', x)

	// Polarity selection: preferLight when > 0, preferDark when < 0, yBg when = 0
	const signVal = sign(signedContrast)
	const preferLight = max(0, signVal)
	const preferDark = max(0, multiply(-1, signVal))
	const isZero = subtract(1, max(preferLight, preferDark))

	return clamp(
		0,
		add(
			add(multiply(preferLight, reverseExpr), multiply(preferDark, normalExpr)),
			multiply(isZero, yBg),
		),
		1,
	)
}

/** Convert OKLCH lightness to luminance: Y = L³ */
export function createYFromLightness(): CalcExpression<'lightness'> {
	return power(reference('lightness'), 3)
}

/** Convert luminance to OKLCH lightness: L = Y^(1/3) */
export function createLightnessFromY() {
	return power(reference('y'), 1 / 3)
}

/**
 * Clamp a numeric value to a range.
 * Uses calc-tree's clamp for consistency with CSS generation.
 */
export function clampNumeric(minimum: number, value: number, maximum: number): number {
	return clamp(minimum, value, maximum).toNumber()
}
