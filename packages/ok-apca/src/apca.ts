import { clamp, signedPow } from './util.ts'

// APCA algorithm constants (exported for CSS generation)
export const APCA_SMOOTH_THRESHOLD = 0.022
export const APCA_SMOOTH_THRESHOLD_OFFSET = (APCA_SMOOTH_THRESHOLD + 0.027) / 1.14
export const APCA_NORMAL_INV_EXP = 1 / 0.57
export const APCA_REVERSE_INV_EXP = 1 / 0.62
export const APCA_DARK_V_SCALE = APCA_SMOOTH_THRESHOLD / 0.6498
export const APCA_LIGHT_V_SCALE = APCA_SMOOTH_THRESHOLD / 0.7068

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
	const xnv = -(Math.abs(xnmin) ** 0.43) * APCA_DARK_V_SCALE

	let targetY: number
	if (x >= APCA_SMOOTH_THRESHOLD) {
		targetY = signedPow(Y ** 0.56 - (x + 0.027) / 1.14, APCA_NORMAL_INV_EXP)
	} else {
		// Hermite smoothing below threshold
		const t = x / APCA_SMOOTH_THRESHOLD
		const t2 = t * t
		const t3 = t2 * t
		targetY = Y + (-3 * Y + 3 * xnmin - xnv) * t2 + (2 * Y - 2 * xnmin + xnv) * t3
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
	const xrmin = signedPow(Y ** 0.65 + APCA_SMOOTH_THRESHOLD_OFFSET, APCA_REVERSE_INV_EXP)
	const xrv = Math.abs(xrmin) ** 0.38 * APCA_LIGHT_V_SCALE

	let targetY: number
	if (x >= APCA_SMOOTH_THRESHOLD) {
		targetY = (Y ** 0.65 + (x + 0.027) / 1.14) ** APCA_REVERSE_INV_EXP
	} else {
		// Hermite smoothing below threshold
		const t = x / APCA_SMOOTH_THRESHOLD
		const t2 = t * t
		const t3 = t2 * t
		targetY = Y + (-3 * Y + 3 * xrmin - xrv) * t2 + (2 * Y - 2 * xrmin + xrv) * t3
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
