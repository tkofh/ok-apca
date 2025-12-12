/**
 * APCA (Accessible Perceptual Contrast Algorithm) solving functions.
 *
 * These functions solve the APCA equation for target luminance values
 * given a base luminance and desired contrast level.
 */

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
 * Solve for target Y based on signed contrast value.
 *
 * @param Y - Base luminance (0-1)
 * @param signedContrast - Target APCA Lc value, signed (-108 to 108)
 *   - Positive: Normal polarity (darker text)
 *   - Negative: Reverse polarity (lighter text)
 * @param apcaT - APCA threshold for Bézier smoothing
 * @param allowPolarityInversion - Allow fallback to opposite polarity if preferred is out of gamut
 * @returns Target luminance Y value
 */
export function solveTargetY(
	Y: number,
	signedContrast: number,
	apcaT: number,
	allowPolarityInversion: boolean,
): number {
	const x = Math.abs(signedContrast) / 100
	const preferLight = signedContrast < 0

	// Solve for preferred polarity
	const preferred = preferLight ? solveApcaReverse(Y, x, apcaT) : solveApcaNormal(Y, x, apcaT)

	if (preferred.inGamut || !allowPolarityInversion) {
		return preferred.targetY
	}

	// Fallback to opposite polarity
	const fallback = preferLight ? solveApcaNormal(Y, x, apcaT) : solveApcaReverse(Y, x, apcaT)

	if (fallback.inGamut) {
		return fallback.targetY
	}

	// Both out of gamut - choose whichever achieves higher contrast
	const contrastPreferred = estimateContrast(Y, preferred.targetY)
	const contrastFallback = estimateContrast(Y, fallback.targetY)
	return contrastPreferred >= contrastFallback ? preferred.targetY : fallback.targetY
}
