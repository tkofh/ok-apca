/**
 * APCA contrast measurement.
 * Matches Chrome DevTools implementation.
 */

import { type ColorInput, toColor } from './color.ts'
import {
	APCA_BG_EXP_NORMAL,
	APCA_BG_EXP_REVERSE,
	APCA_FG_EXP_NORMAL,
	APCA_FG_EXP_REVERSE,
	APCA_OFFSET,
	APCA_SCALE,
	APCA_SMOOTH_THRESHOLD,
} from './constants.ts'

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
 * Measure APCA contrast between colors.
 * Returns signed Lc value: positive = dark on light, negative = light on dark.
 */
export function measureContrast(baseColor: ColorInput, contrastColor: ColorInput): number {
	let bgY = toColor(baseColor).luminance
	let fgY = toColor(contrastColor).luminance

	// Input validation
	if (
		!(Number.isFinite(fgY) && Number.isFinite(bgY)) ||
		Math.min(fgY, bgY) < 0 ||
		Math.max(fgY, bgY) > 1.1
	) {
		return 0
	}

	// Soft clamp black levels
	fgY = fgY > APCA_SMOOTH_THRESHOLD ? fgY : fgY + (APCA_SMOOTH_THRESHOLD - fgY) ** BLACK_CLAMP
	bgY = bgY > APCA_SMOOTH_THRESHOLD ? bgY : bgY + (APCA_SMOOTH_THRESHOLD - bgY) ** BLACK_CLAMP

	// Return 0 for extremely low delta Y
	if (Math.abs(bgY - fgY) < DELTA_Y_MIN) {
		return 0
	}

	let outputContrast: number

	if (bgY > fgY) {
		// Normal polarity: dark text on light background (BoW)
		const sapc = (bgY ** APCA_BG_EXP_NORMAL - fgY ** APCA_FG_EXP_NORMAL) * APCA_SCALE
		outputContrast = sapc < LOW_CLIP ? 0 : sapc - APCA_OFFSET
	} else {
		// Reverse polarity: light text on dark background (WoB)
		const sapc = (bgY ** APCA_BG_EXP_REVERSE - fgY ** APCA_FG_EXP_REVERSE) * APCA_SCALE
		outputContrast = sapc > -LOW_CLIP ? 0 : sapc + APCA_OFFSET
	}

	return outputContrast * 100
}
