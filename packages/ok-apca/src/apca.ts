/**
 * APCA (Accessible Perceptual Contrast Algorithm) solving functions.
 *
 * These functions solve the APCA equation for target luminance values
 * given a base luminance and desired contrast level.
 */

import type { ContrastMode } from './types.ts'

/**
 * Compute x^(1/n) preserving sign (for odd roots of negative numbers).
 */
export function signedPow(x: number, exp: number) {
	return Math.sign(x) * Math.abs(x) ** exp
}

/**
 * Compute cube root preserving sign.
 */
export function signedCbrt(x: number) {
	return Math.sign(x) * Math.cbrt(Math.abs(x))
}

/**
 * Result of solving APCA equation.
 */
export interface ApcaSolution {
	readonly targetY: number
	readonly inGamut: boolean
}

/**
 * Solve APCA equation for normal polarity (darker contrast color).
 * Normal: Lc = 1.14 * (Ybg^0.56 - Yfg^0.57) - 0.027
 */
export function solveApcaNormal(Y: number, x: number, apcaT: number): ApcaSolution {
	// Solve for target Y at the threshold first (for Bézier smoothing)
	const xnmin = signedPow(Y ** 0.56 - (apcaT + 0.027) / 1.14, 1 / 0.57)
	const xnv = -Math.abs((Math.abs(xnmin) ** 0.43 * apcaT) / 0.6498)

	let targetY: number
	if (x >= apcaT) {
		// Direct APCA inverse
		targetY = signedPow(Y ** 0.56 - (x + 0.027) / 1.14, 1 / 0.57)
	} else {
		// Bézier smoothing for low contrast values
		const t = x / apcaT
		const t2 = t * t
		const t3 = t2 * t
		targetY = Y + (-3 * Y + 3 * xnmin - xnv) * t2 + (2 * Y - 2 * xnmin + xnv) * t3
	}

	// Check if result is in gamut (0 <= Y <= 1)
	const epsilon = 0.0001
	const inGamut = targetY >= -epsilon && targetY <= 1 + epsilon

	return { targetY: Math.max(0, Math.min(1, targetY)), inGamut }
}

/**
 * Solve APCA equation for reverse polarity (lighter contrast color).
 * Reverse: Lc = 1.14 * (Yfg^0.62 - Ybg^0.65) - 0.027
 */
export function solveApcaReverse(Y: number, x: number, apcaT: number): ApcaSolution {
	// Solve for target Y at the threshold first (for Bézier smoothing)
	const xrmin = signedPow(Y ** 0.65 + (apcaT + 0.027) / 1.14, 1 / 0.62)
	const xrv = -Math.abs((Math.abs(xrmin) ** 0.38 * -apcaT) / 0.7068)

	let targetY: number
	if (x >= apcaT) {
		// Direct APCA inverse
		// Reverse formula: need to solve for Yfg where Lc = 1.14 * (Yfg^0.62 - Ybg^0.65) - 0.027
		// Yfg^0.62 = (Lc + 0.027) / 1.14 + Ybg^0.65
		targetY = (Y ** 0.65 + (x + 0.027) / 1.14) ** (1 / 0.62)
	} else {
		// Bézier smoothing for low contrast values
		const t = x / apcaT
		const t2 = t * t
		const t3 = t2 * t
		targetY = Y + (-3 * Y + 3 * xrmin - xrv) * t2 + (2 * Y - 2 * xrmin + xrv) * t3
	}

	// Check if result is in gamut (0 <= Y <= 1)
	const epsilon = 0.0001
	const inGamut = targetY >= -epsilon && targetY <= 1 + epsilon

	return { targetY: Math.max(0, Math.min(1, targetY)), inGamut }
}

/**
 * Estimate APCA contrast between two Y values.
 * Uses simplified formula: higher Y difference generally means higher contrast.
 * For accurate measurement, the actual APCA formula depends on polarity.
 */
function estimateContrast(baseY: number, targetY: number): number {
	// Use the appropriate APCA formula based on polarity
	if (targetY < baseY) {
		// Normal polarity (darker foreground): Lc = 1.14 * (Ybg^0.56 - Yfg^0.57) - 0.027
		return 1.14 * (baseY ** 0.56 - targetY ** 0.57) - 0.027
	}
	// Reverse polarity (lighter foreground): Lc = 1.14 * (Yfg^0.62 - Ybg^0.65) - 0.027
	return 1.14 * (targetY ** 0.62 - baseY ** 0.65) - 0.027
}

/**
 * Solve for prefer-light mode: try reverse (lighter) first, fall back to normal.
 * When both are out of gamut, choose the option that achieves higher contrast.
 */
export function solvePreferLight(Y: number, x: number, apcaT: number) {
	const { targetY: YR, inGamut: xrg } = solveApcaReverse(Y, x, apcaT)
	if (xrg) {
		return YR
	}
	const { targetY: YN, inGamut: xng } = solveApcaNormal(Y, x, apcaT)
	if (xng) {
		return YN
	}
	// Both out of gamut - choose whichever achieves higher contrast
	const contrastR = estimateContrast(Y, YR)
	const contrastN = estimateContrast(Y, YN)
	return contrastR >= contrastN ? YR : YN
}

/**
 * Solve for prefer-dark mode: try normal (darker) first, fall back to reverse.
 * When both are out of gamut, choose the option that achieves higher contrast.
 */
export function solvePreferDark(Y: number, x: number, apcaT: number) {
	const { targetY: YN, inGamut: xng } = solveApcaNormal(Y, x, apcaT)
	if (xng) {
		return YN
	}
	const { targetY: YR, inGamut: xrg } = solveApcaReverse(Y, x, apcaT)
	if (xrg) {
		return YR
	}
	// Both out of gamut - choose whichever achieves higher contrast
	const contrastN = estimateContrast(Y, YN)
	const contrastR = estimateContrast(Y, YR)
	return contrastN >= contrastR ? YN : YR
}

/**
 * Solve for target Y based on contrast mode.
 */
export function solveTargetY(Y: number, x: number, apcaT: number, mode: ContrastMode) {
	if (mode === 'force-light') {
		return solveApcaReverse(Y, x, apcaT).targetY
	}
	if (mode === 'force-dark') {
		return solveApcaNormal(Y, x, apcaT).targetY
	}
	if (mode === 'prefer-light') {
		return solvePreferLight(Y, x, apcaT)
	}
	// prefer-dark
	return solvePreferDark(Y, x, apcaT)
}
