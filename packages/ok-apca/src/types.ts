export type ContrastMode = 'force-light' | 'prefer-light' | 'prefer-dark' | 'force-dark'

export interface ContrastOptions {
	readonly mode: ContrastMode
	readonly selector?: string
	/**
	 * Apply polynomial error correction to reduce CSS approximation error.
	 *
	 * - `true` (default): Automatically compute correction coefficients
	 * - `false`: Disable correction
	 * - `CorrectionCoefficients`: Use pre-computed coefficients
	 */
	readonly correction?: boolean | CorrectionCoefficients
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

/**
 * Polynomial correction coefficients for reducing CSS approximation error.
 *
 * The correction is applied to the contrast lightness:
 *   corrected_L = L - (a + b*baseL + c*L + d*baseL*L + e*baseL² + f*L²)
 *
 * These coefficients are computed at build time by fitting the error
 * between CSS-matching and precise implementations across the L×contrast space.
 */
export interface CorrectionCoefficients {
	readonly a: number // constant term
	readonly b: number // baseL coefficient
	readonly c: number // targetL coefficient
	readonly d: number // baseL*targetL coefficient
	readonly e: number // baseL² coefficient
	readonly f: number // targetL² coefficient
}
