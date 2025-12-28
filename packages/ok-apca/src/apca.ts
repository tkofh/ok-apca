/**
 * APCA solving functions for computing target luminance values.
 */

function signedPow(x: number, exp: number) {
	return Math.sign(x) * Math.abs(x) ** exp
}

interface ApcaSolution {
	readonly targetY: number
	readonly inGamut: boolean
}

/**
 * Solve for normal polarity (darker contrast color).
 * Formula: Lc = 1.14 * (Ybg^0.56 - Yfg^0.57) - 0.027
 */
function solveApcaNormal(Y: number, x: number, apcaT: number): ApcaSolution {
	const xnmin = signedPow(Y ** 0.56 - (apcaT + 0.027) / 1.14, 1 / 0.57)
	const xnv = -Math.abs((Math.abs(xnmin) ** 0.43 * apcaT) / 0.6498)

	let targetY: number
	if (x >= apcaT) {
		targetY = signedPow(Y ** 0.56 - (x + 0.027) / 1.14, 1 / 0.57)
	} else {
		// Bézier smoothing below threshold
		const t = x / apcaT
		const t2 = t * t
		const t3 = t2 * t
		targetY = Y + (-3 * Y + 3 * xnmin - xnv) * t2 + (2 * Y - 2 * xnmin + xnv) * t3
	}

	const epsilon = 0.0001
	const inGamut = targetY >= -epsilon && targetY <= 1 + epsilon

	return { targetY: Math.max(0, Math.min(1, targetY)), inGamut }
}

/**
 * Solve for reverse polarity (lighter contrast color).
 * Formula: Lc = 1.14 * (Yfg^0.62 - Ybg^0.65) - 0.027
 */
function solveApcaReverse(Y: number, x: number, apcaT: number): ApcaSolution {
	const xrmin = signedPow(Y ** 0.65 + (apcaT + 0.027) / 1.14, 1 / 0.62)
	const xrv = -Math.abs((Math.abs(xrmin) ** 0.38 * -apcaT) / 0.7068)

	let targetY: number
	if (x >= apcaT) {
		targetY = (Y ** 0.65 + (x + 0.027) / 1.14) ** (1 / 0.62)
	} else {
		// Bézier smoothing below threshold
		const t = x / apcaT
		const t2 = t * t
		const t3 = t2 * t
		targetY = Y + (-3 * Y + 3 * xrmin - xrv) * t2 + (2 * Y - 2 * xrmin + xrv) * t3
	}

	const epsilon = 0.0001
	const inGamut = targetY >= -epsilon && targetY <= 1 + epsilon

	return { targetY: Math.max(0, Math.min(1, targetY)), inGamut }
}

function estimateContrast(baseY: number, targetY: number): number {
	if (targetY < baseY) {
		return 1.14 * (baseY ** 0.56 - targetY ** 0.57) - 0.027
	}
	return 1.14 * (targetY ** 0.62 - baseY ** 0.65) - 0.027
}

/**
 * Solve for target Y given signed contrast value.
 * Positive contrast = normal polarity (darker), negative = reverse polarity (lighter).
 * When preferred polarity is out of gamut, falls back to opposite polarity if allowed.
 */
export function solveTargetY(
	Y: number,
	signedContrast: number,
	apcaT: number,
	allowPolarityInversion: boolean,
): number {
	const x = Math.abs(signedContrast) / 100
	const preferLight = signedContrast < 0

	const preferred = preferLight ? solveApcaReverse(Y, x, apcaT) : solveApcaNormal(Y, x, apcaT)

	if (preferred.inGamut || !allowPolarityInversion) {
		return preferred.targetY
	}

	const fallback = preferLight ? solveApcaNormal(Y, x, apcaT) : solveApcaReverse(Y, x, apcaT)

	if (fallback.inGamut) {
		return fallback.targetY
	}

	// Both out of gamut - choose higher contrast
	const contrastPreferred = estimateContrast(Y, preferred.targetY)
	const contrastFallback = estimateContrast(Y, fallback.targetY)
	return contrastPreferred >= contrastFallback ? preferred.targetY : fallback.targetY
}
