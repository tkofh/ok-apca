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
	constant,
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
	const pi = constant(Math.PI)
	const sinExp = constant(GAMUT_SINE_CURVATURE_EXPONENT)
	const one = constant(1)
	const zero = constant(0)

	// Left half: apexC * L / apexL
	const leftHalf = divide(multiply(apexC, L), apexL)

	// Right half: linear + sine correction
	// t = max(0, (L - apexL) / (1 - apexL))
	const oneMinusApexL = subtract(one, apexL)
	const t = max(zero, divide(subtract(L, apexL), oneMinusApexL))

	// linearChroma = apexC * (1 - L) / (1 - apexL)
	const linearChroma = divide(multiply(apexC, subtract(one, L)), oneMinusApexL)

	// correction = curv * sin(t * π)^0.95 * apexC
	const correction = multiply(multiply(curv, power(sin(multiply(t, pi)), sinExp)), apexC)
	const rightHalf = add(linearChroma, correction)

	// Select based on L <= apexL using sign trick:
	// isRight = max(0, sign(L - apexL))
	// When L <= apexL: sign <= 0, max gives 0
	// When L > apexL: sign > 0, max gives positive (clamped to 1 by multiplication)
	const isRight = max(zero, sign(subtract(L, apexL)))
	const isLeft = subtract(one, isRight)

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
	const YBG = reference('yBg')

	const term = subtract(
		power(YBG, constant(APCA_BG_EXP_NORMAL)),
		constant(APCA_SMOOTH_THRESHOLD_OFFSET),
	)

	// signedPow: pow(abs(x), exp) * sign(x)
	return multiply(power(abs(term), constant(APCA_NORMAL_INV_EXP)), sign(term))
}

/**
 * Compute Y_min for reverse polarity at the smoothing threshold.
 * This is the target Y value when contrast equals APCA_SMOOTH_THRESHOLD.
 *
 * Formula: (Ybg^0.65 + thresholdOffset)^(1/0.62)
 */
function createYMinReverse(): CalcExpression<'yBg'> {
	const YBG = reference('yBg')

	const term = add(
		power(YBG, constant(APCA_BG_EXP_REVERSE)),
		constant(APCA_SMOOTH_THRESHOLD_OFFSET),
	)

	return power(term, constant(APCA_REVERSE_INV_EXP))
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
 * - Ybg: background luminance [0, 1]
 * - x: normalized contrast magnitude |Lc|/100
 */
export function createNormalPolaritySolver(): CalcExpression<'yBg' | 'x'> {
	const YBG = reference('yBg')
	const x = reference('x')
	const one = constant(1)
	const zero = constant(0)

	// Direct solution for x >= threshold:
	// term = Ybg^0.56 - (x + 0.027)/1.14
	// targetY = signedPow(term, 1/0.57)
	const term = subtract(
		power(YBG, constant(APCA_BG_EXP_NORMAL)),
		divide(add(x, constant(APCA_OFFSET)), constant(APCA_SCALE)),
	)
	const directSolution = multiply(power(abs(term), constant(APCA_NORMAL_INV_EXP)), sign(term))

	// Sine-based smoothing for x < threshold:
	// t = x / threshold
	// blend = sin(t * π/2)^2.46
	// smoothY = Ybg + (Ymin - Ybg) * blend
	const YMIN = createYMinNormal()
	const t = min(divide(x, constant(APCA_SMOOTH_THRESHOLD)), one)
	const blend = power(sin(multiply(t, constant(Math.PI / 2))), constant(APCA_SMOOTH_POWER))
	const smoothSolution = add(YBG, multiply(subtract(YMIN, YBG), blend))

	// Select based on threshold:
	// aboveThreshold = min(1, sign(x - threshold) + 1)
	// When x >= threshold: sign >= 0, +1 gives >= 1, min gives 1
	// When x < threshold: sign < 0, +1 gives < 1, min gives that value (but we want 0)
	// Better: max(0, sign(x - threshold))
	// When x > threshold: sign = 1, max = 1
	// When x = threshold: sign = 0, max = 0 (edge case - use smooth)
	// When x < threshold: sign = -1, max = 0
	const aboveThreshold = max(zero, sign(subtract(x, constant(APCA_SMOOTH_THRESHOLD))))

	return add(
		multiply(aboveThreshold, directSolution),
		multiply(subtract(one, aboveThreshold), smoothSolution),
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
 * - Ybg: background luminance [0, 1]
 * - x: normalized contrast magnitude |Lc|/100
 */
export function createReversePolaritySolver(): CalcExpression<'yBg' | 'x'> {
	const YBG = reference('yBg')
	const x = reference('x')
	const one = constant(1)
	const zero = constant(0)

	// Direct solution for x >= threshold:
	// term = Ybg^0.65 + (x + 0.027)/1.14
	// targetY = term^(1/0.62)
	const term = add(
		power(YBG, constant(APCA_BG_EXP_REVERSE)),
		divide(add(x, constant(APCA_OFFSET)), constant(APCA_SCALE)),
	)
	const directSolution = power(term, constant(APCA_REVERSE_INV_EXP))

	// Sine-based smoothing for x < threshold
	const YMIN = createYMinReverse()
	const t = min(divide(x, constant(APCA_SMOOTH_THRESHOLD)), one)
	const blend = power(sin(multiply(t, constant(Math.PI / 2))), constant(APCA_SMOOTH_POWER))
	const smoothSolution = add(YBG, multiply(subtract(YMIN, YBG), blend))

	// Select based on threshold
	const aboveThreshold = max(zero, sign(subtract(x, constant(APCA_SMOOTH_THRESHOLD))))

	return add(
		multiply(aboveThreshold, directSolution),
		multiply(subtract(one, aboveThreshold), smoothSolution),
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
 * - Ybg: background luminance [0, 1]
 * - signedContrast: signed APCA Lc value [-108, 108] (or normalized [-1.08, 1.08])
 * - contrastScale: 100 for percentage input, 1 for normalized input
 */
export function createContrastSolver(): CalcExpression<'yBg' | 'signedContrast' | 'contrastScale'> {
	const signedContrast = reference('signedContrast')
	const contrastScale = reference('contrastScale')
	const YBG = reference('yBg')
	const one = constant(1)
	const zero = constant(0)

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
	// For the zero case, we want to return Ybg (no change).
	// We detect this with: isZero = 1 - max(preferLight, preferDark)
	const signVal = sign(signedContrast)
	const preferLight = max(zero, signVal)
	const preferDark = max(zero, multiply(constant(-1), signVal))
	const isZero = subtract(one, max(preferLight, preferDark))

	// Combine: preferLight * reverse + preferDark * normal + isZero * Ybg
	const unclamped = add(
		add(multiply(preferLight, reverseExpr), multiply(preferDark, normalExpr)),
		multiply(isZero, YBG),
	)

	// Clamp to [0, 1]
	return clamp(zero, unclamped, one)
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
	return power(reference('lightness'), constant(3))
}

/**
 * Convert luminance (Y) back to OKLCH lightness.
 *
 * Formula: L = Y^(1/3)
 */
export function createLightnessFromY(): CalcExpression<'y'> {
	return power(reference('y'), constant(1 / 3))
}
