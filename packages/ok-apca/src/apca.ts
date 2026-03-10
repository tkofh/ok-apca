import type { CalcExpression, ExpressionInput } from '@ok-apca/calc-tree'
import * as ct from '@ok-apca/calc-tree'
import {
	APCA_BG_EXP_NORMAL,
	APCA_BG_EXP_REVERSE,
	APCA_BLACK_CLAMP,
	APCA_FG_EXP_NORMAL,
	APCA_FG_EXP_REVERSE,
	APCA_NORMAL_INV_EXP,
	APCA_OFFSET,
	APCA_REVERSE_INV_EXP,
	APCA_SCALE,
	APCA_SMOOTH_POWER,
	APCA_SMOOTH_THRESHOLD,
	APCA_SMOOTH_THRESHOLD_OFFSET,
	INVERSION_THRESHOLD,
	LP_SOFT_CLAMP_INV_P,
	LP_SOFT_CLAMP_KP,
	LP_SOFT_CLAMP_P,
} from './constants.ts'

// --- Contrast polarity solver ---

const absContrast = ct.abs('contrast')
const contrastDelta = ct.divide(ct.add(absContrast, APCA_OFFSET), APCA_SCALE)

const smoothingBlend = ct.pow(
	ct.sin(ct.multiply(ct.min(ct.divide(absContrast, APCA_SMOOTH_THRESHOLD), 1), Math.PI / 2)),
	APCA_SMOOTH_POWER,
)

const aboveSmoothThreshold = ct.max(0, ct.sign(ct.subtract(absContrast, APCA_SMOOTH_THRESHOLD)))

export const normalPolarity: CalcExpression<'yBg' | 'contrast'> = ct.lerp(
	ct.lerp(
		'yBg',
		ct.signedPow(
			ct.subtract(ct.pow('yBg', APCA_BG_EXP_NORMAL), APCA_SMOOTH_THRESHOLD_OFFSET),
			APCA_NORMAL_INV_EXP,
		),
		smoothingBlend,
	),
	ct.signedPow(ct.subtract(ct.pow('yBg', APCA_BG_EXP_NORMAL), contrastDelta), APCA_NORMAL_INV_EXP),
	aboveSmoothThreshold,
)

export const reversePolarity: CalcExpression<'yBg' | 'contrast'> = ct.lerp(
	ct.lerp(
		'yBg',
		ct.pow(
			ct.add(ct.pow('yBg', APCA_BG_EXP_REVERSE), APCA_SMOOTH_THRESHOLD_OFFSET),
			APCA_REVERSE_INV_EXP,
		),
		smoothingBlend,
	),
	ct.pow(ct.add(ct.pow('yBg', APCA_BG_EXP_REVERSE), contrastDelta), APCA_REVERSE_INV_EXP),
	aboveSmoothThreshold,
)

const contrastSign = ct.sign('contrast')
const contrastPreferLight = ct.max(0, contrastSign)
const contrastPreferDark = ct.max(0, ct.multiply(-1, contrastSign))
const contrastIsZero = ct.subtract(1, ct.max(contrastPreferLight, contrastPreferDark))

export const contrastSolver: CalcExpression<'yBg' | 'contrast'> = ct.clamp(
	0,
	ct.add(
		ct.multiply(contrastPreferLight, reversePolarity),
		ct.multiply(contrastPreferDark, normalPolarity),
		ct.multiply(contrastIsZero, 'yBg'),
	),
	1,
)

// --- Contrast measurement ---

// Soft black clamp: Y + pow(max(0, threshold - Y), 1.414)
// When Y >= threshold this is a no-op; when Y < threshold it bumps Y up
const softClampY = <R extends string>(y: CalcExpression<R>) =>
	ct.add(y, ct.pow(ct.max(0, ct.subtract(APCA_SMOOTH_THRESHOLD, y)), APCA_BLACK_CLAMP))

const yBgClamped = softClampY(ct.toExpression('yBg'))
const yFgClamped = softClampY(ct.toExpression('yFg'))

/**
 * Measure achieved contrast for reverse polarity (light text on dark background).
 * Includes APCA soft black clamp for perceptual accuracy near Y=0.
 *
 * Formula: max(0, 1.14 * (clamp(Y_fg)^0.62 - clamp(Y_bg)^0.65) - 0.027)
 */
export const contrastMeasurementReverse: CalcExpression<'yBg' | 'yFg'> = ct.max(
	0,
	ct.subtract(
		ct.multiply(
			APCA_SCALE,
			ct.subtract(ct.pow(yFgClamped, APCA_FG_EXP_REVERSE), ct.pow(yBgClamped, APCA_BG_EXP_REVERSE)),
		),
		APCA_OFFSET,
	),
)

/**
 * Measure achieved contrast for normal polarity (dark text on light background).
 * Includes APCA soft black clamp for perceptual accuracy near Y=0.
 *
 * Formula: max(0, 1.14 * (clamp(Y_bg)^0.56 - clamp(Y_fg)^0.57) - 0.027)
 */
export const contrastMeasurementNormal: CalcExpression<'yBg' | 'yFg'> = ct.max(
	0,
	ct.subtract(
		ct.multiply(
			APCA_SCALE,
			ct.subtract(ct.pow(yBgClamped, APCA_BG_EXP_NORMAL), ct.pow(yFgClamped, APCA_FG_EXP_NORMAL)),
		),
		APCA_OFFSET,
	),
)

// --- Soft clamp approximation for solver ---

/**
 * Lp-norm approximation of the APCA soft black clamp.
 * Applied to Y_bg before feeding to the contrast solver.
 *
 * Formula: pow(pow(Y, p) + K^p, 1/p)
 * References Y exactly once, avoiding DevTools expression expansion.
 */
export const softClampApprox = <R extends string>(y: ExpressionInput<R>) =>
	ct.pow(ct.add(ct.pow(y, LP_SOFT_CLAMP_P), LP_SOFT_CLAMP_KP), LP_SOFT_CLAMP_INV_P)

/**
 * Lp-norm inverse: approximate inverse of the soft black clamp.
 * Applied to the solver output to recover the actual Y_fg.
 *
 * Formula: pow(max(0, pow(Y, p) - K^p), 1/p)
 * References Y exactly once. Naturally approaches identity for Y >> K
 * without needing a conditional branch, avoiding expression expansion.
 */
export const softUnclamp = <R extends string>(y: ExpressionInput<R>) =>
	ct.pow(ct.max(0, ct.subtract(ct.pow(y, LP_SOFT_CLAMP_P), LP_SOFT_CLAMP_KP)), LP_SOFT_CLAMP_INV_P)

// --- Contrast solver with inversion ---

// Detect whether the preferred direction's solution has been exhausted
// (clamped to the boundary). Uses raw (pre-unclamp) values because
// softUnclamp(1) < 1, which would prevent exhaustion detection.
// sign(0)=0 and sign(x>0)=1, so:
// darkNotExhausted = 1 when yDarkRaw > 0 (still has room to go darker)
// lightNotExhausted = 1 when yLightRaw < 1 (still has room to go lighter)
const darkNotExhausted = ct.max(0, ct.sign('yDarkRaw'))
const lightNotExhausted = ct.max(0, ct.sign(ct.subtract(1, 'yLightRaw')))
const preferredNotExhausted = ct.add(
	ct.multiply(contrastPreferDark, darkNotExhausted),
	ct.multiply(contrastPreferLight, lightNotExhausted),
)

const belowInvertThreshold = ct.multiply(
	ct.max(0, ct.sign(ct.subtract(INVERSION_THRESHOLD, 'lcLight'))),
	ct.max(0, ct.sign(ct.subtract(INVERSION_THRESHOLD, 'lcDark'))),
) // 1 if both below threshold

// Use preference when the preferred direction still has headroom,
// or when both contrasts are below the inversion threshold
const usePreference = ct.max(belowInvertThreshold, preferredNotExhausted)

// Comparison with preference bias: when contrast difference is smaller than the
// bias (~0.1 Lc), the preferred direction wins. This replaces epsilon-based
// tie-breaking with fewer lcLight/lcDark references (2 each instead of 6).
const preferBias = ct.subtract(
	ct.multiply(contrastPreferLight, 0.001),
	ct.multiply(contrastPreferDark, 0.001),
)
const compDiff = ct.add(ct.subtract('lcLight', 'lcDark'), preferBias)
const useLightComparison = ct.max(0, ct.sign(compDiff))
const useDarkComparison = ct.max(0, ct.sign(ct.multiply(-1, compDiff)))

/**
 * Contrast solver with automatic polarity inversion.
 *
 * Uses the preferred polarity direction as long as it has headroom (hasn't
 * been clamped to the Y boundary). Only when the preferred direction is
 * exhausted does it compare achieved contrasts to pick the better one.
 *
 * At low contrast values (both < INVERSION_THRESHOLD), preference is used
 * directly because APCA formula asymmetry makes comparisons unreliable.
 *
 * Property chain:
 * - Y_light: clamped reverse polarity result (lighter)
 * - Y_dark: clamped normal polarity result (darker)
 * - Lc_light: achieved contrast for light solution
 * - Lc_dark: achieved contrast for dark solution
 * - Selection: preference when not exhausted, comparison when exhausted
 */
export const contrastSolverWithInversion: CalcExpression<
	'yBg' | 'contrast' | 'yLight' | 'yDark' | 'yLightRaw' | 'yDarkRaw' | 'lcLight' | 'lcDark'
> = ct.add(
	ct.multiply(ct.lerp(useLightComparison, contrastPreferLight, usePreference), 'yLight'),
	ct.multiply(ct.lerp(useDarkComparison, contrastPreferDark, usePreference), 'yDark'),
	ct.multiply(contrastIsZero, 'yBg'),
)
