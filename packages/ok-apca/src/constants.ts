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
 * Pre-computed threshold offset for smoothing calculations.
 * Formula: (APCA_SMOOTH_THRESHOLD + APCA_OFFSET) / APCA_SCALE
 */
export const APCA_SMOOTH_THRESHOLD_OFFSET = (APCA_SMOOTH_THRESHOLD + APCA_OFFSET) / APCA_SCALE

/**
 * Power for sine-based smoothing below threshold.
 * Formula: pow(sin(t * π/2), APCA_SMOOTH_POWER)
 */
export const APCA_SMOOTH_POWER = 2.46
