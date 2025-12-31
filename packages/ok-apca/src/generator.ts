import {
	APCA_DARK_V_SCALE,
	APCA_LIGHT_V_SCALE,
	APCA_NORMAL_INV_EXP,
	APCA_REVERSE_INV_EXP,
	APCA_SMOOTH_THRESHOLD,
	APCA_SMOOTH_THRESHOLD_OFFSET,
} from './apca.ts'
import { findGamutSlice } from './color.ts'
import { fitHeuristicCoefficients } from './heuristic.ts'
import type { ColorGeneratorOptions, GamutSlice, HeuristicCoefficients } from './types.ts'
import { outdent } from './util.ts'

const css = {
	number: (n: number, precision = 8) => n.toFixed(precision).replace(/\.?0+$/, '') || '0',
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

function generatePropertyRules(prefix: string, labels: readonly string[]): string {
	const properties: string[] = [
		// Base color properties
		css.property.numeric('lightness', true),
		css.property.numeric('chroma', true),
		css.property.numeric('_lum-norm'),
		css.property.numeric('_chr-pct'),
		css.property.numeric('_max-chr'),
		css.property.numeric('_chr'),
		css.property.color(`${prefix}-color`, true),
	]

	// Shared Y background if we have contrast colors
	if (labels.length > 0) {
		properties.push(css.property.numeric('_Y-bg'))
	}

	// Contrast color properties for each label
	for (const label of labels) {
		properties.push(
			css.property.numeric(`contrast-${label}`, true),
			css.property.numeric(`_boost-pct-${label}`),
			css.property.numeric(`_boost-multiplicative-${label}`),
			css.property.numeric(`_boost-absolute-${label}`),
			css.property.numeric(`_contrast-adjusted-${label}`),
			css.property.numeric(`_contrast-signed-${label}`),
			css.property.numeric(`_lc-norm-${label}`),
			css.property.numeric(`_Y-bg-${label}`),
			css.property.numeric(`_prefer-light-${label}`),
			css.property.numeric(`_prefer-dark-${label}`),
			css.property.numeric(`_Y-dark-min-${label}`),
			css.property.numeric(`_Y-dark-v-${label}`),
			css.property.numeric(`_Y-dark-${label}`),
			css.property.numeric(`_Y-light-min-${label}`),
			css.property.numeric(`_Y-light-v-${label}`),
			css.property.numeric(`_Y-light-${label}`),
			css.property.numeric(`_Y-final-${label}`),
			css.property.numeric(`_con-lum-${label}`),
			css.property.numeric(`_con-max-chr-${label}`),
			css.property.numeric(`_con-chr-${label}`),
			css.property.color(`${prefix}-color-${label}`, true),
		)
	}

	return properties.join('\n')
}

function validateLabel(label: string): void {
	const labelRegex = /^[a-z][a-z0-9_-]*$/i
	if (!labelRegex.test(label)) {
		throw new Error(
			`Invalid contrast color label '${label}'. Labels must start with a letter and contain only letters, numbers, hyphens, and underscores.`,
		)
	}
}

function validateUniqueLabels(labels: readonly string[]): void {
	const seen = new Set<string>()
	for (const label of labels) {
		if (seen.has(label)) {
			throw new Error(
				`Duplicate contrast color label '${label}'. Each contrast color must have a unique label.`,
			)
		}
		seen.add(label)
	}
}

// Shared CSS variable references
const V_LUM_NORM = css.var('_lum-norm')

/**
 * Generate CSS for the max chroma calculation with curvature correction.
 * Left half: linear from origin to apex
 * Right half: linear with quadratic curvature correction
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

	// Right half: (1 - L) * (cMax / (1 - lMax)) + curveScale * t * (1 - t)
	const linearRight = `(1 - ${lightness}) * ${rightSlope}`
	const correction = `${curveScale} * (${tExpr}) * (1 - (${tExpr}))`
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

function generateBaseColorCss(hue: number, slice: GamutSlice, prefix: string) {
	return outdent`
		/* Runtime inputs: --lightness (0-100), --chroma (0-100 as % of max) */
		--_lum-norm: clamp(0, ${css.var('lightness')} / 100, 1);
		--_chr-pct: clamp(0, ${css.var('chroma')} / 100, 1);

		/* Max chroma at this lightness (tent with curvature correction) */
		--_max-chr: calc(
			${cssMaxChroma(V_LUM_NORM, slice)}
		);

		/* Chroma as percentage of maximum available at this lightness */
		--_chr: calc(${css.var('_max-chr')} * ${css.var('_chr-pct')});

		/* Output color */
		--${prefix}-color: oklch(${V_LUM_NORM} ${css.var('_chr')} ${hue});
	`
}

function generateHeuristicCss(coefficients: HeuristicCoefficients, label: string): string {
	return outdent`
		/* Heuristic correction to prevent under-delivery of contrast */
		/* Uses multiplicative boost for smooth interpolation from 0 */
		/* boostPct = (darkBoost * max(0, 0.3 - L) + midBoost * max(0, 1 - |L - 0.5| * 2.5)) / 100 */
		/* adjusted = target * (1 + boostPct) + contrastBoost * max(0, target - 30) */
		--_boost-pct-${label}: calc(
			(${css.number(coefficients.darkBoost)} * max(0, 0.3 - ${css.var('_lum-norm')}) +
		 ${css.number(coefficients.midBoost)} * max(0, 1 - abs(${css.var('_lum-norm')} - 0.5) * 2.5)) / 100
		);
		--_boost-multiplicative-${label}: calc(${css.var(`contrast-${label}`, '0')} * ${css.var(`_boost-pct-${label}`)});
		--_boost-absolute-${label}: calc(${css.number(coefficients.contrastBoost)} * max(0, ${css.var(`contrast-${label}`, '0')} - 30));
		--_contrast-adjusted-${label}: calc(${css.var(`contrast-${label}`, '0')} + ${css.var(`_boost-multiplicative-${label}`)} + ${css.var(`_boost-absolute-${label}`)});
	`
}

// Pre-computed CSS constants from APCA algorithm
const CSS_SMOOTH_THRESHOLD = css.number(APCA_SMOOTH_THRESHOLD)
const CSS_SMOOTH_THRESHOLD_OFFSET = css.number(APCA_SMOOTH_THRESHOLD_OFFSET)
const CSS_NORMAL_INV_EXP = css.number(APCA_NORMAL_INV_EXP)
const CSS_REVERSE_INV_EXP = css.number(APCA_REVERSE_INV_EXP)
const CSS_DARK_V_SCALE = css.number(APCA_DARK_V_SCALE)
const CSS_LIGHT_V_SCALE = css.number(APCA_LIGHT_V_SCALE)

function generateNormalPolarityCss(label: string, yBgVar: string) {
	const V_LC_NORM = css.var(`_lc-norm-${label}`)
	const V_Y_DARK_MIN = css.var(`_Y-dark-min-${label}`)
	const V_Y_DARK_V = css.var(`_Y-dark-v-${label}`)

	const apcaTermThreshold = `pow(${yBgVar}, 0.56) - ${CSS_SMOOTH_THRESHOLD_OFFSET}`
	const apcaTermDynamic = `pow(${yBgVar}, 0.56) - (${V_LC_NORM} + 0.027) / 1.14`

	const directSolution = outdent`
		pow(abs(${apcaTermDynamic}), ${CSS_NORMAL_INV_EXP}) *
		sign(${apcaTermDynamic})
	`

	const tParameter = `${V_LC_NORM} / ${CSS_SMOOTH_THRESHOLD}`
	const bezierInterpolation = cssHermiteInterpolation(yBgVar, V_Y_DARK_MIN, V_Y_DARK_V, tParameter)

	const aboveThreshold = css.unitClamp(`sign(${V_LC_NORM} - ${CSS_SMOOTH_THRESHOLD}) + 1`)

	return outdent`
		/* Normal polarity: solve for darker Y (dark text on light background) */
		--_Y-dark-min-${label}: calc(
			pow(abs(${apcaTermThreshold}), ${CSS_NORMAL_INV_EXP}) *
			sign(${apcaTermThreshold})
		);
		--_Y-dark-v-${label}: calc(-1 * pow(abs(${V_Y_DARK_MIN}), 0.43) * ${CSS_DARK_V_SCALE});
		--_Y-dark-${label}: calc(
			${aboveThreshold} * (${directSolution}) +
			(1 - ${aboveThreshold}) * (${bezierInterpolation})
		);
	`
}

function generateReversePolarityCss(label: string, yBgVar: string) {
	const V_LC_NORM = css.var(`_lc-norm-${label}`)
	const V_Y_LIGHT_MIN = css.var(`_Y-light-min-${label}`)
	const V_Y_LIGHT_V = css.var(`_Y-light-v-${label}`)

	const apcaTermThreshold = `pow(${yBgVar}, 0.65) + ${CSS_SMOOTH_THRESHOLD_OFFSET}`
	const apcaTermDynamic = `pow(${yBgVar}, 0.65) - ((-1 * ${V_LC_NORM}) - 0.027) / 1.14`

	const directSolution = `pow(${apcaTermDynamic}, ${CSS_REVERSE_INV_EXP})`

	const tParameter = `${V_LC_NORM} / ${CSS_SMOOTH_THRESHOLD}`
	const bezierInterpolation = cssHermiteInterpolation(
		yBgVar,
		V_Y_LIGHT_MIN,
		V_Y_LIGHT_V,
		tParameter,
	)

	const aboveThreshold = css.unitClamp(`sign(${V_LC_NORM} - ${CSS_SMOOTH_THRESHOLD}) + 1`)

	return outdent`
		/* Reverse polarity: solve for lighter Y (light text on dark background) */
		--_Y-light-min-${label}: calc(
			pow(abs(${apcaTermThreshold}), ${CSS_REVERSE_INV_EXP}) *
			sign(${apcaTermThreshold})
		);
		--_Y-light-v-${label}: calc(pow(abs(${V_Y_LIGHT_MIN}), 0.38) * ${CSS_LIGHT_V_SCALE});
		--_Y-light-${label}: calc(
			${aboveThreshold} * (${directSolution}) +
			(1 - ${aboveThreshold}) * (${bezierInterpolation})
		);
	`
}

function generateTargetYCss(label: string) {
	const V_CONTRAST_SIGNED = css.var(`_contrast-signed-${label}`)
	const V_PREFER_LIGHT = css.var(`_prefer-light-${label}`)
	const V_PREFER_DARK = css.var(`_prefer-dark-${label}`)
	const V_Y_LIGHT = css.var(`_Y-light-${label}`)
	const V_Y_DARK = css.var(`_Y-dark-${label}`)

	return outdent`
		/* Select polarity based on contrast sign */
		/* Positive contrast = lighter text, negative = darker text */
		--_prefer-light-${label}: ${css.unitClamp(`sign(${V_CONTRAST_SIGNED} - 0.0001)`)};
		--_prefer-dark-${label}: ${css.unitClamp(`-1 * sign(${V_CONTRAST_SIGNED} - 0.0001)`)};

		/* Final Y selection based on polarity */
		--_Y-final-${label}: clamp(0,
			${V_PREFER_LIGHT} * ${V_Y_LIGHT} +
			${V_PREFER_DARK} * ${V_Y_DARK},
		1);
	`
}

function generateContrastColorCss(
	label: string,
	hue: number,
	slice: GamutSlice,
	prefix: string,
): string {
	const { coefficients } = fitHeuristicCoefficients(hue)

	const V_Y_FINAL = css.var(`_Y-final-${label}`)
	const V_CON_LUM = css.var(`_con-lum-${label}`)
	const V_CON_MAX_CHR = css.var(`_con-max-chr-${label}`)
	const V_CON_CHR = css.var(`_con-chr-${label}`)

	return outdent`
		/* Contrast color: ${label} */
		${generateHeuristicCss(coefficients, label)}

		--_contrast-signed-${label}: clamp(-108, ${css.var(`_contrast-adjusted-${label}`)}, 108);
		--_lc-norm-${label}: calc(abs(${css.var(`_contrast-signed-${label}`)}) / 100);

		--_Y-bg-${label}: ${css.var('_Y-bg')};

		${generateNormalPolarityCss(label, css.var(`_Y-bg-${label}`))}

		${generateReversePolarityCss(label, css.var(`_Y-bg-${label}`))}

		${generateTargetYCss(label)}

		--_con-lum-${label}: clamp(0, pow(${V_Y_FINAL}, 1 / 3), 1);

		--_con-max-chr-${label}: calc(
			${cssMaxChroma(V_CON_LUM, slice)}
		);
		--_con-chr-${label}: calc(${V_CON_MAX_CHR} * ${css.var('_chr-pct')});

		--${prefix}-color-${label}: oklch(${V_CON_LUM} ${V_CON_CHR} ${hue});
	`
}

/**
 * Generate CSS for OKLCH color with optional APCA-based contrast colors.
 *
 * Runtime inputs:
 * - `--lightness` (0-100), `--chroma` (0-100)
 * - `--contrast-{label}` (-108 to 108)
 *
 * Outputs:
 * - `--{prefix}-color`
 * - `--{prefix}-color-{label}`
 *
 * The generated CSS includes `@property` declarations for all custom properties,
 * enabling proper type checking, animation support, and initial values.
 */
export function generateColorCss(options: ColorGeneratorOptions) {
	const hue = ((options.hue % 360) + 360) % 360
	const slice = findGamutSlice(hue)
	const prefix = options.prefix ?? 'o'
	const contrastColors = options.contrastColors ?? []

	const labels = contrastColors.map((c) => c.label)
	for (const label of labels) {
		validateLabel(label)
	}
	validateUniqueLabels(labels)

	const propertyRules = generatePropertyRules(prefix, labels)

	const baseColorCss = generateBaseColorCss(hue, slice, prefix)

	const sharedYBackground =
		contrastColors.length > 0
			? outdent`
					/* Shared Y background for all contrast calculations */
					--_Y-bg: pow(${css.var('_lum-norm')}, 3);
				`
			: ''

	const contrastColorsCss = contrastColors
		.map(({ label }) => generateContrastColorCss(label, hue, slice, prefix))
		.join('\n\n')

	return outdent`
		${propertyRules}

		${options.selector} {
			${baseColorCss}

			${sharedYBackground}

			${contrastColorsCss}
		}
	`
}
