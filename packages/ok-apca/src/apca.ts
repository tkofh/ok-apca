import {
	APCA_BG_EXP_NORMAL,
	APCA_BG_EXP_REVERSE,
	APCA_FG_EXP_NORMAL,
	APCA_FG_EXP_REVERSE,
	APCA_OFFSET,
	APCA_SCALE,
} from './constants.ts'
import {
	clamp,
	createContrastSolver,
	createNormalPolaritySolver,
	createReversePolaritySolver,
} from './expressions.ts'

interface ApcaSolution {
	readonly targetY: number
	readonly inGamut: boolean
}

/**
 * Solve for normal polarity (darker contrast color).
 * Uses the shared expression tree from expressions.ts.
 */
function solveApcaNormal(Y: number, x: number): ApcaSolution {
	const rawY = createNormalPolaritySolver().toNumber({ yBg: Y, x })

	const targetY = clamp(0, rawY, 1)
	const epsilon = 0.0001
	const inGamut = rawY >= -epsilon && rawY <= 1 + epsilon

	return { targetY, inGamut }
}

/**
 * Solve for reverse polarity (lighter contrast color).
 * Uses the shared expression tree from expressions.ts.
 */
function solveApcaReverse(Y: number, x: number): ApcaSolution {
	const rawY = createReversePolaritySolver().toNumber({ yBg: Y, x })

	const targetY = clamp(0, rawY, 1)
	const epsilon = 0.0001
	const inGamut = rawY >= -epsilon && rawY <= 1 + epsilon

	return { targetY, inGamut }
}

/**
 * Measure achieved contrast for reverse polarity (light text on dark background).
 * Simplified APCA formula without low-contrast smoothing (only used for comparison).
 */
function measureReverseContrast(yBg: number, yFg: number): number {
	return Math.max(
		0,
		APCA_SCALE * (yFg ** APCA_FG_EXP_REVERSE - yBg ** APCA_BG_EXP_REVERSE) - APCA_OFFSET,
	)
}

/**
 * Measure achieved contrast for normal polarity (dark text on light background).
 * Simplified APCA formula without low-contrast smoothing (only used for comparison).
 */
function measureNormalContrast(yBg: number, yFg: number): number {
	return Math.max(
		0,
		APCA_SCALE * (yBg ** APCA_BG_EXP_NORMAL - yFg ** APCA_FG_EXP_NORMAL) - APCA_OFFSET,
	)
}

/**
 * Solve for target Y given signed contrast value (simple solver, no inversion).
 * Positive contrast = lighter text, negative = darker text.
 * The result is clamped to the gamut boundary [0, 1].
 *
 * Uses the shared expression tree from expressions.ts to ensure parity
 * with CSS generation.
 */
function solveTargetYSimple(Y: number, signedContrast: number): number {
	return createContrastSolver().toNumber({
		yBg: Y,
		signedContrast,
		contrastScale: 100,
	})
}

/**
 * Minimum contrast threshold for inversion consideration.
 * Below this threshold, we respect the user's polarity preference
 * rather than trying to maximize contrast, because the APCA formula
 * has inherent asymmetry that makes very low contrast comparisons unreliable.
 */
const INVERSION_THRESHOLD = 0.08 // ~8 Lc

/**
 * Solve for target Y with automatic polarity inversion.
 * Computes both polarity solutions, measures achieved contrast for each,
 * and selects the one that achieves higher absolute contrast.
 * The signed contrast input acts as a preference that breaks ties.
 */
function solveTargetYWithInversion(Y: number, signedContrast: number): number {
	const x = Math.abs(signedContrast) / 100

	// Handle zero contrast
	if (x === 0) {
		return Y
	}

	// Compute both polarity solutions
	const yLight = clamp(0, createReversePolaritySolver().toNumber({ yBg: Y, x }), 1)
	const yDark = clamp(0, createNormalPolaritySolver().toNumber({ yBg: Y, x }), 1)

	// Measure achieved contrast for each
	const lcLight = measureReverseContrast(Y, yLight)
	const lcDark = measureNormalContrast(Y, yDark)

	// At low contrast values, the APCA formula asymmetry makes comparisons unreliable.
	// If neither direction achieves meaningful contrast, respect the user's preference.
	if (lcLight < INVERSION_THRESHOLD && lcDark < INVERSION_THRESHOLD) {
		if (signedContrast > 0) {
			return yLight
		}
		if (signedContrast < 0) {
			return yDark
		}
		return Y
	}

	// Compare and select based on max contrast
	const lcDiff = lcLight - lcDark

	if (lcDiff > 0) {
		// Light achieves more contrast
		return yLight
	}
	if (lcDiff < 0) {
		// Dark achieves more contrast
		return yDark
	}

	// Tie: use preference from signed contrast
	if (signedContrast > 0) {
		return yLight
	}
	if (signedContrast < 0) {
		return yDark
	}

	// Zero contrast
	return Y
}

/**
 * Solve for target Y given signed contrast value.
 * Positive contrast = lighter text, negative = darker text.
 * The result is clamped to the gamut boundary [0, 1].
 *
 * @param Y - Background Y luminance (0-1)
 * @param signedContrast - Signed contrast value (-108 to 108)
 * @param invert - Whether to enable automatic polarity inversion (default: true)
 *
 * When inversion is enabled (default), the solver computes both polarity solutions
 * and selects the one that achieves higher absolute contrast. The signed contrast
 * value acts as a preference that breaks ties when both directions achieve equal contrast.
 */
export function solveTargetY(Y: number, signedContrast: number, invert = true): number {
	if (invert) {
		return solveTargetYWithInversion(Y, signedContrast)
	}
	return solveTargetYSimple(Y, signedContrast)
}

// Keep individual solvers available for testing/debugging
export { solveApcaNormal, solveApcaReverse }
