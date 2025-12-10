export type ContrastMode = 'force-light' | 'prefer-light' | 'prefer-dark' | 'force-dark'

export interface ContrastOptions {
	modes: ContrastMode[]
	selector?: string
}

export interface ColorGeneratorOptions {
	hue: number
	selector: string
	contrast?: ContrastOptions
}

export interface GamutBoundary {
	lMax: number
	cPeak: number
}

export interface YConversionCoefficients {
	yc0Coef: number
	yc1Coef: number
	yc2Coef: number
}
