/**
 * Shared type definitions for ok-apca.
 */

/**
 * Options for contrast color generation in CSS output.
 */
export interface ContrastOptions {
	/** Allow polarity inversion if preferred polarity is out of gamut */
	readonly allowPolarityInversion: boolean
	/**
	 * CSS selector for the contrast variant.
	 * Use `&` prefix for nesting (e.g., `'&.contrast'`).
	 * @default '&.contrast'
	 */
	readonly selector?: string
}

/**
 * Options for generating CSS color definitions.
 */
export interface ColorGeneratorOptions {
	/** Hue angle in degrees (0-360) */
	readonly hue: number
	/** CSS selector for the generated styles */
	readonly selector: string
	/** Optional contrast color configuration */
	readonly contrast?: ContrastOptions
}

/**
 * Display P3 gamut boundary parameters for a specific hue.
 *
 * The gamut boundary is approximated using a tent function:
 * maximum chroma occurs at `lMax` and decreases linearly to 0
 * at both L=0 and L=1.
 */
export interface GamutBoundary {
	/** Lightness (0-1) where peak chroma occurs */
	readonly lMax: number
	/** Maximum chroma value at lMax */
	readonly cPeak: number
}

/**
 * Hue-dependent coefficients for OKLCH L → CIE Y conversion.
 *
 * These coefficients are used in the polynomial:
 *   Y = yc0Coef·C³ + yc1Coef·C²·L + yc2Coef·C·L² + L³
 *
 * where C is chroma and L is lightness.
 */
export interface YConversionCoefficients {
	/** Coefficient for C³ term */
	readonly yc0Coef: number
	/** Coefficient for C²·L term */
	readonly yc1Coef: number
	/** Coefficient for C·L² term */
	readonly yc2Coef: number
}
