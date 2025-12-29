/**
 * Shared type definitions for ok-apca.
 */

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
