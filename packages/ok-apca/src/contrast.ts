import { clamp } from '@ok-apca/calc-tree'
import {
	contrastMeasurementNormal,
	contrastMeasurementReverse,
	contrastSolver,
	contrastSolverWithInversion,
	normalPolarity,
	reversePolarity,
	softClampApprox,
	softUnclamp,
	trueSoftClamp,
} from './apca.ts'
import { type Color, createColor, getLuminance } from './color.ts'
import {
	APCA_BG_EXP_NORMAL,
	APCA_BG_EXP_REVERSE,
	APCA_FG_EXP_NORMAL,
	APCA_FG_EXP_REVERSE,
	APCA_OFFSET,
	APCA_SCALE,
} from './constants.ts'
import { computeHueData, computeMaxChroma, exactY, gamutMap } from './gamut.ts'
import { clampNumber } from './util.ts'

/**
 * Measure APCA contrast between colors.
 * Returns signed Lc value: positive = dark on light, negative = light on dark.
 * Range: -1.08 to 1.08.
 *
 * By default uses the true APCA soft black clamp for accurate reference values.
 * Pass `approximate: true` to use the Lp-norm approximation matching the
 * generated CSS expressions.
 */
export function measureContrast(
	baseColor: Color,
	contrastColor: Color,
	{ approximate = false }: { approximate?: boolean } = {},
): number {
	const base = createColor(baseColor)
	const fg = createColor(contrastColor)
	const yBg = getLuminance(base)
	const yFg = getLuminance(fg)

	if (
		!(Number.isFinite(yFg) && Number.isFinite(yBg)) ||
		Math.min(yFg, yBg) < 0 ||
		Math.max(yFg, yBg) > 1.1
	) {
		return 0
	}

	if (approximate) {
		// Use expression trees directly to ensure alignment with the CSS implementation
		if (yBg >= yFg) {
			return contrastMeasurementNormal.solve({ yBg, yFg })
		}
		return -contrastMeasurementReverse.solve({ yBg, yFg })
	}

	const scBg = trueSoftClamp.solve({ y: yBg })
	const scFg = trueSoftClamp.solve({ y: yFg })

	if (yBg >= yFg) {
		return Math.max(
			0,
			APCA_SCALE * (scBg ** APCA_BG_EXP_NORMAL - scFg ** APCA_FG_EXP_NORMAL) - APCA_OFFSET,
		)
	}
	return -Math.max(
		0,
		APCA_SCALE * (scFg ** APCA_FG_EXP_REVERSE - scBg ** APCA_BG_EXP_REVERSE) - APCA_OFFSET,
	)
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
export function computeContrastColor(color: Color, contrast: number, invert = true): Color {
	const { hue, lightness, chroma } = gamutMap(color)
	const hueData = computeHueData(hue)
	const maxChromaAtBase = computeMaxChroma(lightness, hueData)
	const chromaRatio = maxChromaAtBase > 0 ? clampNumber(0, chroma / maxChromaAtBase, 1) : 0

	// Exact Y using OKLab polynomial (replaces lightness³ approximation)
	const Y = exactY.bind(hueData).solve({ lightness, yChroma: chroma })

	const clampedContrast = clampNumber(-1.08, contrast, 1.08)
	const scY = softClampApprox.solve({ y: Y })

	const ySolver = invert
		? contrastSolverWithInversion
				.bind({
					// Measurement uses original Y (Lp-norm clamp is inside the expression)
					lcLight: contrastMeasurementReverse.bind({ yBg: Y, yFg: 'yLight' }),
					lcDark: contrastMeasurementNormal.bind({ yBg: Y, yFg: 'yDark' }),
				})
				.bind({
					// Unclamped Y values for selection
					yLight: softUnclamp.bind({ y: 'yLightRaw' }),
					yDark: softUnclamp.bind({ y: 'yDarkRaw' }),
				})
				.bind({
					// Raw clamped values in soft-clamp domain (used for exhaustion detection)
					yLightRaw: clamp(0, reversePolarity.bind({ yBg: scY }), 1),
					yDarkRaw: clamp(0, normalPolarity.bind({ yBg: scY }), 1),
				})
				.solve({
					// Remaining yBg is for the zero-contrast fallback
					yBg: Y,
					contrast: clampedContrast,
				})
		: softUnclamp.solve({
				y: contrastSolver.solve({
					yBg: scY,
					contrast: clampedContrast,
				}),
			})

	// f-correction inverse: Y → L using approximate chroma
	const lApprox = clampNumber(0, ySolver ** (1 / 3), 1)
	const cApprox = computeMaxChroma(lApprox, hueData) * chromaRatio
	const kOut = lApprox > 0 ? cApprox / lApprox : 0
	const fOut =
		1 + hueData.yCoeffA * kOut + hueData.yCoeffB * kOut ** 2 + hueData.yCoeffD * kOut ** 3
	const targetLightness = clampNumber(0, (ySolver / fOut) ** (1 / 3), 1)

	return createColor({
		lightness: targetLightness,
		chroma: computeMaxChroma(targetLightness, hueData) * chromaRatio,
		hue,
	})
}
