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

export interface GamutBoundary {
	readonly lMax: number
	readonly cPeak: number
}
