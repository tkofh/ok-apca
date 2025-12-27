/**
 * APCA contrast measurement using apca-w3 library.
 * Matches Chrome DevTools implementation.
 */

import { APCAcontrast, sRGBtoY } from 'apca-w3'
import _Color from 'colorjs.io'
import type { Color } from './color.ts'

function oklchToY(color: Color): number {
	const c = new _Color('oklch', [color.lightness, color.chroma, color.hue])
	const rgb = c.to('srgb')

	const r = Math.max(0, Math.min(255, Math.round(rgb.coords[0] * 255)))
	const g = Math.max(0, Math.min(255, Math.round(rgb.coords[1] * 255)))
	const b = Math.max(0, Math.min(255, Math.round(rgb.coords[2] * 255)))

	return sRGBtoY([r, g, b])
}

/**
 * Measure APCA contrast between colors.
 * Returns signed Lc value: positive = dark on light, negative = light on dark.
 */
export function measureContrast(baseColor: Color, contrastColor: Color): number {
	const bgY = oklchToY(baseColor)
	const fgY = oklchToY(contrastColor)
	return Number(APCAcontrast(fgY, bgY))
}
