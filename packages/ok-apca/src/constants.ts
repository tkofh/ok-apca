/**
 * Shared constants for OKLCH gamut mapping and APCA contrast calculations.
 *
 * These constants are the single source of truth for both:
 * - TypeScript runtime functions (color.ts, contrast.ts, apca.ts)
 * - CSS generation (generator.ts)
 *
 * Keeping them centralized ensures parity between JS and CSS implementations.
 */

// =============================================================================
// Gamut Mapping Constants
// =============================================================================

/**
 * Exponent for sine-based curvature correction on the right half of the
 * gamut boundary tent function.
 *
 * The tent approximates the Display P3 gamut boundary as two linear segments
 * meeting at the apex (maximum chroma). The right half (apex to white) uses
 * a sine-based correction to better fit the actual curved boundary.
 *
 * Formula: linearChroma + curvature * sin(t * π)^SINE_CURVATURE_EXPONENT * apexChroma
 *
 * Value 0.95 was determined empirically by testing across all 360 hues.
 */
export const GAMUT_SINE_CURVATURE_EXPONENT = 0.95

// =============================================================================
// APCA Algorithm Constants
// =============================================================================

/**
 * Exponents for Y (luminance) in APCA contrast formula.
 * Normal polarity: Lc = 1.14 * (Ybg^0.56 - Yfg^0.57) - 0.027
 * Reverse polarity: Lc = 1.14 * (Yfg^0.62 - Ybg^0.65) - 0.027
 */
export const APCA_BG_EXP_NORMAL = 0.56
export const APCA_FG_EXP_NORMAL = 0.57
export const APCA_FG_EXP_REVERSE = 0.62
export const APCA_BG_EXP_REVERSE = 0.65

/** Inverse exponents for solving target Y from contrast */
export const APCA_NORMAL_INV_EXP = 1 / APCA_FG_EXP_NORMAL
export const APCA_REVERSE_INV_EXP = 1 / APCA_FG_EXP_REVERSE

/** APCA offset constant */
export const APCA_OFFSET = 0.027

/** APCA scaling factor */
export const APCA_SCALE = 1.14

/**
 * Threshold below which we use smoothing instead of direct APCA formula.
 * This prevents discontinuities at very low contrast values.
 */
export const APCA_SMOOTH_THRESHOLD = 0.022

/**
 * Soft clamp exponent for near-black luminance values.
 * When Y < APCA_SMOOTH_THRESHOLD, Y is replaced with Y + (threshold - Y)^BLACK_CLAMP.
 * This prevents division-by-zero and stabilizes contrast near black.
 */
// biome-ignore lint/suspicious/noApproximativeNumericConstant: w3 spec uses 1.414
export const APCA_BLACK_CLAMP = 1.414

/**
 * Pre-computed threshold offset for smoothing calculations.
 * Formula: (APCA_SMOOTH_THRESHOLD + APCA_OFFSET) / APCA_SCALE
 */
export const APCA_SMOOTH_THRESHOLD_OFFSET = (APCA_SMOOTH_THRESHOLD + APCA_OFFSET) / APCA_SCALE

/**
 * Power for sine-based smoothing below threshold.
 * Formula: pow(sin(t * π/2), APCA_SMOOTH_POWER)
 */
export const APCA_SMOOTH_POWER = 2.46

/**
 * Epsilon for floating-point comparison when comparing achieved contrasts.
 * If the difference between light and dark achieved contrast is within this
 * epsilon, they are treated as equal (a tie) and user preference is used.
 * This prevents floating-point precision issues from causing unexpected
 * polarity flips at boundary conditions.
 */
export const COMPARISON_EPSILON = 0.005 // ~0.5 Lc units

/**
 * Minimum contrast threshold for inversion consideration.
 * Below this threshold, we respect the user's polarity preference
 * rather than trying to maximize contrast, because the APCA formula
 * has inherent asymmetry that makes very low contrast comparisons unreliable.
 */
export const INVERSION_THRESHOLD = 0.08 // ~8 Lc

// =============================================================================
// Soft Clamp Approximation Constants
// =============================================================================

/**
 * Lp-norm approximation of the APCA soft black clamp for the solver input.
 *
 * The true soft clamp sc(Y) = Y + max(0, 0.022 - Y)^1.414 references Y twice,
 * which doubles the DevTools expression expansion factor. The Lp-norm
 * pow(pow(Y, p) + K^p, 1/p) approximates sc(Y) with a single reference to Y.
 *
 * Parameters optimized to minimize end-to-end Lc error when paired with
 * the APCA unclamp on the output side (max ≈ 0.25 Lc, avg ≈ 0.01 Lc).
 */
export const LP_SOFT_CLAMP_P = 1.75
export const LP_SOFT_CLAMP_K = 0.005
export const LP_SOFT_CLAMP_KP = LP_SOFT_CLAMP_K ** LP_SOFT_CLAMP_P
export const LP_SOFT_CLAMP_INV_P = 1 / LP_SOFT_CLAMP_P

/**
 * APCA unclamp constants from the reference implementation (reverseAPCA).
 * Used in TypeScript runtime for accurate inverse when a conditional is cheap.
 *
 * Formula: pow((Y + mOffsetIn) * mFactor, mExp) / mFactor - mOffsetOut
 * Only applied when Y < APCA_SMOOTH_THRESHOLD.
 */
export const APCA_UNCLAMP_FACTOR = 1.9468554433171
export const APCA_UNCLAMP_OFFSET_IN = 0.0387393816571401
export const APCA_UNCLAMP_EXP = 0.283343396420869 / APCA_BLACK_CLAMP
export const APCA_UNCLAMP_OFFSET_OUT = 0.312865795870758
