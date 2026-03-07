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
 *
 * Uses the same expression trees as CSS generation, ensuring parity between
 * JS measurement and generated CSS output.
 */
export function measureContrast(baseColor: ColorInput, contrastColor: ColorInput): number {
	const bgY = getLuminance({ space: OKLCH, coords: toColor(baseColor).coords() })
	const fgY = getLuminance({ space: OKLCH, coords: toColor(contrastColor).coords() })

	if (
		!(Number.isFinite(fgY) && Number.isFinite(bgY)) ||
		Math.min(fgY, bgY) < 0 ||
		Math.max(fgY, bgY) > 1.1
	) {
		return 0
	}

	if (bgY >= fgY) {
		return contrastMeasurementNormal.solve({ yBg: bgY, yFg: fgY }) * 100
	}
	return -contrastMeasurementReverse.solve({ yBg: bgY, yFg: fgY }) * 100
}

/**
 * Compute contrast color achieving target APCA Lc value.
 * Positive contrast = lighter text, negative = darker text.
 *
 * @param color - The base color to compute contrast from
 * @param contrast - Signed contrast value (-108 to 108)
 * @param invert - Whether to enable automatic polarity inversion (default: true)
 *
 * When inversion is enabled (default), the solver computes both polarity solutions
 * and selects the one that achieves higher absolute contrast. The signed contrast
 * value acts as a preference that breaks ties when both directions achieve equal contrast.
 */
export function computeContrastColor(color: ColorInput, contrast: number, invert = true): Color {
	const { hue, lightness, chroma } = gamutMap(color)
	const Y = lightness ** 3
	const clampedContrast = clampNumber(-108, contrast, 108)

	let targetY: number
	if (invert) {
		const contrastMagnitude = Math.abs(clampedContrast) / 100
		targetY = contrastSolverWithInversion
			.bind({
				lcDark: contrastMeasurementReverse.bind({ yFg: yLightRef }),
				lcLight: contrastMeasurementNormal.bind({ yFg: yDarkRef }),
			})
			.solve({
				yBg: Y,
				contrast: clampedContrast / 100,
				yLight: clampNumber(0, reversePolarity.solve({ yBg: Y, contrastMagnitude }), 1),
				yDark: clampNumber(0, normalPolarity.solve({ yBg: Y, contrastMagnitude }), 1),
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
