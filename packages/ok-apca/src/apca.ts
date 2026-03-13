import { Calc } from '@ok-apca/calc-tree'

/** Exponents for Y (luminance) in APCA contrast formula. */
export const APCA_BG_EXP_NORMAL = 0.56
export const APCA_FG_EXP_NORMAL = 0.57
export const APCA_FG_EXP_REVERSE = 0.62
export const APCA_BG_EXP_REVERSE = 0.65

/** Inverse exponents for solving target Y from contrast. */
const APCA_NORMAL_INV_EXP = 1 / APCA_FG_EXP_NORMAL
const APCA_REVERSE_INV_EXP = 1 / APCA_FG_EXP_REVERSE

/** APCA offset and scaling constants. */
export const APCA_OFFSET = 0.027
export const APCA_SCALE = 1.14

/** Threshold below which we use smoothing instead of direct APCA formula. */
const APCA_SMOOTH_THRESHOLD = 0.022

/**
 * Soft clamp exponent for near-black luminance values.
 * When Y < APCA_SMOOTH_THRESHOLD, Y is replaced with Y + (threshold - Y)^BLACK_CLAMP.
 */
// biome-ignore lint/suspicious/noApproximativeNumericConstant: w3 spec uses 1.414
const APCA_BLACK_CLAMP = 1.414

/** Pre-computed threshold offset: (APCA_SMOOTH_THRESHOLD + APCA_OFFSET) / APCA_SCALE */
const APCA_SMOOTH_THRESHOLD_OFFSET = (APCA_SMOOTH_THRESHOLD + APCA_OFFSET) / APCA_SCALE

/** Power for sine-based smoothing below threshold. */
const APCA_SMOOTH_POWER = 2.46

/**
 * Minimum contrast threshold for inversion consideration.
 * Below this, we respect the user's polarity preference rather than
 * trying to maximize contrast.
 */
const INVERSION_THRESHOLD = 0.08 // ~8 Lc

/**
 * Lp-norm approximation of the APCA soft black clamp.
 * pow(pow(Y, p) + K^p, 1/p) approximates sc(Y) with a single reference to Y.
 */
const LP_SOFT_CLAMP_P = 1.75
const LP_SOFT_CLAMP_KP = 0.005 ** LP_SOFT_CLAMP_P
const LP_SOFT_CLAMP_INV_P = 1 / LP_SOFT_CLAMP_P

const contrastDelta = Calc.divide(Calc.add(Calc.abs(Calc.ref('contrast')), APCA_OFFSET), APCA_SCALE)

const smoothingBlend = Calc.pow(
	Calc.sin(
		Calc.multiply(
			Calc.min(Calc.divide(Calc.abs(Calc.ref('contrast')), APCA_SMOOTH_THRESHOLD), 1),
			Math.PI / 2,
		),
	),
	APCA_SMOOTH_POWER,
)

const aboveSmoothThreshold = Calc.max(
	0,
	Calc.sign(Calc.subtract(Calc.abs(Calc.ref('contrast')), APCA_SMOOTH_THRESHOLD)),
)

export const normalPolarity: Calc.Expression<'yBg' | 'contrast'> = Calc.lerp(
	Calc.lerp(
		Calc.ref('yBg'),
		Calc.signedPow(
			Calc.subtract(Calc.pow(Calc.ref('yBg'), APCA_BG_EXP_NORMAL), APCA_SMOOTH_THRESHOLD_OFFSET),
			APCA_NORMAL_INV_EXP,
		),
		smoothingBlend,
	),
	Calc.signedPow(
		Calc.subtract(Calc.pow(Calc.ref('yBg'), APCA_BG_EXP_NORMAL), contrastDelta),
		APCA_NORMAL_INV_EXP,
	),
	aboveSmoothThreshold,
)

export const reversePolarity: Calc.Expression<'yBg' | 'contrast'> = Calc.lerp(
	Calc.lerp(
		Calc.ref('yBg'),
		Calc.pow(
			Calc.add(Calc.pow(Calc.ref('yBg'), APCA_BG_EXP_REVERSE), APCA_SMOOTH_THRESHOLD_OFFSET),
			APCA_REVERSE_INV_EXP,
		),
		smoothingBlend,
	),
	Calc.pow(
		Calc.add(Calc.pow(Calc.ref('yBg'), APCA_BG_EXP_REVERSE), contrastDelta),
		APCA_REVERSE_INV_EXP,
	),
	aboveSmoothThreshold,
)

const contrastSign = Calc.sign(Calc.ref('contrast'))
const contrastPreferLight = Calc.max(0, contrastSign)
const contrastPreferDark = Calc.max(0, Calc.multiply(-1, contrastSign))
const contrastIsZero = Calc.subtract(1, Calc.max(contrastPreferLight, contrastPreferDark))

/**
 * True APCA soft black clamp: Y + max(0, threshold - Y)^1.414.
 * Used for accurate reference values in the TypeScript runtime.
 */
export const trueSoftClamp: Calc.Expression<'y'> = Calc.add(
	Calc.ref('y'),
	Calc.pow(Calc.max(0, Calc.subtract(APCA_SMOOTH_THRESHOLD, Calc.ref('y'))), APCA_BLACK_CLAMP),
)

/**
 * Lp-norm approximation of the APCA soft black clamp.
 *
 * Formula: pow(pow(Y, p) + K^p, 1/p)
 * References Y exactly once, avoiding DevTools expression expansion.
 */
export const softClampApprox: Calc.Expression<'y'> = Calc.pow(
	Calc.add(Calc.pow(Calc.ref('y'), LP_SOFT_CLAMP_P), LP_SOFT_CLAMP_KP),
	LP_SOFT_CLAMP_INV_P,
)

/**
 * Lp-norm inverse: approximate inverse of the soft black clamp.
 * Applied to the solver output to recover the actual Y_fg.
 *
 * Formula: pow(max(0, pow(Y, p) - K^p), 1/p)
 * References Y exactly once. Naturally approaches identity for Y >> K
 * without needing a conditional branch, avoiding expression expansion.
 */
export const softUnclamp: Calc.Expression<'y'> = Calc.pow(
	Calc.max(0, Calc.subtract(Calc.pow(Calc.ref('y'), LP_SOFT_CLAMP_P), LP_SOFT_CLAMP_KP)),
	LP_SOFT_CLAMP_INV_P,
)

// --- Contrast measurement ---

// Lp-norm soft clamp for measurement inputs. Uses the same approximation as the
// solver so each Y input is referenced once instead of twice. Measurements are
// only used for comparison (which direction achieved higher contrast), so the
// monotonic Lp-norm preserves ranking while halving expansion.
const yBgSoftclamped = Calc.bind(softClampApprox, { y: Calc.ref('yBg') })
const yFgSoftclamped = Calc.bind(softClampApprox, { y: Calc.ref('yFg') })

/**
 * Measure achieved contrast for reverse polarity (light text on dark background).
 *
 * Formula: max(0, 1.14 * (clamp(Y_fg)^0.62 - clamp(Y_bg)^0.65) - 0.027)
 */
export const contrastMeasurementReverse: Calc.Expression<'yBg' | 'yFg'> = Calc.max(
	0,
	Calc.subtract(
		Calc.multiply(
			APCA_SCALE,
			Calc.subtract(
				Calc.pow(yFgSoftclamped, APCA_FG_EXP_REVERSE),
				Calc.pow(yBgSoftclamped, APCA_BG_EXP_REVERSE),
			),
		),
		APCA_OFFSET,
	),
)

/**
 * Measure achieved contrast for normal polarity (dark text on light background).
 *
 * Formula: max(0, 1.14 * (clamp(Y_bg)^0.56 - clamp(Y_fg)^0.57) - 0.027)
 */
export const contrastMeasurementNormal: Calc.Expression<'yBg' | 'yFg'> = Calc.max(
	0,
	Calc.subtract(
		Calc.multiply(
			APCA_SCALE,
			Calc.subtract(
				Calc.pow(yBgSoftclamped, APCA_BG_EXP_NORMAL),
				Calc.pow(yFgSoftclamped, APCA_FG_EXP_NORMAL),
			),
		),
		APCA_OFFSET,
	),
)

// Use preference when the preferred direction still has headroom,
// or when both contrasts are below the inversion threshold.
// When invertable=0, force usePreference=1 (always follow contrast sign, no inversion).
const usePreference = Calc.max(
	Calc.subtract(1, Calc.ref('invertable')),
	Calc.multiply(
		Calc.max(0, Calc.sign(Calc.subtract(INVERSION_THRESHOLD, Calc.ref('lcLight')))),
		Calc.max(0, Calc.sign(Calc.subtract(INVERSION_THRESHOLD, Calc.ref('lcDark')))),
	),
	Calc.add(
		Calc.multiply(contrastPreferDark, Calc.max(0, Calc.sign(Calc.ref('yDarkRaw')))),
		Calc.multiply(
			contrastPreferLight,
			Calc.max(0, Calc.sign(Calc.subtract(1, Calc.ref('yLightRaw')))),
		),
	),
)

// Comparison with preference bias: when contrast difference is smaller than the
// bias (~0.1 Lc), the preferred direction wins. This replaces epsilon-based
// tie-breaking with fewer lcLight/lcDark references (2 each instead of 6).
const compDiff = Calc.add(
	Calc.subtract(Calc.ref('lcLight'), Calc.ref('lcDark')),
	Calc.subtract(
		Calc.multiply(contrastPreferLight, 0.001),
		Calc.multiply(contrastPreferDark, 0.001),
	),
)

/**
 * Contrast solver with optional polarity inversion.
 *
 * When `invertable=1`, uses the preferred polarity direction as long as it
 * has headroom (hasn't been clamped to the Y boundary). Only when the
 * preferred direction is exhausted does it compare achieved contrasts to
 * pick the better one.
 *
 * When `invertable=0`, always follows the contrast sign (positive = lighter,
 * negative = darker) without inversion.
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
export const contrastSolver: Calc.Expression<
	| 'yBg'
	| 'contrast'
	| 'invertable'
	| 'yLight'
	| 'yDark'
	| 'yLightRaw'
	| 'yDarkRaw'
	| 'lcLight'
	| 'lcDark'
> = Calc.add(
	Calc.multiply(
		Calc.lerp(Calc.max(0, Calc.sign(compDiff)), contrastPreferLight, usePreference),
		Calc.ref('yLight'),
	),
	Calc.multiply(
		Calc.lerp(
			Calc.max(0, Calc.sign(Calc.multiply(-1, compDiff))),
			contrastPreferDark,
			usePreference,
		),
		Calc.ref('yDark'),
	),
	Calc.multiply(contrastIsZero, Calc.ref('yBg')),
)
