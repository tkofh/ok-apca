/**
 * APCA contrast measurement.
 * Matches Chrome DevTools implementation.
 */

import { getLuminance } from './color.ts'
import {
	APCA_BG_EXP_NORMAL,
	APCA_BG_EXP_REVERSE,
	APCA_FG_EXP_NORMAL,
	APCA_FG_EXP_REVERSE,
	APCA_OFFSET,
	APCA_SCALE,
	APCA_SMOOTH_THRESHOLD,
} from './constants.ts'
import type { Color } from './types.ts'

/**
 * APCA 0.0.98G constants (W3 version)
 * Constants shared with contrast generation are imported from constants.ts.
 * The following are specific to measurement only.
 */

// Black level soft clamp factor
// biome-ignore lint/suspicious/noApproximativeNumericConstant: w3 spec uses 1.414
const BLACK_CLAMP = 1.414

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
	txtY = txtY > APCA_SMOOTH_THRESHOLD ? txtY : txtY + (APCA_SMOOTH_THRESHOLD - txtY) ** BLACK_CLAMP
	bgY = bgY > APCA_SMOOTH_THRESHOLD ? bgY : bgY + (APCA_SMOOTH_THRESHOLD - bgY) ** BLACK_CLAMP

	// Return 0 for extremely low delta Y
	if (Math.abs(bgY - txtY) < DELTA_Y_MIN) {
		return 0
	}

	let outputContrast: number

	if (bgY > txtY) {
		// Normal polarity: dark text on light background (BoW)
		const sapc = (bgY ** APCA_BG_EXP_NORMAL - txtY ** APCA_FG_EXP_NORMAL) * APCA_SCALE
		outputContrast = sapc < LOW_CLIP ? 0 : sapc - APCA_OFFSET
	} else {
		// Reverse polarity: light text on dark background (WoB)
		const sapc = (bgY ** APCA_BG_EXP_REVERSE - txtY ** APCA_FG_EXP_REVERSE) * APCA_SCALE
		outputContrast = sapc > -LOW_CLIP ? 0 : sapc + APCA_OFFSET
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
