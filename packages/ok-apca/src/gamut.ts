import Color from 'colorjs.io'

/**
 * Find the sRGB gamut boundary for a given hue by sampling lightness values
 * and finding the maximum in-gamut chroma at each lightness.
 */
export function findGamutBoundary(hue: number) {
	const samples = 1000
	let maxChroma = 0
	let lightnessAtMaxChroma = 0

	for (let i = 0; i <= samples; i++) {
		const l = i / samples
		const c = findMaxChromaAtLightness(hue, l)

		if (c > maxChroma) {
			maxChroma = c
			lightnessAtMaxChroma = l
		}
	}

	return {
		lMax: lightnessAtMaxChroma,
		cPeak: maxChroma,
	}
}

/**
 * Binary search to find the maximum chroma that stays within sRGB gamut
 * for a given lightness and hue.
 */
function findMaxChromaAtLightness(hue: number, lightness: number) {
	let low = 0
	let high = 0.4
	const tolerance = 0.0001

	while (high - low > tolerance) {
		const mid = (low + high) / 2
		const color = new Color('oklch', [lightness, mid, hue])

		if (color.inGamut('srgb')) {
			low = mid
		} else {
			high = mid
		}
	}

	return low
}

/**
 * Compute the Y-conversion coefficients for oklch L to luminance Y.
 *
 * The relationship between oklch L and Y depends on the chroma and hue.
 * For a fixed hue, we can pre-compute coefficients that express how
 * chroma affects the L→Y conversion.
 *
 * The full formula is:
 * Y = yc0 + yc1*L + yc2*L² + L³
 *
 * where yc0, yc1, yc2 are polynomials in chroma with hue-dependent coefficients.
 */
export function computeYConversionCoefficients(hue: number) {
	const hRad = (hue * Math.PI) / 180
	const cosH = Math.cos(hRad)
	const sinH = Math.sin(hRad)

	// OKLab to LMS matrix coefficients for the L component contribution from a,b
	// These come from the oklab→lms matrix inverse
	const aCoef = 0.3963377773761749 * cosH + 0.2158037573099136 * sinH
	const bCoef = -0.1055613458156586 * cosH + -0.0638541728258133 * sinH
	const cCoef = -0.0894841775298119 * cosH + -1.2914855480194092 * sinH

	// LMS to XYZ Y-row coefficients (for computing luminance)
	const yFromL = -0.04077452336091804
	const yFromM = 1.1124921587493157
	const yFromS = -0.07171763538839791

	// The coefficients for how chroma affects Y
	// yc0 = sum of (y_coef * (chroma_direction)^3) terms → coefficient for c^3
	// yc1 = sum of (y_coef * (chroma_direction)^2) terms → coefficient for c^2
	// yc2 = sum of (y_coef * (chroma_direction)) terms → coefficient for c
	const yc0Coef = yFromL * aCoef ** 3 + yFromM * bCoef ** 3 + yFromS * cCoef ** 3
	const yc1Coef = yFromL * aCoef ** 2 + yFromM * bCoef ** 2 + yFromS * cCoef ** 2
	const yc2Coef = yFromL * aCoef + yFromM * bCoef + yFromS * cCoef

	return { yc0Coef, yc1Coef, yc2Coef }
}
