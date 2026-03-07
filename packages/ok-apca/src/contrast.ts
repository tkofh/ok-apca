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
} from './expressions.ts'
import { clampNumber } from './util.ts'

/**
 * Compute contrast color achieving target APCA Lc value.
 * Positive contrast = lighter text, negative = darker text.
 *
 * @param color - The base color to compute contrast from
 * @param signedContrast - Signed contrast value (-108 to 108)
 * @param invert - Whether to enable automatic polarity inversion (default: true)
 *
 * When inversion is enabled (default), the solver computes both polarity solutions
 * and selects the one that achieves higher absolute contrast. The signed contrast
 * value acts as a preference that breaks ties when both directions achieve equal contrast.
 */
export function computeContrastColor(
	color: ColorInput,
	signedContrast: number,
	invert = true,
): Color {
	const { hue, lightness, chroma } = gamutMap(color)
	const Y = lightness ** 3
	const clampedContrast = clampNumber(-108, signedContrast, 108)

	let targetY: number
	if (invert) {
		const x = Math.abs(clampedContrast) / 100
		const yLight = clampNumber(0, reversePolarity.solve({ yBg: Y, x }), 1)
		const yDark = clampNumber(0, normalPolarity.solve({ yBg: Y, x }), 1)
		targetY = contrastSolverWithInversion.solve({
			yBg: Y,
			contrast: clampedContrast / 100,
			yLight,
			yDark,
			lcLight: contrastMeasurementReverse.solve({ yBg: Y, yFg: yLight }),
			lcDark: contrastMeasurementNormal.solve({ yBg: Y, yFg: yDark }),
		})
	} else {
		targetY = contrastSolver.solve({
			yBg: Y,
			contrast: clampedContrast / 100,
		})
	}

	const targetLightness = clampNumber(0, targetY ** (1 / 3), 1)

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
