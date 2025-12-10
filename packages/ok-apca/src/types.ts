export type ContrastMode = 'force-light' | 'prefer-light' | 'prefer-dark' | 'force-dark'

export interface ContrastOptions {
	readonly modes: ContrastMode[]
	readonly selector?: string
}

export interface ColorGeneratorOptions {
	readonly hue: number
	readonly selector: string
	readonly contrast?: ContrastOptions
}

export interface GamutBoundary {
	readonly lMax: number
	readonly cPeak: number
}

export interface YConversionCoefficients {
	readonly yc0Coef: number
	readonly yc1Coef: number
	readonly yc2Coef: number
}
