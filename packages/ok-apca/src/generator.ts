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

	const properties: string[] = [numeric('lightness', true), numeric('chroma', true)]

	if (inputMode === 'percentage') {
		properties.push(numeric('_lum-norm'), numeric('_chr-pct'))
	}

	properties.push(color(output, true))

	if (labels.length > 0) {
		properties.push(numeric('_Y-bg'))
	}

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

/** Max chroma with curvature correction: linear left of apex, sine-corrected right of apex. */
function cssMaxChroma(lightness: string, slice: GamutSlice): string {
	const { apex, curvature } = slice
	const lMax = cssNumber(apex.lightness)
	const tExpr = `max(0, (${lightness} - ${lMax}) / ${cssNumber(1 - apex.lightness)})`
	const leftHalf = `${lightness} * ${cssNumber(apex.chroma / apex.lightness)}`
	const rightHalf = `(1 - ${lightness}) * ${cssNumber(apex.chroma / (1 - apex.lightness))} + ${cssNumber(curvature * apex.chroma)} * pow(sin((${tExpr}) * pi), 0.95)`
	const isRightHalf = `max(0, sign(${lightness} - ${lMax}))`

	return outdent`
		(1 - ${isRightHalf}) * (${leftHalf}) +
		${isRightHalf} * (${rightHalf})
	`
}

/** Sine-based smoothing: start + (end - start) * pow(sin(t * π/2), power). Clamps t to avoid NaN. */
function cssSineInterpolation(startValue: string, endValue: string, tParameter: string): string {
	return `${startValue} + (${endValue} - ${startValue}) * pow(sin(min(${tParameter}, 1) * 1.5708), ${cssNumber(APCA_SMOOTH_POWER)})`
}

function getLumNormVar(inputMode: InputMode): string {
	return inputMode === 'percentage' ? cssVar('_lum-norm') : cssVar('lightness')
}

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
	const chromaExpr = `(${cssMaxChroma(vLumNorm, slice)}) * ${getChrPctVar(inputMode)}`

	if (inputMode === 'percentage') {
		return outdent`
			--_lum-norm: clamp(0, ${cssVar('lightness')} / 100, 1);
			--_chr-pct: clamp(0, ${cssVar('chroma')} / 100, 1);
			--${output}: oklch(${vLumNorm} calc(${chromaExpr}) ${cssNumber(hue)});
		`
	}

	return `--${output}: oklch(${vLumNorm} calc(${chromaExpr}) ${cssNumber(hue)});`
}

const CSS_SMOOTH_THRESHOLD = cssNumber(APCA_SMOOTH_THRESHOLD)
const CSS_SMOOTH_THRESHOLD_OFFSET = cssNumber(APCA_SMOOTH_THRESHOLD_OFFSET)
const CSS_NORMAL_INV_EXP = cssNumber(APCA_NORMAL_INV_EXP)
const CSS_REVERSE_INV_EXP = cssNumber(APCA_REVERSE_INV_EXP)
const V_Y_BG = cssVar('_Y-bg')

function buildYDarkExpr(label: string): string {
	const V_LC_NORM = cssVar(`_lc-norm-${label}`)
	const V_Y_DARK_MIN = cssVar(`_Y-dark-min-${label}`)
	const apcaTermDynamic = `pow(${V_Y_BG}, 0.56) - (${V_LC_NORM} + 0.027) / 1.14`
	const directSolution = `pow(abs(${apcaTermDynamic}), ${CSS_NORMAL_INV_EXP}) * sign(${apcaTermDynamic})`
	const aboveThreshold = `min(1, sign(${V_LC_NORM} - ${CSS_SMOOTH_THRESHOLD}) + 1)`
	const sineInterpolation = cssSineInterpolation(
		V_Y_BG,
		V_Y_DARK_MIN,
		`${V_LC_NORM} / ${CSS_SMOOTH_THRESHOLD}`,
	)

	return outdent`
		${aboveThreshold} * (${directSolution}) +
		(1 - ${aboveThreshold}) * (${sineInterpolation})
	`
}

function buildYLightExpr(label: string): string {
	const V_LC_NORM = cssVar(`_lc-norm-${label}`)
	const V_Y_LIGHT_MIN = cssVar(`_Y-light-min-${label}`)
	const apcaTermDynamic = `pow(${V_Y_BG}, 0.65) + (${V_LC_NORM} + 0.027) / 1.14`
	const directSolution = `pow(${apcaTermDynamic}, ${CSS_REVERSE_INV_EXP})`
	const aboveThreshold = `min(1, sign(${V_LC_NORM} - ${CSS_SMOOTH_THRESHOLD}) + 1)`
	const sineInterpolation = cssSineInterpolation(
		V_Y_BG,
		V_Y_LIGHT_MIN,
		`${V_LC_NORM} / ${CSS_SMOOTH_THRESHOLD}`,
	)

	return outdent`
		${aboveThreshold} * (${directSolution}) +
		(1 - ${aboveThreshold}) * (${sineInterpolation})
	`
}

function buildYFinalExpr(label: string): string {
	const V_CONTRAST_SIGNED = cssVar(`_contrast-signed-${label}`)
	const preferLightExpr = `max(0, sign(${V_CONTRAST_SIGNED} - 0.0001))`
	const preferDarkExpr = `max(0, -1 * sign(${V_CONTRAST_SIGNED} - 0.0001))`

	return outdent`
		(${preferLightExpr}) * (${buildYLightExpr(label)}) +
		(${preferDarkExpr}) * (${buildYDarkExpr(label)})
	`
}

function generateNormalPolarityCss(label: string) {
	const apcaTermThreshold = `pow(${V_Y_BG}, 0.56) - ${CSS_SMOOTH_THRESHOLD_OFFSET}`
	return `--_Y-dark-min-${label}: calc(pow(abs(${apcaTermThreshold}), ${CSS_NORMAL_INV_EXP}) * sign(${apcaTermThreshold}));`
}

function generateReversePolarityCss(label: string) {
	const apcaTermThreshold = `pow(${V_Y_BG}, 0.65) + ${CSS_SMOOTH_THRESHOLD_OFFSET}`
	return `--_Y-light-min-${label}: calc(pow(abs(${apcaTermThreshold}), ${CSS_REVERSE_INV_EXP}) * sign(${apcaTermThreshold}));`
}

function generateContrastColorCss(
	label: string,
	hue: number,
	slice: GamutSlice,
	output: string,
	inputMode: InputMode,
): string {
	const vChrPct = getChrPctVar(inputMode)
	const V_CON_LUM = cssVar(`_con-lum-${label}`)
	const conLumExpr = `pow(clamp(0, ${buildYFinalExpr(label)}, 1), 1 / 3)`
	const conChrExpr = `(${cssMaxChroma(V_CON_LUM, slice)}) * ${vChrPct}`

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
		${generateNormalPolarityCss(label)}
		${generateReversePolarityCss(label)}
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
