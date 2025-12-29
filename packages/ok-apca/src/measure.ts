/**
 * APCA contrast measurement.
 * Matches Chrome DevTools implementation.
 */
import { type Color, getLuminance } from './color.ts'

/**
 * APCA 0.0.98G constants (W3 version)
 */

// Exponents for normal polarity (dark text on light background)
const EXP_NORMAL_BACKGROUND = 0.56
const EXP_NORMAL_TEXT = 0.57

// Exponents for reverse polarity (light text on dark background)
const EXP_REVERSE_BACKGROUND = 0.65
const EXP_REVERSE_TEXT = 0.62

// Black level soft clamp threshold and clamp factor
// biome-ignore lint/suspicious/noApproximativeNumericConstant: w3 spec uses 1.414
const BLACK_CLAMP = 1.414
const BLACK_THRESHOLD = 0.022

// Scale factors for contrast calculation
const SCALE_BLACK_ON_WHITE = 1.14
const SCALE_WHITE_ON_BLACK = 1.14

// Low contrast offsets
const OFFSET_BLACK_ON_WHITE = 0.027
const OFFSET_WHITE_ON_BLACK = 0.027

// Minimum delta Y to avoid division issues
const DELTA_Y_MIN = 0.0005

// Low contrast clipping threshold
const LOW_CLIP = 0.1

/**
 * Calculate APCA contrast from Y (luminance) values.
 * Based on APCA 0.1.9 W3 implementation.
 *
 * @param txtY - Text color Y luminance (0-1)
 * @param bgY - Background color Y luminance (0-1)
 * @returns Signed Lc contrast value (positive = dark on light, negative = light on dark)
 */
function calculateAPCAcontrast(txtY: number, bgY: number): number {
	// Input validation
	if (
		!(Number.isFinite(txtY) && Number.isFinite(bgY)) ||
		Math.min(txtY, bgY) < 0 ||
		Math.max(txtY, bgY) > 1.1
	) {
		return 0
	}

	// Soft clamp black levels
	txtY = txtY > BLACK_THRESHOLD ? txtY : txtY + (BLACK_THRESHOLD - txtY) ** BLACK_CLAMP
	bgY = bgY > BLACK_THRESHOLD ? bgY : bgY + (BLACK_THRESHOLD - bgY) ** BLACK_CLAMP

	// Return 0 for extremely low delta Y
	if (Math.abs(bgY - txtY) < DELTA_Y_MIN) {
		return 0
	}

	let outputContrast: number

	if (bgY > txtY) {
		// Normal polarity: dark text on light background (BoW)
		const sapc = (bgY ** EXP_NORMAL_BACKGROUND - txtY ** EXP_NORMAL_TEXT) * SCALE_BLACK_ON_WHITE
		outputContrast = sapc < LOW_CLIP ? 0 : sapc - OFFSET_BLACK_ON_WHITE
	} else {
		// Reverse polarity: light text on dark background (WoB)
		const sapc = (bgY ** EXP_REVERSE_BACKGROUND - txtY ** EXP_REVERSE_TEXT) * SCALE_WHITE_ON_BLACK
		outputContrast = sapc > -LOW_CLIP ? 0 : sapc + OFFSET_WHITE_ON_BLACK
	}

	return outputContrast * 100
}

/**
 * Measure APCA contrast between colors.
 * Returns signed Lc value: positive = dark on light, negative = light on dark.
 */
export function measureContrast(baseColor: Color, contrastColor: Color): number {
	const bgY = getLuminance(baseColor)
	const fgY = getLuminance(contrastColor)
	return calculateAPCAcontrast(fgY, bgY)
}
