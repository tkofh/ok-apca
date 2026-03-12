import * as ct from '@ok-apca/calc-tree'
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
	contrastSolverWithInversion,
	normalPolarity,
	reversePolarity,
	softClampApprox,
	softUnclamp,
	trueSoftClamp,
} from './apca.ts'
import { type Color, createColor, getLuminance } from './color.ts'
import { computeGamutSlice, gamutMap } from './gamut.ts'
import { clampNumber } from './util.ts'

// =============================================================================
// Shared Expression Trees
// =============================================================================

/**
 * Y-correction polynomial: 1 + fA·chroma + fB·chroma² + fD·chroma³
 *
 * Converts between OKLCH lightness and CIE Y using pre-scaled coefficients.
 * fA, fB, fD are hue-dependent and incorporate the gamut boundary slope
 * (apexC/apexL), so chroma here is the normalized ratio (0–1).
 */
const fCorrection: ct.NumberExpression<'chroma' | 'fA' | 'fB' | 'fD'> = ct.add(
	1,
	ct.multiply('fA', 'chroma'),
	ct.multiply('fB', ct.pow('chroma', 2)),
	ct.multiply('fD', ct.pow('chroma', 3)),
)

/**
 * Y background: L³ · f(chroma)
 *
 * Computes CIE Y luminance from OKLCH lightness and chroma ratio.
 * Exact on the left half of the gamut tent where k = (apexC/apexL) · chromaRatio
 * is constant; close approximation on the right half.
 */
export const yBackground: ct.NumberExpression<'lightness' | 'chroma' | 'fA' | 'fB' | 'fD'> =
	ct.multiply(ct.pow('lightness', 3), fCorrection)

/**
 * Corrected lightness from target Y: L = pow(Y / f(chroma), 1/3)
 *
 * Applies the inverse Y-correction to recover OKLCH lightness from CIE Y.
 * Uses the same f-correction polynomial as yBackground, depending only on
 * the input chroma ratio (a leaf variable), not the solver output.
 *
 * Unbound refs: `yTarget`, `chroma`, `fA`, `fB`, `fD`.
 */
export const correctedLightness: ct.NumberExpression<'yTarget' | 'chroma' | 'fA' | 'fB' | 'fD'> =
	ct.pow(ct.divide('yTarget', fCorrection), 1 / 3)

// =============================================================================
// Contrast Target Lightness Factories
// =============================================================================

/**
 * Build contrast target lightness expression (simple solver, no inversion).
 *
 * Returns a property-wrapped expression tree for the corrected lightness of
 * a contrast color. The label parameterizes property names and the contrast
 * input ref (`contrast-{label}`).
 *
 * Unbound refs: `scYBg`, `contrast-{label}`, `chroma`, `fA`, `fB`, `fD`.
 */
export function contrastTargetLightness<const Label extends string>(label: Label) {
	const yRaw = ct.Properties.number(
		`_yr-${label}`,
		contrastSolver.bind({ yBg: 'scYBg', contrast: `contrast-${label}` }),
	)
	const yTarget = ct.Properties.number(`_yt-${label}`, softUnclamp.bind({ y: yRaw }))
	return ct.Properties.number(`_cl-${label}`, correctedLightness.bind({ yTarget }))
}

/**
 * Build contrast target lightness expression with automatic polarity inversion.
 *
 * Computes both polarity solutions, measures achieved contrast for each,
 * and selects the one that achieves higher absolute contrast.
 *
 * Uses two distinct Y_bg refs:
 * - `scYBg`: soft-clamped Y_bg for the polarity solvers (operates in clamped domain)
 * - `yBg`: original Y_bg for contrast measurement and zero-contrast fallback
 *
 * Unbound refs: `yBg`, `scYBg`, `contrast-{label}`, `chroma`, `fA`, `fB`, `fD`.
 */
export function contrastTargetLightnessWithInversion<const Label extends string>(label: Label) {
	const contrastRef = `contrast-${label}` as const

	// Polarity solvers use soft-clamped Y_bg
	const polarityBinding = { yBg: 'scYBg' as const, contrast: contrastRef }

	// Raw solver outputs in soft-clamped domain
	const yLightRaw = ct.Properties.number(
		`_ylr-${label}`,
		ct.clamp(0, reversePolarity.bind(polarityBinding), 1),
	)
	const yDarkRaw = ct.Properties.number(
		`_ydr-${label}`,
		ct.clamp(0, normalPolarity.bind(polarityBinding), 1),
	)

	// Unclamp to recover actual Y values
	const yLight = ct.Properties.number(`_yl-${label}`, softUnclamp.bind({ y: yLightRaw }))
	const yDark = ct.Properties.number(`_yd-${label}`, softUnclamp.bind({ y: yDarkRaw }))

	// Measure achieved contrast using original Y_bg (yBg ref, not scYBg)
	const lcLight = ct.Properties.number(`_lcl-${label}`, contrastMeasurementReverse.bind({ yFg: yLight }))
	const lcDark = ct.Properties.number(`_lcd-${label}`, contrastMeasurementNormal.bind({ yFg: yDark }))

	// Inversion solver uses original Y_bg for zero-contrast fallback
	const yTarget = ct.Properties.number(
		`_yt-${label}`,
		contrastSolverWithInversion.bind({
			contrast: contrastRef,
			yLight,
			yDark,
			yLightRaw,
			yDarkRaw,
			lcLight,
			lcDark,
		}),
	)

	return ct.Properties.number(`_cl-${label}`, correctedLightness.bind({ yTarget }))
}

// =============================================================================
// Measure Contrast
// =============================================================================

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

// =============================================================================
// Compute Contrast Color (JS runtime)
// =============================================================================

/**
 * Compute contrast color achieving target APCA Lc value.
 * Positive contrast = lighter text, negative = darker text.
 *
 * @param color - The base color to compute contrast from
 * @param contrast - Signed contrast value (-1.08 to 1.08)
 * @param invert - Whether to enable automatic polarity inversion (default: true)
 *
 * Uses the shared expression trees to ensure parity with CSS generation.
 */
export function computeContrastColor(color: Color, contrast: number, invert = true): Color {
	const { hue, lightness, chroma } = gamutMap(color)
	const slice = computeGamutSlice(hue)
	const maxChromaAtBase = slice.maxChroma.solve({ lightness })
	const chromaRatio = maxChromaAtBase > 0 ? clampNumber(0, chroma / maxChromaAtBase, 1) : 0

	const targetLExpr = invert
		? contrastTargetLightnessWithInversion('_')
		: contrastTargetLightness('_')

	const clampedContrast = clampNumber(-1.08, contrast, 1.08)
	const targetLightness = clampNumber(
		0,
		targetLExpr
			.bind({
				yBg: yBackground,
				scYBg: softClampApprox.bind({ y: yBackground }),
			})
			.bind(slice)
			.solve({
				lightness,
				chroma: chromaRatio,
				'contrast-_': clampedContrast,
			}),
		1,
	)

	return createColor({
		lightness: targetLightness,
		chroma: slice.maxChroma.solve({ lightness: targetLightness }) * chromaRatio,
		hue,
	})
}
