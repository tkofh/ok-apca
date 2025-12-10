/**
 * APCA contrast measurement functions.
 *
 * These functions compute APCA contrast values using the standard apca-w3 library,
 * matching what browsers like Chrome DevTools use.
 *
 * This is useful for measuring the actual contrast that computed colors achieve
 * when rendered.
 */

import { APCAcontrast, sRGBtoY } from 'apca-w3'
import _Color from 'colorjs.io'
import type { Color } from './color.ts'

/**
 * Compute the CIE Y luminance of an OKLCH color using apca-w3.
 */
function oklchToY(color: Color): number {
	const c = new _Color('oklch', [color.lightness, color.chroma, color.hue])
	const rgb = c.to('srgb')

	// Clamp to sRGB gamut and scale to 0-255 for apca-w3
	const r = Math.max(0, Math.min(255, Math.round(rgb.coords[0] * 255)))
	const g = Math.max(0, Math.min(255, Math.round(rgb.coords[1] * 255)))
	const b = Math.max(0, Math.min(255, Math.round(rgb.coords[2] * 255)))

	return sRGBtoY([r, g, b])
}

/**
 * Measure the APCA contrast between a base color and its computed contrast color.
 *
 * This uses the same algorithm as Chrome DevTools, computing luminance from
 * the actual sRGB values that would be displayed.
 *
 * Returns a signed value:
 * - Positive: dark text on light background
 * - Negative: light text on dark background
 *
 * The absolute value represents the contrast level (0-108 scale).
 *
 * @param baseColor - The background/base OKLCH color
 * @param contrastColor - The foreground/contrast OKLCH color
 * @returns The APCA Lc value (signed, absolute value is 0-108)
 */
export function measureContrast(baseColor: Color, contrastColor: Color): number {
	const bgY = oklchToY(baseColor)
	const fgY = oklchToY(contrastColor)
	// APCAcontrast can return string in some modes, ensure we return a number
	return Number(APCAcontrast(fgY, bgY))
}
