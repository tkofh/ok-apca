import { clamp, signedPow } from './util.ts'

// APCA algorithm constants (exported for CSS generation)
export const APCA_SMOOTH_THRESHOLD = 0.022
export const APCA_SMOOTH_THRESHOLD_OFFSET = (APCA_SMOOTH_THRESHOLD + 0.027) / 1.14
export const APCA_NORMAL_INV_EXP = 1 / 0.57
export const APCA_REVERSE_INV_EXP = 1 / 0.62

/** Power for sine-based smoothing below threshold: pow(sin(t * π/2), SMOOTH_POWER) */
export const APCA_SMOOTH_POWER = 2.46

interface ApcaSolution {
	readonly targetY: number
	readonly inGamut: boolean
}

/**
 * Solve for normal polarity (darker contrast color).
 * Formula: Lc = 1.14 * (Ybg^0.56 - Yfg^0.57) - 0.027
 */
function solveApcaNormal(Y: number, x: number): ApcaSolution {
	const xnmin = signedPow(Y ** 0.56 - APCA_SMOOTH_THRESHOLD_OFFSET, APCA_NORMAL_INV_EXP)

	let targetY: number
	if (x >= APCA_SMOOTH_THRESHOLD) {
		targetY = signedPow(Y ** 0.56 - (x + 0.027) / 1.14, APCA_NORMAL_INV_EXP)
	} else {
		// Sine-based smoothing below threshold
		const t = x / APCA_SMOOTH_THRESHOLD
		const blend = Math.sin((t * Math.PI) / 2) ** APCA_SMOOTH_POWER
		targetY = Y + (xnmin - Y) * blend
	}

	const epsilon = 0.0001
	const inGamut = targetY >= -epsilon && targetY <= 1 + epsilon

	return { targetY: clamp(0, targetY, 1), inGamut }
}

/**
 * Solve for reverse polarity (lighter contrast color).
 * Formula: Lc = 1.14 * (Yfg^0.62 - Ybg^0.65) - 0.027
 */
function solveApcaReverse(Y: number, x: number): ApcaSolution {
	const xrmin = (Y ** 0.65 + APCA_SMOOTH_THRESHOLD_OFFSET) ** APCA_REVERSE_INV_EXP

	let targetY: number
	if (x >= APCA_SMOOTH_THRESHOLD) {
		targetY = (Y ** 0.65 + (x + 0.027) / 1.14) ** APCA_REVERSE_INV_EXP
	} else {
		// Sine-based smoothing below threshold
		const t = x / APCA_SMOOTH_THRESHOLD
		const blend = Math.sin((t * Math.PI) / 2) ** APCA_SMOOTH_POWER
		targetY = Y + (xrmin - Y) * blend
	}

	const epsilon = 0.0001
	const inGamut = targetY >= -epsilon && targetY <= 1 + epsilon

	return { targetY: clamp(0, targetY, 1), inGamut }
}

/**
 * Solve for target Y given signed contrast value.
 * Positive contrast = lighter text, negative = darker text.
 * The result is clamped to the gamut boundary [0, 1].
 */
export function solveTargetY(Y: number, signedContrast: number): number {
	const x = Math.abs(signedContrast) / 100
	const preferLight = signedContrast > 0

	const solution = preferLight ? solveApcaReverse(Y, x) : solveApcaNormal(Y, x)

	return solution.targetY
}
