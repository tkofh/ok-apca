import {
	APCA_NORMAL_INV_EXP,
	APCA_REVERSE_INV_EXP,
	APCA_SMOOTH_POWER,
	APCA_SMOOTH_THRESHOLD,
	APCA_SMOOTH_THRESHOLD_OFFSET,
} from './apca.ts'
import { findGamutSlice } from './color.ts'
import type { GamutSlice, HueDefinition, InputMode } from './types.ts'
import { outdent } from './util.ts'

function cssNumber(n: number): string {
	return n.toFixed(5).replace(/\.?0+$/, '') || '0'
}

function cssVar(name: string, fallback?: string): string {
	return `var(--${name}${fallback ? `, ${fallback}` : ''})`
}

function generatePropertyRules(
	output: string,
	labels: readonly string[],
	inputMode: InputMode,
): string {
	const numeric = (name: string, inherits = false) => outdent`
		@property --${name} {
			inherits: ${inherits ? 'true' : 'false'};
			initial-value: 0;
			syntax: '<number>';
		}
	`
	const color = (name: string, inherits = false) => outdent`
		@property --${name} {
			inherits: ${inherits ? 'true' : 'false'};
			initial-value: transparent;
			syntax: '<color>';
		}
	`

	const properties: string[] = [
		// Base color properties
		numeric('lightness', true),
		numeric('chroma', true),
	]

	// Only need intermediate variables in percentage mode
	if (inputMode === 'percentage') {
		properties.push(numeric('_lum-norm'), numeric('_chr-pct'))
	}

	properties.push(color(output, true))

	// Shared Y background if we have contrast colors
	if (labels.length > 0) {
		properties.push(numeric('_Y-bg'))
	}

	// Contrast color properties for each label
	for (const label of labels) {
		properties.push(
			numeric(`contrast-${label}`, true),
			numeric(`_contrast-signed-${label}`),
			numeric(`_lc-norm-${label}`),
			numeric(`_Y-dark-min-${label}`),
			numeric(`_Y-light-min-${label}`),
			numeric(`_con-lum-${label}`),
			color(`${output}-${label}`, true),
		)
	}

	return properties.join('\n')
}

/**
 * Generate CSS for the max chroma calculation with curvature correction.
 * Left half: linear from origin to apex
 * Right half: linear with sine-based curvature correction
 *
 * Uses pow(sin(t * pi), 0.95) which only references t once,
 * reducing CSS variable expansion compared to t * (1 - t).
 */
function cssMaxChroma(lightness: string, slice: GamutSlice): string {
	const { apex, curvature } = slice

	// Pre-computed constants
	const lMax = cssNumber(apex.lightness)
	const oneMinusLMax = cssNumber(1 - apex.lightness)
	const leftSlope = cssNumber(apex.chroma / apex.lightness) // cMax / lMax
	const rightSlope = cssNumber(apex.chroma / (1 - apex.lightness)) // cMax / (1 - lMax)
	const curveScale = cssNumber(curvature * apex.chroma)

	// t = (L - lMax) / (1 - lMax), clamped to right half only
	const tExpr = `max(0, (${lightness} - ${lMax}) / ${oneMinusLMax})`

	// Left half: L * (cMax / lMax)
	const leftHalf = `${lightness} * ${leftSlope}`

	// Right half: (1 - L) * (cMax / (1 - lMax)) + curveScale * pow(sin(t * pi), 0.95)
	const linearRight = `(1 - ${lightness}) * ${rightSlope}`
	const correction = `${curveScale} * pow(sin((${tExpr}) * pi), 0.95)`
	const rightHalf = `${linearRight} + ${correction}`

	// Use sign to select left or right half
	// When L <= lMax: sign(lMax - L) >= 0, use left
	// When L > lMax: sign(lMax - L) < 0, use right
	const isRightHalf = `max(0, sign(${lightness} - ${lMax}))`

	return outdent`
		(1 - ${isRightHalf}) * (${leftHalf}) +
		${isRightHalf} * (${rightHalf})
	`
}

/**
 * Generate CSS for sine-based smoothing interpolation.
 * Formula: start + (end - start) * pow(sin(t * π/2), power)
 *
 * This references t only once, reducing CSS variable expansion.
 */
function cssSineInterpolation(startValue: string, endValue: string, tParameter: string): string {
	const power = cssNumber(APCA_SMOOTH_POWER)
	// Clamp t to [0, 1] to avoid NaN when CSS evaluates both branches of conditionals
	return outdent`
		${startValue} + (${endValue} - ${startValue}) * pow(sin(min(${tParameter}, 1) * 1.5708), ${power})
	`
}

/** Get the CSS variable reference for normalized lightness based on input mode */
function getLumNormVar(inputMode: InputMode): string {
	return inputMode === 'percentage' ? cssVar('_lum-norm') : cssVar('lightness')
}

/** Get the CSS variable reference for chroma percentage based on input mode */
function getChrPctVar(inputMode: InputMode): string {
	return inputMode === 'percentage' ? cssVar('_chr-pct') : cssVar('chroma')
}

function generateBaseColorCss(
	hue: number,
	slice: GamutSlice,
	output: string,
	inputMode: InputMode,
) {
	const vLumNorm = getLumNormVar(inputMode)
	const vChrPct = getChrPctVar(inputMode)

	// Build the max chroma expression (used once, inlined)
	const maxChromaExpr = cssMaxChroma(vLumNorm, slice)

	// Build the chroma expression: maxChroma * chrPct (used once, inlined into output)
	const chromaExpr = `(${maxChromaExpr}) * ${vChrPct}`

	if (inputMode === 'percentage') {
		return outdent`
			--_lum-norm: clamp(0, ${cssVar('lightness')} / 100, 1);
			--_chr-pct: clamp(0, ${cssVar('chroma')} / 100, 1);
			--${output}: oklch(${vLumNorm} calc(${chromaExpr}) ${cssNumber(hue)});
		`
	}

	return outdent`
		--${output}: oklch(${vLumNorm} calc(${chromaExpr}) ${cssNumber(hue)});
	`
}

// Pre-computed CSS constants from APCA algorithm
const CSS_SMOOTH_THRESHOLD = cssNumber(APCA_SMOOTH_THRESHOLD)
const CSS_SMOOTH_THRESHOLD_OFFSET = cssNumber(APCA_SMOOTH_THRESHOLD_OFFSET)
const CSS_NORMAL_INV_EXP = cssNumber(APCA_NORMAL_INV_EXP)
const CSS_REVERSE_INV_EXP = cssNumber(APCA_REVERSE_INV_EXP)

/**
 * Build the Y-dark expression (normal polarity).
 * Uses sine-based smoothing below threshold.
 */
function buildYDarkExpr(label: string, yBgVar: string): string {
	const V_LC_NORM = cssVar(`_lc-norm-${label}`)
	const V_Y_DARK_MIN = cssVar(`_Y-dark-min-${label}`)

	const apcaTermDynamic = `pow(${yBgVar}, 0.56) - (${V_LC_NORM} + 0.027) / 1.14`

	const directSolution = outdent`
		pow(abs(${apcaTermDynamic}), ${CSS_NORMAL_INV_EXP}) *
		sign(${apcaTermDynamic})
	`

	const tParameter = `${V_LC_NORM} / ${CSS_SMOOTH_THRESHOLD}`
	const sineInterpolation = cssSineInterpolation(yBgVar, V_Y_DARK_MIN, tParameter)

	const aboveThreshold = `min(1, sign(${V_LC_NORM} - ${CSS_SMOOTH_THRESHOLD}) + 1)`

	return outdent`
		${aboveThreshold} * (${directSolution}) +
		(1 - ${aboveThreshold}) * (${sineInterpolation})
	`
}

/**
 * Build the Y-light expression (reverse polarity).
 * Uses sine-based smoothing below threshold.
 */
function buildYLightExpr(label: string, yBgVar: string): string {
	const V_LC_NORM = cssVar(`_lc-norm-${label}`)
	const V_Y_LIGHT_MIN = cssVar(`_Y-light-min-${label}`)

	const apcaTermDynamic = `pow(${yBgVar}, 0.65) + (${V_LC_NORM} + 0.027) / 1.14`

	const directSolution = `pow(${apcaTermDynamic}, ${CSS_REVERSE_INV_EXP})`

	const tParameter = `${V_LC_NORM} / ${CSS_SMOOTH_THRESHOLD}`
	const sineInterpolation = cssSineInterpolation(yBgVar, V_Y_LIGHT_MIN, tParameter)

	const aboveThreshold = `min(1, sign(${V_LC_NORM} - ${CSS_SMOOTH_THRESHOLD}) + 1)`

	return outdent`
		${aboveThreshold} * (${directSolution}) +
		(1 - ${aboveThreshold}) * (${sineInterpolation})
	`
}

/**
 * Build the Y-final expression.
 * Inlines prefer-light, prefer-dark, Y-light, and Y-dark.
 */
function buildYFinalExpr(label: string, yBgVar: string): string {
	const V_CONTRAST_SIGNED = cssVar(`_contrast-signed-${label}`)

	// prefer-light = max(0, sign(contrast-signed - 0.0001))
	const preferLightExpr = `max(0, sign(${V_CONTRAST_SIGNED} - 0.0001))`

	// prefer-dark = max(0, -1 * sign(contrast-signed - 0.0001))
	const preferDarkExpr = `max(0, -1 * sign(${V_CONTRAST_SIGNED} - 0.0001))`

	const yLightExpr = buildYLightExpr(label, yBgVar)
	const yDarkExpr = buildYDarkExpr(label, yBgVar)

	return outdent`
		(${preferLightExpr}) * (${yLightExpr}) +
		(${preferDarkExpr}) * (${yDarkExpr})
	`
}

function generateNormalPolarityCss(label: string, yBgVar: string) {
	const apcaTermThreshold = `pow(${yBgVar}, 0.56) - ${CSS_SMOOTH_THRESHOLD_OFFSET}`

	return outdent`
		--_Y-dark-min-${label}: calc(
			pow(abs(${apcaTermThreshold}), ${CSS_NORMAL_INV_EXP}) *
			sign(${apcaTermThreshold})
		);
	`
}

function generateReversePolarityCss(label: string, yBgVar: string) {
	const apcaTermThreshold = `pow(${yBgVar}, 0.65) + ${CSS_SMOOTH_THRESHOLD_OFFSET}`

	return outdent`
		--_Y-light-min-${label}: calc(
			pow(abs(${apcaTermThreshold}), ${CSS_REVERSE_INV_EXP}) *
			sign(${apcaTermThreshold})
		);
	`
}

function generateContrastColorCss(
	label: string,
	hue: number,
	slice: GamutSlice,
	output: string,
	inputMode: InputMode,
): string {
	const vChrPct = getChrPctVar(inputMode)
	const V_Y_BG = cssVar('_Y-bg')
	const V_CON_LUM = cssVar(`_con-lum-${label}`)

	// Build inlined expressions
	const yFinalExpr = buildYFinalExpr(label, V_Y_BG)

	// con-lum = clamp(0, pow(Y-final, 1/3), 1) - but Y-final is inlined
	const conLumExpr = `pow(clamp(0, ${yFinalExpr}, 1), 1 / 3)`

	// con-max-chr uses con-lum (which is a CSS var since it's used twice)
	const conMaxChrExpr = cssMaxChroma(V_CON_LUM, slice)

	// con-chr = con-max-chr * chr-pct (inlined into output)
	const conChrExpr = `(${conMaxChrExpr}) * ${vChrPct}`

	const isPercentage = inputMode === 'percentage'
	const contrastSignedExpr = isPercentage
		? `clamp(-108, ${cssVar(`contrast-${label}`, '0')}, 108)`
		: cssVar(`contrast-${label}`, '0')
	const lcNormExpr = isPercentage
		? `abs(${cssVar(`_contrast-signed-${label}`)}) / 100`
		: `abs(${cssVar(`_contrast-signed-${label}`)})`

	return outdent`
		--_contrast-signed-${label}: ${contrastSignedExpr};
		--_lc-norm-${label}: calc(${lcNormExpr});
		${generateNormalPolarityCss(label, V_Y_BG)}
		${generateReversePolarityCss(label, V_Y_BG)}
		--_con-lum-${label}: clamp(0, ${conLumExpr}, 1);
		--${output}-${label}: oklch(${V_CON_LUM} calc(${conChrExpr}) ${cssNumber(hue)});
	`
}

/**
 * Generate CSS for OKLCH color with optional APCA-based contrast colors.
 *
 * Accepts a pre-validated `HueDefinition` from `defineHue`.
 *
 * Runtime inputs:
 * - `--lightness` (0-100), `--chroma` (0-100)
 * - `--contrast-{label}` (-108 to 108)
 *
 * Outputs:
 * - `--{output}` (e.g., `--color`)
 * - `--{output}-{label}` (e.g., `--color-text`)
 *
 * The generated CSS includes `@property` declarations for all custom properties,
 * enabling proper type checking, animation support, and initial values.
 */
export function generateHueCss(definition: HueDefinition): string {
	const { hue, selector, output, contrastColors, inputMode } = definition
	const slice = findGamutSlice(hue)
	const labels = contrastColors.map((c) => c.label)

	const propertyRules = generatePropertyRules(output, labels, inputMode)

	const baseColorCss = generateBaseColorCss(hue, slice, output, inputMode)

	const vLumNorm = getLumNormVar(inputMode)
	const sharedYBackground = contrastColors.length > 0 ? `--_Y-bg: pow(${vLumNorm}, 3);` : ''

	const contrastColorsCss = contrastColors
		.map(({ label }) => generateContrastColorCss(label, hue, slice, output, inputMode))
		.join('\n\n')

	return outdent`
		${propertyRules}

		${selector} {
			${baseColorCss}

			${sharedYBackground}

			${contrastColorsCss}
		}
	`
}
