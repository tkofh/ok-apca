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
} from './constants.ts'
import { clamp, signedPow } from './util.ts'

// Re-export constants needed by generator.ts
export {
	APCA_NORMAL_INV_EXP,
	APCA_REVERSE_INV_EXP,
	APCA_SMOOTH_POWER,
	APCA_SMOOTH_THRESHOLD,
	APCA_SMOOTH_THRESHOLD_OFFSET,
} from './constants.ts'

interface ApcaSolution {
	readonly targetY: number
	readonly inGamut: boolean
}

/**
 * Solve for normal polarity (darker contrast color).
 * Formula: Lc = 1.14 * (Ybg^0.56 - Yfg^0.57) - 0.027
 */
function solveApcaNormal(Y: number, x: number): ApcaSolution {
	const xnmin = signedPow(
		Y ** APCA_BG_EXP_NORMAL - APCA_SMOOTH_THRESHOLD_OFFSET,
		APCA_NORMAL_INV_EXP,
	)

	let targetY: number
	if (x >= APCA_SMOOTH_THRESHOLD) {
		targetY = signedPow(
			Y ** APCA_BG_EXP_NORMAL - (x + APCA_OFFSET) / APCA_SCALE,
			APCA_NORMAL_INV_EXP,
		)
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
	const xrmin = (Y ** APCA_BG_EXP_REVERSE + APCA_SMOOTH_THRESHOLD_OFFSET) ** APCA_REVERSE_INV_EXP

	let targetY: number
	if (x >= APCA_SMOOTH_THRESHOLD) {
		targetY = (Y ** APCA_BG_EXP_REVERSE + (x + APCA_OFFSET) / APCA_SCALE) ** APCA_REVERSE_INV_EXP
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
