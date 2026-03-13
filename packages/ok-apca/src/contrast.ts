import { Calc, Properties } from '@ok-apca/calc-tree'
import {
	APCA_BG_EXP_NORMAL,
	APCA_BG_EXP_REVERSE,
	APCA_FG_EXP_NORMAL,
	APCA_FG_EXP_REVERSE,
	APCA_OFFSET,
	APCA_SCALE,
	contrastMeasurementNormal,
	contrastMeasurementReverse,
	contrastSolver,
	normalPolarity,
	reversePolarity,
	softClampApprox,
	softUnclamp,
	trueSoftClamp,
} from './apca.ts'
import { type Color, createColor, getLuminance } from './color.ts'
import { computeGamutSlice, gamutMap } from './gamut.ts'
import { clampNumber } from './util.ts'

/**
 * Y-correction polynomial: 1 + fA·chroma + fB·chroma² + fD·chroma³
 *
 * Converts between OKLCH lightness and CIE Y using pre-scaled coefficients.
 * fA, fB, fD are hue-dependent and incorporate the gamut boundary slope
 * (apexC/apexL), so chroma here is the normalized ratio (0–1).
 */
const fCorrection: Calc.Expression<'chroma' | 'fA' | 'fB' | 'fD'> = Calc.add(
	1,
	Calc.multiply(Calc.ref('fA'), Calc.ref('chroma')),
	Calc.multiply(Calc.ref('fB'), Calc.pow(Calc.ref('chroma'), 2)),
	Calc.multiply(Calc.ref('fD'), Calc.pow(Calc.ref('chroma'), 3)),
)

/**
 * Y background: L³ · f(chroma)
 *
 * Computes CIE Y luminance from OKLCH lightness and chroma ratio.
 * Exact on the left half of the gamut tent where k = (apexC/apexL) · chromaRatio
 * is constant; close approximation on the right half.
 */
export const yBackground: Calc.Expression<'lightness' | 'chroma' | 'fA' | 'fB' | 'fD'> =
	Calc.multiply(Calc.pow(Calc.ref('lightness'), 3), fCorrection)

/**
 * Corrected lightness from target Y: L = pow(Y / f(chroma), 1/3)
 *
 * Applies the inverse Y-correction to recover OKLCH lightness from CIE Y.
 * Uses the same f-correction polynomial as yBackground, depending only on
 * the input chroma ratio (a leaf variable), not the solver output.
 */
const correctedLightness: Calc.Expression<'yTarget' | 'chroma' | 'fA' | 'fB' | 'fD'> = Calc.pow(
	Calc.divide(Calc.ref('yTarget'), fCorrection),
	1 / 3,
)

/**
 * Build contrast target lightness expression with optional polarity inversion.
 *
 * Computes both polarity solutions, measures achieved contrast for each,
 * and selects based on the `{label}-invertable` ref:
 * - `1`: picks whichever direction achieves higher contrast
 * - `0`: always follows the contrast sign (no inversion)
 *
 * Uses two distinct Y_bg refs:
 * - `scYBg`: soft-clamped Y_bg for the polarity solvers (operates in clamped domain)
 * - `yBg`: original Y_bg for contrast measurement and zero-contrast fallback
 *
 * Unbound refs: `yBg`, `scYBg`, `{label}-invertable`, `contrast-{label}`, `chroma`, `fA`, `fB`, `fD`.
 */
export function contrastTargetLightness<const Label extends string>(
	label: Label,
): Calc.Expression<
	'yBg' | 'chroma' | 'fA' | 'fB' | 'fD' | 'scYBg' | `${Label}-invertable` | `contrast-${Label}`
> {
	const contrast = Calc.ref(`contrast-${label}` as const)

	// Raw solver outputs in soft-clamped domain
	const yLightRaw = Properties.number(
		`_ylr-${label}`,
		Calc.clamp(0, Calc.bind(reversePolarity, { yBg: Calc.ref('scYBg'), contrast }), 1),
	)
	const yDarkRaw = Properties.number(
		`_ydr-${label}`,
		Calc.clamp(0, Calc.bind(normalPolarity, { yBg: Calc.ref('scYBg'), contrast }), 1),
	)

	// Unclamp to recover actual Y values
	const yLight = Properties.number(`_yl-${label}`, Calc.bind(softUnclamp, { y: yLightRaw }))
	const yDark = Properties.number(`_yd-${label}`, Calc.bind(softUnclamp, { y: yDarkRaw }))

	// Solver uses original Y_bg for zero-contrast fallback
	const yTarget = Properties.number(
		`_yt-${label}`,
		Calc.bind(contrastSolver, {
			contrast,
			invertable: Calc.ref(`${label}-invertable` as const),
			yLight,
			yDark,
			yLightRaw,
			yDarkRaw,
			lcLight: Properties.number(
				`_lcl-${label}`,
				Calc.bind(contrastMeasurementReverse, { yFg: yLight }),
			),
			lcDark: Properties.number(
				`_lcd-${label}`,
				Calc.bind(contrastMeasurementNormal, { yFg: yDark }),
			),
		}),
	)

	return Properties.number(`_cl-${label}`, Calc.bind(correctedLightness, { yTarget }))
}

/**
 * Measure APCA contrast between two role colors.
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
			return Calc.solve(contrastMeasurementNormal, { yBg, yFg })
		}
		return -Calc.solve(contrastMeasurementReverse, { yBg, yFg })
	}

	const scBg = Calc.solve(trueSoftClamp, { y: yBg })
	const scFg = Calc.solve(trueSoftClamp, { y: yFg })

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
 * Compute a contrast color achieving target APCA Lc value relative to
 * an anchor role color.
 * Positive contrast = lighter result, negative = darker result.
 *
 * @param color - The anchor (active) role color
 * @param contrast - Signed contrast value (-1.08 to 1.08)
 * @param invert - Whether to enable automatic polarity inversion (default: true)
 *
 * Uses the shared expression trees to ensure parity with CSS generation.
 */
export function computeContrastColor(color: Color, contrast: number, invert = true): Color {
	const { hue, lightness, chroma } = gamutMap(color)
	const slice = computeGamutSlice(hue)
	const maxChromaAtBase = Calc.solve(slice.maxChroma, { lightness })
	const chromaRatio = maxChromaAtBase > 0 ? clampNumber(0, chroma / maxChromaAtBase, 1) : 0

	const clampedContrast = clampNumber(-1.08, contrast, 1.08)
	const targetLightness = clampNumber(
		0,
		Calc.solve(
			Calc.bind(
				Calc.bind(contrastTargetLightness('_'), {
					yBg: yBackground,
					scYBg: Calc.bind(softClampApprox, { y: yBackground }),
				}),
				slice,
			),
			{
				lightness,
				chroma: chromaRatio,
				'_-invertable': invert ? 1 : 0,
				'contrast-_': clampedContrast,
			},
		),
		1,
	)

	return createColor({
		lightness: targetLightness,
		chroma: Calc.solve(slice.maxChroma, { lightness: targetLightness }) * chromaRatio,
		hue,
	})
}
