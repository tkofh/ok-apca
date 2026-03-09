import type { CalcExpression } from '@ok-apca/calc-tree'
import * as ct from '@ok-apca/calc-tree'
import type { GamutSlice } from './color.ts'

// =============================================================================
// OKLab → CIE Y Conversion
// =============================================================================

/**
 * CIE Y extraction weights for each LMS cone channel.
 * Second row of the LMS→XYZ matrix (recalculated D65, from colorjs.io).
 */
const Y_FROM_L = -0.0405757452148008
const Y_FROM_M = 1.112286803280317
const Y_FROM_S = -0.0717110580655164

/**
 * OKLab→LMS' chroma coefficients for each cone channel.
 * Each cone's response to chroma is: k_i = KA_i·cos(hue) + KB_i·sin(hue).
 * The lightness coefficient is implicitly 1 for all channels.
 */
const L_PRIME_KA = 0.3963377773761749
const L_PRIME_KB = 0.2158037573099136
const M_PRIME_KA = -0.1055613458156586
const M_PRIME_KB = -0.0638541728258133
const S_PRIME_KA = -0.0894841775298119
const S_PRIME_KB = -1.2914855480194092

export interface HueYCoefficients {
	readonly a: number
	readonly b: number
	readonly d: number
}

/**
 * Compute hue-dependent polynomial coefficients for the exact Y formula:
 *
 *   Y = L³ + A·L²·C + B·L·C² + D·C³
 *
 * where L is OKLCH lightness and C is OKLCH chroma. For achromatic colors
 * (C=0), this reduces to Y = L³. The coefficients A, B, D capture how
 * chroma and hue affect luminance through the OKLab matrix transforms.
 */
export function hueYCoefficients(hue: number): HueYCoefficients {
	const hRad = (hue * Math.PI) / 180
	const alpha = Math.cos(hRad)
	const beta = Math.sin(hRad)

	// k values: contribution of chroma to each LMS' channel
	const kL = L_PRIME_KA * alpha + L_PRIME_KB * beta
	const kM = M_PRIME_KA * alpha + M_PRIME_KB * beta
	const kS = S_PRIME_KA * alpha + S_PRIME_KB * beta

	// Expanding Y = Σ cᵢ(L + kᵢC)³ gives: L³ + 3(Σcᵢkᵢ)L²C + 3(Σcᵢkᵢ²)LC² + (Σcᵢkᵢ³)C³
	return {
		a: 3 * (Y_FROM_L * kL + Y_FROM_M * kM + Y_FROM_S * kS),
		b: 3 * (Y_FROM_L * kL * kL + Y_FROM_M * kM * kM + Y_FROM_S * kS * kS),
		d: Y_FROM_L * kL ** 3 + Y_FROM_M * kM ** 3 + Y_FROM_S * kS ** 3,
	}
}

// =============================================================================
// Expression Trees
// =============================================================================

/**
 * Exact CIE Y from OKLCH lightness and chroma at a fixed hue.
 *
 * Y = L³ + A·L²·C + B·L·C² + D·C³
 *
 * Coefficients A, B, D are derived from the OKLab→XYZ matrices and depend
 * only on hue (precomputed at build time). For achromatic colors (C=0),
 * this reduces to Y = L³.
 */
export const exactY: CalcExpression<'lightness' | 'yChroma' | 'yCoeffA' | 'yCoeffB' | 'yCoeffD'> =
	ct.add(
		ct.pow('lightness', 3),
		ct.multiply('yCoeffA', ct.multiply(ct.pow('lightness', 2), 'yChroma')),
		ct.multiply('yCoeffB', ct.multiply('lightness', ct.pow('yChroma', 2))),
		ct.multiply('yCoeffD', ct.pow('yChroma', 3)),
	)

// --- Y correction factor ---
//
// On the left half of the gamut tent, C is proportional to L:
//   C = (apexC / apexL) · L · chromaRatio = k · L
//
// Substituting into Y = L³ + A·L²·C + B·L·C² + D·C³:
//   Y = L³ · (1 + A·k + B·k² + D·k³) = L³ · f
//
// where f depends only on hue and the ratio k = C/L (not on L itself).
// This means:
//   Forward:  Y = pow(L, 3) · f
//   Inverse:  L = pow(Y / f, 1/3)
//
// For the inverse, we compute f using k = C_approx / L_approx, where
// L_approx = Y^(1/3) and C_approx = maxChroma(L_approx) · chromaRatio.
// This handles both left-half (exact) and right-half (good approximation,
// since chroma decreases toward white making the correction smaller).

/**
 * Y correction factor: f = 1 + A·k + B·k² + D·k³
 *
 * where k = C/L (the chroma-to-lightness ratio at a given point).
 * Multiply by L³ to get Y, or divide Y by f before taking the cube root to get L.
 */
export const yCorrectionFactor: CalcExpression<'yCorrectionK' | 'yCoeffA' | 'yCoeffB' | 'yCoeffD'> =
	ct.add(
		1,
		ct.multiply('yCoeffA', 'yCorrectionK'),
		ct.multiply('yCoeffB', ct.pow('yCorrectionK', 2)),
		ct.multiply('yCoeffD', ct.pow('yCorrectionK', 3)),
	)

// =============================================================================
// CSS Generation Helpers
// =============================================================================

/**
 * Precompute the k-polynomial coefficients for the Y correction factor.
 * k = (apexC / apexL) · chromaRatio, so the polynomial 1 + A·k + B·k² + D·k³
 * becomes 1 + fA·chroma + fB·chroma² + fD·chroma³ with precomputed fA, fB, fD.
 */
export function correctionCoeffs(slice: GamutSlice, coeffs: HueYCoefficients) {
	const kScale = slice.apex.chroma / slice.apex.lightness
	return {
		fA: coeffs.a * kScale,
		fB: coeffs.b * kScale ** 2,
		fD: coeffs.d * kScale ** 3,
	}
}
