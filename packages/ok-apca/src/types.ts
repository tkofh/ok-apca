/**
 * Shared type definitions for ok-apca.
 */

export interface Color {
	readonly hue: number
	readonly chroma: number
	readonly lightness: number
}

interface ContrastColorDefinition {
	readonly label: string
}

export interface ColorGeneratorOptions {
	readonly hue: number
	readonly selector: string
	readonly contrastColors?: readonly ContrastColorDefinition[]
	readonly prefix?: string
}

export interface GamutApex {
	readonly lightness: number
	readonly chroma: number
}

export interface GamutSlice {
	readonly apex: GamutApex
	/**
	 * Quadratic curvature correction for the right half of the tent.
	 * The actual gamut boundary curves inward from the linear tent approximation.
	 * Applied as: correctedChroma = linearChroma + curvature * t * (1 - t) * apexChroma
	 * where t = (L - apexL) / (1 - apexL) for the right half (L > apexL).
	 * Always negative (actual boundary is inside linear approximation).
	 */
	readonly curvature: number
}

export interface HeuristicCoefficients {
	readonly darkBoost: number
	readonly midBoost: number
	readonly contrastBoost: number
}

export interface HeuristicFitResult {
	readonly coefficients: HeuristicCoefficients
	readonly mae: number
	readonly worstUnderDelivery: number
	readonly underDeliveryRate: number
	readonly sampleCount: number
}
