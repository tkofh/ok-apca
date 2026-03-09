import type { CalcExpression } from '@ok-apca/calc-tree'
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
	COMPARISON_EPSILON,
	INVERSION_THRESHOLD,
} from './constants.ts'

// --- References ---

const contrastMagnitudeRef = ct.reference('contrastMagnitude')
const yBgRef = ct.reference('yBg')
const yFgRef = ct.reference('yFg')
const contrastRef = ct.reference('contrast')
export const yLightRef = ct.reference('yLight')
export const yDarkRef = ct.reference('yDark')
const lcLightRef = ct.reference('lcLight')
const lcDarkRef = ct.reference('lcDark')

// --- Contrast polarity solver ---

const contrastDelta = ct.divide(ct.add(contrastMagnitudeRef, APCA_OFFSET), APCA_SCALE)

const smoothingBlend = ct.pow(
	ct.sin(
		ct.multiply(ct.min(ct.divide(contrastMagnitudeRef, APCA_SMOOTH_THRESHOLD), 1), Math.PI / 2),
	),
	APCA_SMOOTH_POWER,
)

const aboveSmoothThreshold = ct.max(
	0,
	ct.sign(ct.subtract(contrastMagnitudeRef, APCA_SMOOTH_THRESHOLD)),
)

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

// --- Contrast measurement ---

// Soft black clamp: Y + pow(max(0, threshold - Y), 1.414)
// When Y >= threshold this is a no-op; when Y < threshold it bumps Y up
const softClampY = <R extends string>(y: CalcExpression<R>) =>
	ct.add(y, ct.pow(ct.max(0, ct.subtract(APCA_SMOOTH_THRESHOLD, y)), APCA_BLACK_CLAMP))

const yBgClamped = softClampY(yBgRef)
const yFgClamped = softClampY(yFgRef)

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

// --- Contrast solver with inversion ---

// Detect whether the preferred direction's solution has been exhausted
// (clamped to the boundary). sign(0)=0 and sign(x>0)=1, so:
// darkNotExhausted = 1 when yDark > 0 (still has room to go darker)
// lightNotExhausted = 1 when yLight < 1 (still has room to go lighter)
const darkNotExhausted = ct.max(0, ct.sign(yDarkRef))
const lightNotExhausted = ct.max(0, ct.sign(ct.subtract(1, yLightRef)))
const preferredNotExhausted = ct.add(
	ct.multiply(contrastPreferDark, darkNotExhausted),
	ct.multiply(contrastPreferLight, lightNotExhausted),
)

const belowInvertThreshold = ct.multiply(
	ct.max(0, ct.sign(ct.subtract(INVERSION_THRESHOLD, lcLightRef))),
	ct.max(0, ct.sign(ct.subtract(INVERSION_THRESHOLD, lcDarkRef))),
) // 1 if both below threshold

// Use preference when the preferred direction still has headroom,
// or when both contrasts are below the inversion threshold
const usePreference = ct.max(belowInvertThreshold, preferredNotExhausted)

const lcDiff = ct.subtract(lcLightRef, lcDarkRef)

const outsideEpsilon = ct.subtract(
	1,
	ct.max(0, ct.sign(ct.subtract(COMPARISON_EPSILON, ct.abs(lcDiff)))),
)

// Only declare a winner if difference is outside epsilon
const lightWins = ct.multiply(outsideEpsilon, ct.max(0, ct.sign(lcDiff)))
const darkWins = ct.multiply(outsideEpsilon, ct.max(0, ct.sign(ct.multiply(-1, lcDiff))))
const isTie = ct.subtract(1, ct.max(lightWins, darkWins)) // 1 if within epsilon or equal

// When preferred direction is exhausted: winner takes all with ties using preference
const useLightComparison = ct.max(lightWins, ct.multiply(isTie, contrastPreferLight))
const useDarkComparison = ct.max(darkWins, ct.multiply(isTie, contrastPreferDark))

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
	'yBg' | 'contrast' | 'yLight' | 'yDark' | 'lcLight' | 'lcDark'
> = ct.add(
	ct.multiply(ct.lerp(useLightComparison, contrastPreferLight, usePreference), yLightRef),
	ct.multiply(ct.lerp(useDarkComparison, contrastPreferDark, usePreference), yDarkRef),
	ct.multiply(contrastIsZero, yBgRef),
)
