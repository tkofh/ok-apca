/**
 * Expression trees for OKLCH gamut mapping and APCA contrast calculations.
 *
 * These expressions are the single source of truth for both:
 * - TypeScript runtime evaluation (when all refs bound to constants)
 * - CSS generation (when some refs bound to var() references)
 *
 * This eliminates the dual implementation problem and guarantees parity.
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

// =============================================================================
// Gamut Mapping Expressions
// =============================================================================

/**
 * Compute the maximum in-gamut chroma at a given lightness using the tent
 * function with sine-based curvature correction.
 *
 * The tent approximates the Display P3 gamut boundary as two linear segments:
 * - Left half (L ≤ apex.L): linear from origin to apex
 * - Right half (L > apex.L): linear with sine correction from apex to white
 *
 * References required:
 * - lightness: normalized lightness [0, 1]
 * - apexL: lightness at gamut apex
 * - apexChroma: chroma at gamut apex
 * - curvature: fitted curvature correction coefficient
 */
export function createMaxChromaExpr(): CalcExpression<
	'lightness' | 'apexL' | 'apexChroma' | 'curvature'
> {
	const L = reference('lightness')
	const apexL = reference('apexL')
	const apexC = reference('apexChroma')
	const curv = reference('curvature')

	// Left half: apexC * L / apexL
	const leftHalf = divide(multiply(apexC, L), apexL)

	// Right half: linear + sine correction
	// t = max(0, (L - apexL) / (1 - apexL))
	const oneMinusApexL = subtract(1, apexL)
	const t = max(0, divide(subtract(L, apexL), oneMinusApexL))

	// linearChroma = apexC * (1 - L) / (1 - apexL)
	const linearChroma = divide(multiply(apexC, subtract(1, L)), oneMinusApexL)

	// correction = curv * sin(t * π)^0.95 * apexC
	const correction = multiply(
		multiply(curv, power(sin(multiply(t, Math.PI)), GAMUT_SINE_CURVATURE_EXPONENT)),
		apexC,
	)
	const rightHalf = add(linearChroma, correction)

	// Select based on L <= apexL using sign trick:
	// isRight = max(0, sign(L - apexL))
	// When L <= apexL: sign <= 0, max gives 0
	// When L > apexL: sign > 0, max gives positive (clamped to 1 by multiplication)
	const isRight = max(0, sign(subtract(L, apexL)))
	const isLeft = subtract(1, isRight)

	// result = isLeft * leftHalf + isRight * rightHalf
	return add(multiply(isLeft, leftHalf), multiply(isRight, rightHalf))
}

// =============================================================================
// APCA Solver Expressions
// =============================================================================

/**
 * Compute Y_min for normal polarity at the smoothing threshold.
 * This is the target Y value when contrast equals APCA_SMOOTH_THRESHOLD.
 *
 * Formula: signedPow(Ybg^0.56 - thresholdOffset, 1/0.57)
 */
function createYMinNormal(): CalcExpression<'yBg'> {
	const yBg = reference('yBg')

	const term = subtract(power(yBg, APCA_BG_EXP_NORMAL), APCA_SMOOTH_THRESHOLD_OFFSET)

	// signedPow: pow(abs(x), exp) * sign(x)
	return multiply(power(abs(term), APCA_NORMAL_INV_EXP), sign(term))
}

/**
 * Compute Y_min for reverse polarity at the smoothing threshold.
 * This is the target Y value when contrast equals APCA_SMOOTH_THRESHOLD.
 *
 * Formula: (Ybg^0.65 + thresholdOffset)^(1/0.62)
 */
function createYMinReverse(): CalcExpression<'yBg'> {
	const yBg = reference('yBg')

	const term = add(power(yBg, APCA_BG_EXP_REVERSE), APCA_SMOOTH_THRESHOLD_OFFSET)

	return power(term, APCA_REVERSE_INV_EXP)
}

/**
 * Solve for target Y using normal polarity (darker contrast color).
 *
 * APCA formula: Lc = 1.14 * (Ybg^0.56 - Yfg^0.57) - 0.027
 * Solving for Yfg: Yfg = signedPow(Ybg^0.56 - (Lc + 0.027)/1.14, 1/0.57)
 *
 * For low contrast (x < threshold), uses sine-based smoothing to avoid
 * discontinuities.
 *
 * References:
 * - yBg: background luminance [0, 1]
 * - x: normalized contrast magnitude |Lc|/100
 */
export function createNormalPolaritySolver(): CalcExpression<'yBg' | 'x'> {
	const yBg = reference('yBg')
	const x = reference('x')

	// Direct solution for x >= threshold:
	// term = Ybg^0.56 - (x + 0.027)/1.14
	// targetY = signedPow(term, 1/0.57)
	const term = subtract(power(yBg, APCA_BG_EXP_NORMAL), divide(add(x, APCA_OFFSET), APCA_SCALE))
	const directSolution = multiply(power(abs(term), APCA_NORMAL_INV_EXP), sign(term))

	// Sine-based smoothing for x < threshold:
	// t = x / threshold
	// blend = sin(t * π/2)^2.46
	// smoothY = Ybg + (Ymin - Ybg) * blend
	const yMin = createYMinNormal()
	const t = min(divide(x, APCA_SMOOTH_THRESHOLD), 1)
	const blend = power(sin(multiply(t, Math.PI / 2)), APCA_SMOOTH_POWER)
	const smoothSolution = add(yBg, multiply(subtract(yMin, yBg), blend))

	// Select based on threshold:
	// aboveThreshold = max(0, sign(x - threshold))
	// When x > threshold: sign = 1, max = 1
	// When x = threshold: sign = 0, max = 0 (edge case - use smooth)
	// When x < threshold: sign = -1, max = 0
	const aboveThreshold = max(0, sign(subtract(x, APCA_SMOOTH_THRESHOLD)))

	return add(
		multiply(aboveThreshold, directSolution),
		multiply(subtract(1, aboveThreshold), smoothSolution),
	)
}

/**
 * Solve for target Y using reverse polarity (lighter contrast color).
 *
 * APCA formula: Lc = 1.14 * (Yfg^0.62 - Ybg^0.65) - 0.027
 * Solving for Yfg: Yfg = (Ybg^0.65 + (Lc + 0.027)/1.14)^(1/0.62)
 *
 * For low contrast (x < threshold), uses sine-based smoothing.
 *
 * References:
 * - yBg: background luminance [0, 1]
 * - x: normalized contrast magnitude |Lc|/100
 */
export function createReversePolaritySolver(): CalcExpression<'yBg' | 'x'> {
	const yBg = reference('yBg')
	const x = reference('x')

	// Direct solution for x >= threshold:
	// term = Ybg^0.65 + (x + 0.027)/1.14
	// targetY = term^(1/0.62)
	const term = add(power(yBg, APCA_BG_EXP_REVERSE), divide(add(x, APCA_OFFSET), APCA_SCALE))
	const directSolution = power(term, APCA_REVERSE_INV_EXP)

	// Sine-based smoothing for x < threshold
	const yMin = createYMinReverse()
	const t = min(divide(x, APCA_SMOOTH_THRESHOLD), 1)
	const blend = power(sin(multiply(t, Math.PI / 2)), APCA_SMOOTH_POWER)
	const smoothSolution = add(yBg, multiply(subtract(yMin, yBg), blend))

	// Select based on threshold
	const aboveThreshold = max(0, sign(subtract(x, APCA_SMOOTH_THRESHOLD)))

	return add(
		multiply(aboveThreshold, directSolution),
		multiply(subtract(1, aboveThreshold), smoothSolution),
	)
}

/**
 * Solve for target Y given signed contrast value.
 *
 * Positive contrast = lighter foreground (use reverse polarity)
 * Negative contrast = darker foreground (use normal polarity)
 *
 * The result is clamped to [0, 1].
 *
 * References:
 * - yBg: background luminance [0, 1]
 * - signedContrast: signed APCA Lc value [-108, 108] (or normalized [-1.08, 1.08])
 * - contrastScale: 100 for percentage input, 1 for normalized input
 */
export function createContrastSolver(): CalcExpression<'yBg' | 'signedContrast' | 'contrastScale'> {
	const signedContrast = reference('signedContrast')
	const contrastScale = reference('contrastScale')
	const yBg = reference('yBg')

	// x = |signedContrast| / scale
	const x = divide(abs(signedContrast), contrastScale)

	// Bind x into both solvers
	const normalExpr = createNormalPolaritySolver().bind('x', x)
	const reverseExpr = createReversePolaritySolver().bind('x', x)

	// Polarity selection using sign:
	// When signedContrast > 0: sign = 1, preferLight = 1, preferDark = 0
	// When signedContrast < 0: sign = -1, preferLight = 0, preferDark = 1
	// When signedContrast = 0: sign = 0, preferLight = 0, preferDark = 0
	//
	// For the zero case, we want to return yBg (no change).
	// We detect this with: isZero = 1 - max(preferLight, preferDark)
	const signVal = sign(signedContrast)
	const preferLight = max(0, signVal)
	const preferDark = max(0, multiply(-1, signVal))
	const isZero = subtract(1, max(preferLight, preferDark))

	// Combine: preferLight * reverse + preferDark * normal + isZero * yBg
	const unclamped = add(
		add(multiply(preferLight, reverseExpr), multiply(preferDark, normalExpr)),
		multiply(isZero, yBg),
	)

	// Clamp to [0, 1]
	return clamp(0, unclamped, 1)
}

// =============================================================================
// Lightness/Luminance Conversion
// =============================================================================

/**
 * Convert OKLCH lightness to approximate luminance (Y).
 *
 * Uses the simplified formula Y = L³ which ignores chroma's contribution.
 * This is intentional to match CSS generator behavior, as CSS calc() cannot
 * access the full color conversion pipeline.
 */
export function createYFromLightness(): CalcExpression<'lightness'> {
	return power(reference('lightness'), 3)
}

/**
 * Convert luminance (Y) back to OKLCH lightness.
 *
 * Formula: L = Y^(1/3)
 */
export function createLightnessFromY(): CalcExpression<'y'> {
	return power(reference('y'), 1 / 3)
}
