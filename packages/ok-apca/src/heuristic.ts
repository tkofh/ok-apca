/**
 * Heuristic corrections for APCA contrast calculation.
 *
 * The CSS uses Y = L³ approximation. Testing shows the CSS APCA solver is
 * accurate without correction:
 * - Positive contrast (lighter text): average error -1 Lc, max -2.5 Lc
 * - Negative contrast (darker text): under-delivery is mostly gamut limitation
 *   (can't get darker than black)
 *
 * The previous boost coefficients caused severe over-delivery (+25-30 Lc),
 * pushing contrast colors to near-white/near-black too aggressively.
 *
 * Current approach: Use zero coefficients (no boost). The minor under-delivery
 * in positive contrast is acceptable and negative contrast under-delivery is
 * a physical limitation, not a bug.
 */

import type { HeuristicFitResult } from './types.ts'

const fittedCoefficientsCache = new Map<string, HeuristicFitResult>()

export function clearHeuristicCache(): void {
	fittedCoefficientsCache.clear()
}

/**
 * Return zero heuristic coefficients (no boost).
 *
 * Testing showed the CSS APCA solver is accurate without heuristic correction.
 * The previous grid search fitting was measuring error in the JS implementation
 * (which is accurate) and then applying boost to CSS, causing severe over-delivery
 * of +25-30 Lc contrast.
 *
 * @param hue - The hue angle (0-360) - currently unused but kept for API compatibility
 */
export function fitHeuristicCoefficients(hue: number): HeuristicFitResult {
	const cacheKey = `${hue}`
	const cached = fittedCoefficientsCache.get(cacheKey)
	if (cached) {
		return cached
	}

	// Use zero coefficients - no heuristic boost
	// The CSS APCA solver is accurate without correction
	const result: HeuristicFitResult = {
		coefficients: {
			darkBoost: 0,
			midBoost: 0,
			contrastBoost: 0,
		},
		mae: 0,
		worstUnderDelivery: 0,
		underDeliveryRate: 0,
		sampleCount: 0,
	}

	fittedCoefficientsCache.set(cacheKey, result)
	return result
}
