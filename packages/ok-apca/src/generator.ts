import {
	APCA_DARK_V_SCALE,
	APCA_LIGHT_V_SCALE,
	APCA_NORMAL_INV_EXP,
	APCA_REVERSE_INV_EXP,
	APCA_SMOOTH_THRESHOLD,
	APCA_SMOOTH_THRESHOLD_OFFSET,
} from './apca.ts'
import { findGamutSlice } from './color.ts'
import type { GamutSlice, HueDefinition } from './types.ts'
import { outdent } from './util.ts'

const css = {
	number: (n: number, precision = 5) => n.toFixed(precision).replace(/\.?0+$/, '') || '0',
	property: {
		color: (name: string, inherits = false) => outdent`
      @property --${name} {
        inherits: ${inherits ? 'true' : 'false'};
        initial-value: transparent;
        syntax: '<color>';
      }
    `,
		numeric: (name: string, inherits = false) => outdent`
      @property --${name} {
        inherits: ${inherits ? 'true' : 'false'};
        initial-value: 0;
        syntax: '<number>';
      }
    `,
	},
	unitClamp: (condition: string) => `clamp(0, ${condition}, 1)`,
	var: (name: string, fallback?: string) => `var(--${name}${fallback ? `, ${fallback}` : ''})`,
} as const

function generatePropertyRules(output: string, labels: readonly string[]): string {
	const properties: string[] = [
		// Base color properties
		css.property.numeric('lightness', true),
		css.property.numeric('chroma', true),
		css.property.numeric('_lum-norm'),
		css.property.numeric('_chr-pct'),
		css.property.color(output, true),
	]

	// Shared Y background if we have contrast colors
	if (labels.length > 0) {
		properties.push(css.property.numeric('_Y-bg'))
	}

	// Contrast color properties for each label
	for (const label of labels) {
		properties.push(
			css.property.numeric(`contrast-${label}`, true),
			css.property.numeric(`_contrast-signed-${label}`),
			css.property.numeric(`_lc-norm-${label}`),
			css.property.numeric(`_Y-bg-${label}`),
			css.property.numeric(`_Y-dark-min-${label}`),
			css.property.numeric(`_Y-light-min-${label}`),
			css.property.numeric(`_con-lum-${label}`),
			css.property.color(`${output}-${label}`, true),
		)
	}

	return properties.join('\n')
}

// Shared CSS variable references
const V_LUM_NORM = css.var('_lum-norm')
const V_CHR_PCT = css.var('_chr-pct')

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
	const lMax = css.number(apex.lightness)
	const oneMinusLMax = css.number(1 - apex.lightness)
	const leftSlope = css.number(apex.chroma / apex.lightness) // cMax / lMax
	const rightSlope = css.number(apex.chroma / (1 - apex.lightness)) // cMax / (1 - lMax)
	const curveScale = css.number(curvature * apex.chroma)

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

function cssHermiteInterpolation(
	startValue: string,
	endValue: string,
	endVelocity: string,
	tParameter: string,
): string {
	return outdent`
		${startValue} +
		(-3 * ${startValue} + 3 * ${endValue} - ${endVelocity}) * pow(${tParameter}, 2) +
		(2 * ${startValue} - 2 * ${endValue} + ${endVelocity}) * pow(${tParameter}, 3)
	`
}

function generateBaseColorCss(hue: number, slice: GamutSlice, output: string) {
	// Build the max chroma expression (used once, inlined)
	const maxChromaExpr = cssMaxChroma(V_LUM_NORM, slice)

	// Build the chroma expression: maxChroma * chrPct (used once, inlined into output)
	const chromaExpr = `(${maxChromaExpr}) * ${V_CHR_PCT}`

	return outdent`
		/* Runtime inputs: --lightness (0-100), --chroma (0-100 as % of max) */
		--_lum-norm: clamp(0, ${css.var('lightness')} / 100, 1);
		--_chr-pct: clamp(0, ${css.var('chroma')} / 100, 1);

		/* Output color (max chroma and chroma inlined) */
		--${output}: oklch(${V_LUM_NORM} calc(${chromaExpr}) ${css.number(hue)});
	`
}

// Pre-computed CSS constants from APCA algorithm
const CSS_SMOOTH_THRESHOLD = css.number(APCA_SMOOTH_THRESHOLD)
const CSS_SMOOTH_THRESHOLD_OFFSET = css.number(APCA_SMOOTH_THRESHOLD_OFFSET)
const CSS_NORMAL_INV_EXP = css.number(APCA_NORMAL_INV_EXP)
const CSS_REVERSE_INV_EXP = css.number(APCA_REVERSE_INV_EXP)
const CSS_DARK_V_SCALE = css.number(APCA_DARK_V_SCALE)
const CSS_LIGHT_V_SCALE = css.number(APCA_LIGHT_V_SCALE)

/**
 * Build the Y-dark expression (normal polarity).
 * Inlines Y-dark-v into the Hermite interpolation.
 */
function buildYDarkExpr(label: string, yBgVar: string): string {
	const V_LC_NORM = css.var(`_lc-norm-${label}`)
	const V_Y_DARK_MIN = css.var(`_Y-dark-min-${label}`)

	// Y-dark-v = -1 * pow(abs(Y-dark-min), 0.43) * DARK_V_SCALE
	const yDarkVExpr = `-1 * pow(abs(${V_Y_DARK_MIN}), 0.43) * ${CSS_DARK_V_SCALE}`

	const apcaTermDynamic = `pow(${yBgVar}, 0.56) - (${V_LC_NORM} + 0.027) / 1.14`

	const directSolution = outdent`
		pow(abs(${apcaTermDynamic}), ${CSS_NORMAL_INV_EXP}) *
		sign(${apcaTermDynamic})
	`

	const tParameter = `${V_LC_NORM} / ${CSS_SMOOTH_THRESHOLD}`
	const bezierInterpolation = cssHermiteInterpolation(yBgVar, V_Y_DARK_MIN, yDarkVExpr, tParameter)

	const aboveThreshold = css.unitClamp(`sign(${V_LC_NORM} - ${CSS_SMOOTH_THRESHOLD}) + 1`)

	return outdent`
		${aboveThreshold} * (${directSolution}) +
		(1 - ${aboveThreshold}) * (${bezierInterpolation})
	`
}

/**
 * Build the Y-light expression (reverse polarity).
 * Inlines Y-light-v into the Hermite interpolation.
 */
function buildYLightExpr(label: string, yBgVar: string): string {
	const V_LC_NORM = css.var(`_lc-norm-${label}`)
	const V_Y_LIGHT_MIN = css.var(`_Y-light-min-${label}`)

	// Y-light-v = pow(abs(Y-light-min), 0.38) * LIGHT_V_SCALE
	const yLightVExpr = `pow(abs(${V_Y_LIGHT_MIN}), 0.38) * ${CSS_LIGHT_V_SCALE}`

	const apcaTermDynamic = `pow(${yBgVar}, 0.65) - ((-1 * ${V_LC_NORM}) - 0.027) / 1.14`

	const directSolution = `pow(${apcaTermDynamic}, ${CSS_REVERSE_INV_EXP})`

	const tParameter = `${V_LC_NORM} / ${CSS_SMOOTH_THRESHOLD}`
	const bezierInterpolation = cssHermiteInterpolation(
		yBgVar,
		V_Y_LIGHT_MIN,
		yLightVExpr,
		tParameter,
	)

	const aboveThreshold = css.unitClamp(`sign(${V_LC_NORM} - ${CSS_SMOOTH_THRESHOLD}) + 1`)

	return outdent`
		${aboveThreshold} * (${directSolution}) +
		(1 - ${aboveThreshold}) * (${bezierInterpolation})
	`
}

/**
 * Build the Y-final expression.
 * Inlines prefer-light, prefer-dark, Y-light, and Y-dark.
 */
function buildYFinalExpr(label: string, yBgVar: string): string {
	const V_CONTRAST_SIGNED = css.var(`_contrast-signed-${label}`)

	// prefer-light = clamp(0, sign(contrast-signed - 0.0001), 1)
	const preferLightExpr = css.unitClamp(`sign(${V_CONTRAST_SIGNED} - 0.0001)`)

	// prefer-dark = clamp(0, -1 * sign(contrast-signed - 0.0001), 1)
	const preferDarkExpr = css.unitClamp(`-1 * sign(${V_CONTRAST_SIGNED} - 0.0001)`)

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
		/* Normal polarity: solve for darker Y (dark text on light background) */
		--_Y-dark-min-${label}: calc(
			pow(abs(${apcaTermThreshold}), ${CSS_NORMAL_INV_EXP}) *
			sign(${apcaTermThreshold})
		);
	`
}

function generateReversePolarityCss(label: string, yBgVar: string) {
	const apcaTermThreshold = `pow(${yBgVar}, 0.65) + ${CSS_SMOOTH_THRESHOLD_OFFSET}`

	return outdent`
		/* Reverse polarity: solve for lighter Y (light text on dark background) */
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
): string {
	const V_Y_BG_LABEL = css.var(`_Y-bg-${label}`)
	const V_CON_LUM = css.var(`_con-lum-${label}`)

	// Build inlined expressions
	const yFinalExpr = buildYFinalExpr(label, V_Y_BG_LABEL)

	// con-lum = clamp(0, pow(Y-final, 1/3), 1) - but Y-final is inlined
	const conLumExpr = `pow(clamp(0, ${yFinalExpr}, 1), 1 / 3)`

	// con-max-chr uses con-lum (which is a CSS var since it's used twice)
	const conMaxChrExpr = cssMaxChroma(V_CON_LUM, slice)

	// con-chr = con-max-chr * chr-pct (inlined into output)
	const conChrExpr = `(${conMaxChrExpr}) * ${V_CHR_PCT}`

	return outdent`
		/* Contrast color: ${label} */
		--_contrast-signed-${label}: clamp(-108, ${css.var(`contrast-${label}`, '0')}, 108);
		--_lc-norm-${label}: calc(abs(${css.var(`_contrast-signed-${label}`)}) / 100);

		--_Y-bg-${label}: ${css.var('_Y-bg')};

		${generateNormalPolarityCss(label, V_Y_BG_LABEL)}

		${generateReversePolarityCss(label, V_Y_BG_LABEL)}

		/* Y-final, prefer-light, prefer-dark, Y-light, Y-dark all inlined into con-lum */
		--_con-lum-${label}: clamp(0, ${conLumExpr}, 1);

		/* con-max-chr and con-chr inlined into output color */
		--${output}-${label}: oklch(${V_CON_LUM} calc(${conChrExpr}) ${css.number(hue)});
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
	const { hue, selector, output, contrastColors } = definition
	const slice = findGamutSlice(hue)
	const labels = contrastColors.map((c) => c.label)

	const propertyRules = generatePropertyRules(output, labels)

	const baseColorCss = generateBaseColorCss(hue, slice, output)

	const sharedYBackground =
		contrastColors.length > 0
			? outdent`
					/* Shared Y background for all contrast calculations */
					--_Y-bg: pow(${css.var('_lum-norm')}, 3);
				`
			: ''

	const contrastColorsCss = contrastColors
		.map(({ label }) => generateContrastColorCss(label, hue, slice, output))
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
