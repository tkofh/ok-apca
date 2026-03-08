import { clamp } from '@ok-apca/calc-tree'
import { getLuminance, OKLCH } from 'colorjs.io/fn'
import {
	type Color,
	type ColorInput,
	computeMaxChroma,
	findGamutSlice,
	gamutMap,
	toColor,
} from './color.ts'
import {
	contrastMeasurementNormal,
	contrastMeasurementReverse,
	contrastSolver,
	contrastSolverWithInversion,
	normalPolarity,
	reversePolarity,
	yDarkRef,
	yLightRef,
} from './expressions.ts'
import { clampNumber } from './util.ts'

/**
 * Measure APCA contrast between colors.
 * Returns signed Lc value: positive = dark on light, negative = light on dark.
 * Range: -1.08 to 1.08.
 */
export function measureContrast(baseColor: ColorInput, contrastColor: ColorInput): number {
	const yBg = getLuminance({ space: OKLCH, coords: toColor(baseColor).coords() })
	const yFg = getLuminance({ space: OKLCH, coords: toColor(contrastColor).coords() })

	if (
		!(Number.isFinite(yFg) && Number.isFinite(yBg)) ||
		Math.min(yFg, yBg) < 0 ||
		Math.max(yFg, yBg) > 1.1
	) {
		return 0
	}

	return yBg >= yFg
		? contrastMeasurementNormal.solve({ yBg, yFg })
		: -contrastMeasurementReverse.solve({ yBg, yFg })
}

/**
 * Compute contrast color achieving target APCA Lc value.
 * Positive contrast = lighter text, negative = darker text.
 *
 * @param color - The base color to compute contrast from
 * @param contrast - Signed contrast value (-1.08 to 1.08)
 * @param invert - Whether to enable automatic polarity inversion (default: true)
 *
 * When inversion is enabled (default), the solver computes both polarity solutions
 * and selects the one that achieves higher absolute contrast. The signed contrast
 * value acts as a preference that breaks ties when both directions achieve equal contrast.
 */
export function computeContrastColor(color: ColorInput, contrast: number, invert = true): Color {
	const { hue, lightness, chroma } = gamutMap(color)
	const Y = lightness ** 3
	const clampedContrast = clampNumber(-1.08, contrast, 1.08)

	const targetLightness = clampNumber(
		0,
		(invert
			? contrastSolverWithInversion
					.bind({
						lcLight: contrastMeasurementReverse.bind({ yFg: yLightRef }),
						lcDark: contrastMeasurementNormal.bind({ yFg: yDarkRef }),
					})
					.bind({
						yLight: clamp(0, reversePolarity, 1),
						yDark: clamp(0, normalPolarity, 1),
					})
					.solve({
						yBg: Y,
						contrast: clampedContrast,
						contrastMagnitude: Math.abs(clampedContrast),
					})
			: contrastSolver.solve({
					yBg: Y,
					contrast: clampedContrast,
				})) **
			(1 / 3),
		1,
	)

	// Preserve chroma percentage from base lightness to contrast lightness
	// Use gamut-mapped chroma to compute percentage (matching CSS behavior)
	const slice = findGamutSlice(hue)
	const maxChromaAtBase = computeMaxChroma(lightness, slice)

	return toColor({
		lightness: targetLightness,
		chroma:
			computeMaxChroma(targetLightness, slice) *
			(maxChromaAtBase > 0 ? clampNumber(0, chroma / maxChromaAtBase, 1) : 0),
		hue,
	})
}
