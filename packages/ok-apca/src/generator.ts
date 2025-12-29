/**
 * CSS generation for OKLCH colors with APCA-based contrast.
 *
 * Generates static CSS that accepts runtime inputs:
 * - `--lightness` (0-100), `--chroma` (0-100)
 * - `--contrast-{label}` (-108 to 108)
 *
 * And outputs:
 * - `--{prefix}-color`: Gamut-mapped OKLCH color
 * - `--{prefix}-color-{label}`: Contrast colors
 */

import { findGamutSlice } from './color.ts'
import { fitHeuristicCoefficients } from './heuristic.ts'
import type { ColorGeneratorOptions, GamutSlice, HeuristicCoefficients } from './types.ts'
import { outdent } from './util.ts'

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

function cssVar(name: string, label?: string): string {
	return label ? `var(--_${name}-${label})` : `var(--_${name})`
}

function formatNumber(n: number, precision = 10) {
	const formatted = n.toFixed(precision)
	return formatted.replace(/\.?0+$/, '') || '0'
}

function cssIsInGamut(luminanceVar: string, epsilonVar = 'var(--_ep)'): string {
	return `calc((sign(${luminanceVar} + ${epsilonVar}) + sign(1 - ${epsilonVar} - ${luminanceVar})) / 2)`
}

function cssBooleanFlag(condition: string): string {
	return `min(1, max(0, ${condition}))`
}

function cssGreaterThan(a: string, b: string): string {
	return `sign(${a} - ${b} + 0.0001)`
}

/**
 * Generate CSS for the max chroma calculation with curvature correction.
 * Left half: linear from origin to apex
 * Right half: linear with quadratic curvature correction
 *
 * @param curveScale - Pre-multiplied curvature * apexChroma for efficiency
 */
function cssMaxChroma(
	lightness: string,
	apexLightness: string,
	apexChroma: string,
	curveScale: string,
): string {
	// t = (L - lMax) / (1 - lMax), clamped to right half only
	const tExpr = `max(0, (${lightness} - ${apexLightness}) / (1 - ${apexLightness}))`

	// Left half: L / lMax * cMax
	const leftHalf = `${lightness} / ${apexLightness} * ${apexChroma}`

	// Right half: (1 - L) / (1 - lMax) * cMax + (k * cMax) * t * (1 - t)
	const linearRight = `(1 - ${lightness}) / (1 - ${apexLightness}) * ${apexChroma}`
	const correction = `${curveScale} * (${tExpr}) * (1 - (${tExpr}))`
	const rightHalf = `${linearRight} + ${correction}`

	// Use sign to select left or right half
	// When L <= lMax: sign(lMax - L) >= 0, use left
	// When L > lMax: sign(lMax - L) < 0, use right
	const isRightHalf = `max(0, sign(${lightness} - ${apexLightness}))`

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

function cssApcaNormalContrast(bgLuminanceVar: string, fgLuminanceVar: string): string {
	return `calc(1.14 * (pow(${bgLuminanceVar}, 0.56) - pow(clamp(0, ${fgLuminanceVar}, 1), 0.57)) - 0.027)`
}

function cssApcaReverseContrast(bgLuminanceVar: string, fgLuminanceVar: string): string {
	return `calc(1.14 * (pow(clamp(0, ${fgLuminanceVar}, 1), 0.62) - pow(${bgLuminanceVar}, 0.65)) - 0.027)`
}

function cssBestContrastFallback(
	normalVar: string,
	reverseVar: string,
	normalContrast: string,
	reverseContrast: string,
): string {
	return outdent`
		calc(
			max(0, ${cssGreaterThan(reverseContrast, normalContrast)}) * clamp(0, ${reverseVar}, 1) +
			max(0, ${cssGreaterThan(normalContrast, reverseContrast)}) * clamp(0, ${normalVar}, 1)
		)
	`
}

function generateBaseColorCss(hue: number, slice: GamutSlice, prefix: string) {
	const apexLightness = formatNumber(slice.apex.lightness)
	const apexChroma = formatNumber(slice.apex.chroma)
	const curveScale = formatNumber(slice.curvature * slice.apex.chroma)

	return outdent`
		/* Runtime inputs: --lightness (0-100), --chroma (0-100 as % of max) */
		--_lum-norm: clamp(0, var(--lightness) / 100, 1);
		--_chr-pct: clamp(0, var(--chroma) / 100, 1);

		/* Build-time constants for hue ${hue} (gamut slice) */
		--_apex-lum: ${apexLightness};
		--_apex-chr: ${apexChroma};
		--_curve-scale: ${curveScale};

		/* Max chroma at this lightness (tent with curvature correction) */
		--_max-chr: calc(
			${cssMaxChroma('var(--_lum-norm)', 'var(--_apex-lum)', 'var(--_apex-chr)', 'var(--_curve-scale)')}
		);

		/* Chroma as percentage of maximum available at this lightness */
		--_chr: calc(var(--_max-chr) * var(--_chr-pct));

		/* Output color */
		--${prefix}-color: oklch(var(--_lum-norm) var(--_chr) ${hue});
	`
}

function generateHeuristicCss(coefficients: HeuristicCoefficients, label: string): string {
	const fmt = (n: number) => formatNumber(n, 6)

	return outdent`
		/* Heuristic correction to prevent under-delivery of contrast */
		/* Uses multiplicative boost for smooth interpolation from 0 */
		/* boostPct = (darkBoost * max(0, 0.3 - L) + midBoost * max(0, 1 - |L - 0.5| * 2.5)) / 100 */
		/* adjusted = target * (1 + boostPct) + contrastBoost * max(0, target - 30) */
		--_boost-pct-${label}: calc(
			(${fmt(coefficients.darkBoost)} * max(0, 0.3 - var(--_lum-norm)) +
		 ${fmt(coefficients.midBoost)} * max(0, 1 - abs(var(--_lum-norm) - 0.5) * 2.5)) / 100
		);
		--_boost-multiplicative-${label}: calc(var(--contrast-${label}, 0) * var(--_boost-pct-${label}));
		--_boost-absolute-${label}: calc(${fmt(coefficients.contrastBoost)} * max(0, var(--contrast-${label}, 0) - 30));
		--_contrast-adjusted-${label}: calc(var(--contrast-${label}, 0) + var(--_boost-multiplicative-${label}) + var(--_boost-absolute-${label}));
	`
}

function generateNormalPolarityCss(label: string, yBgVar: string) {
	const V_SMOOTH_T = cssVar('smooth-t', label)
	const V_LC_NORM = cssVar('lc-norm', label)
	const V_Y_DARK_MIN = cssVar('Y-dark-min', label)
	const V_Y_DARK_V = cssVar('Y-dark-v', label)
	const V_Y_DARK = cssVar('Y-dark', label)

	const apcaTermThreshold = `(pow(${yBgVar}, 0.56) - (${V_SMOOTH_T} + 0.027) / 1.14)`
	const apcaTermDynamic = `(pow(${yBgVar}, 0.56) - (${V_LC_NORM} + 0.027) / 1.14)`

	const directSolution = outdent`
		pow(abs(${apcaTermDynamic}), 1 / 0.57) *
		sign(${apcaTermDynamic})
	`

	const tParameter = `${V_LC_NORM} / ${V_SMOOTH_T}`
	const bezierInterpolation = cssHermiteInterpolation(yBgVar, V_Y_DARK_MIN, V_Y_DARK_V, tParameter)

	const aboveThreshold = cssBooleanFlag(`sign(${V_LC_NORM} - ${V_SMOOTH_T}) + 1`)

	const V_DARK_OK_VALUE = cssIsInGamut(V_Y_DARK)

	return outdent`
		/* Normal polarity: solve for darker Y (dark text on light background) */
		--_Y-dark-min-${label}: calc(
			pow(abs(${apcaTermThreshold}), 1 / 0.57) *
			sign(${apcaTermThreshold})
		);
		--_Y-dark-v-${label}: calc(-1 * abs((pow(abs(${V_Y_DARK_MIN}), 0.43) * ${V_SMOOTH_T}) / 0.6498));
		--_Y-dark-${label}: calc(
			${aboveThreshold} * (${directSolution}) +
			(1 - ${aboveThreshold}) * (${bezierInterpolation})
		);
		--_dark-ok-${label}: ${V_DARK_OK_VALUE};
	`
}

function generateReversePolarityCss(label: string, yBgVar: string) {
	const V_SMOOTH_T = cssVar('smooth-t', label)
	const V_LC_NORM = cssVar('lc-norm', label)
	const V_Y_LIGHT_MIN = cssVar('Y-light-min', label)
	const V_Y_LIGHT_V = cssVar('Y-light-v', label)
	const V_Y_LIGHT = cssVar('Y-light', label)

	const apcaTermThreshold = `(pow(${yBgVar}, 0.65) + (${V_SMOOTH_T} + 0.027) / 1.14)`
	const apcaTermDynamic = `(pow(${yBgVar}, 0.65) - ((-1 * ${V_LC_NORM}) - 0.027) / 1.14)`

	const directSolution = `pow(${apcaTermDynamic}, 1 / 0.62)`

	const tParameter = `${V_LC_NORM} / ${V_SMOOTH_T}`
	const bezierInterpolation = cssHermiteInterpolation(
		yBgVar,
		V_Y_LIGHT_MIN,
		V_Y_LIGHT_V,
		tParameter,
	)

	const aboveThreshold = cssBooleanFlag(`sign(${V_LC_NORM} - ${V_SMOOTH_T}) + 1`)

	const V_LIGHT_OK_VALUE = cssIsInGamut(V_Y_LIGHT)

	return outdent`
		/* Reverse polarity: solve for lighter Y (light text on dark background) */
		--_Y-light-min-${label}: calc(
			pow(abs(${apcaTermThreshold}), 1 / 0.62) *
			sign(${apcaTermThreshold})
		);
		--_Y-light-v-${label}: calc(-1 * abs((pow(abs(${V_Y_LIGHT_MIN}), 0.38) * -1 * ${V_SMOOTH_T}) / 0.7068));
		--_Y-light-${label}: calc(
			${aboveThreshold} * (${directSolution}) +
			(1 - ${aboveThreshold}) * (${bezierInterpolation})
		);
		--_light-ok-${label}: ${V_LIGHT_OK_VALUE};
	`
}

function generateTargetYCss(label: string) {
	const V_CONTRAST_SIGNED = cssVar('contrast-signed', label)
	const V_USE_LIGHT = cssVar('use-light', label)
	const V_PREFER_LIGHT = cssVar('prefer-light', label)
	const V_PREFER_DARK = cssVar('prefer-dark', label)
	const V_Y_LIGHT = cssVar('Y-light', label)
	const V_Y_DARK = cssVar('Y-dark', label)
	const V_Y_PREFERRED = cssVar('Y-preferred', label)
	const V_PREFERRED_OK = cssVar('preferred-ok', label)
	const V_LIGHT_OK = cssVar('light-ok', label)
	const V_DARK_OK = cssVar('dark-ok', label)
	const V_Y_FALLBACK = cssVar('Y-fallback', label)
	const V_FALLBACK_OK = cssVar('fallback-ok', label)
	const V_LC_DARK = cssVar('lc-dark', label)
	const V_LC_LIGHT = cssVar('lc-light', label)
	const V_Y_BEST = cssVar('Y-best', label)
	const V_Y_BG = cssVar('Y-bg', label)

	return outdent`
		/* Select preferred polarity based on contrast sign */
		/* use-light: -1 if negative (prefer light text), 1 if positive (prefer dark text) */
		--_use-light-${label}: sign(${V_CONTRAST_SIGNED} - 0.0001);
		--_prefer-light-${label}: ${cssBooleanFlag(`-1 * ${V_USE_LIGHT}`)};
		--_prefer-dark-${label}: ${cssBooleanFlag(V_USE_LIGHT)};

		--_Y-preferred-${label}: calc(
			${V_PREFER_LIGHT} * ${V_Y_LIGHT} +
			${V_PREFER_DARK} * ${V_Y_DARK}
		);

		--_preferred-ok-${label}: calc(
			${V_PREFER_LIGHT} * ${V_LIGHT_OK} +
			${V_PREFER_DARK} * ${V_DARK_OK}
		);

		/* Fallback polarity (opposite of preferred) */
		--_Y-fallback-${label}: calc(
			${V_PREFER_LIGHT} * ${V_Y_DARK} +
			${V_PREFER_DARK} * ${V_Y_LIGHT}
		);

		--_fallback-ok-${label}: calc(
			${V_PREFER_LIGHT} * ${V_DARK_OK} +
			${V_PREFER_DARK} * ${V_LIGHT_OK}
		);

		/* Best contrast fallback when both are out of gamut */
		/* Estimate contrast for each polarity using APCA formulas */
		--_lc-dark-${label}: ${cssApcaNormalContrast(V_Y_BG, V_Y_DARK)};
		--_lc-light-${label}: ${cssApcaReverseContrast(V_Y_BG, V_Y_LIGHT)};
		--_Y-best-${label}: ${cssBestContrastFallback(V_Y_DARK, V_Y_LIGHT, V_LC_DARK, V_LC_LIGHT)};

		/* Final Y selection */
		--_Y-final-${label}: calc(
			/* Use preferred if in gamut */
			${V_PREFERRED_OK} * clamp(0, ${V_Y_PREFERRED}, 1) +
			/* Use fallback if preferred out of gamut and inversion allowed */
			(1 - ${V_PREFERRED_OK}) * var(--allow-polarity-inversion-${label}, 0) * ${V_FALLBACK_OK} * clamp(0, ${V_Y_FALLBACK}, 1) +
			/* Use best contrast if both out of gamut and inversion allowed */
			(1 - ${V_PREFERRED_OK}) * var(--allow-polarity-inversion-${label}, 0) * (1 - ${V_FALLBACK_OK}) * clamp(0, ${V_Y_BEST}, 1) +
			/* Force preferred if inversion not allowed (even if out of gamut) */
			(1 - ${V_PREFERRED_OK}) * (1 - var(--allow-polarity-inversion-${label}, 0)) * clamp(0, ${V_Y_PREFERRED}, 1)
		);
	`
}

function generateContrastColorCss(
	label: string,
	hue: number,
	slice: GamutSlice,
	prefix: string,
): string {
	const apexLightness = formatNumber(slice.apex.lightness)
	const apexChroma = formatNumber(slice.apex.chroma)
	const curveScale = formatNumber(slice.curvature * slice.apex.chroma)

	const { coefficients } = fitHeuristicCoefficients(hue, true)

	const V_Y_FINAL = cssVar('Y-final', label)
	const V_CON_LUM = cssVar('con-lum', label)
	const V_CON_MAX_CHR = cssVar('con-max-chr', label)
	const V_CON_CHR = cssVar('con-chr', label)

	return outdent`
		/* Contrast color: ${label} */
		${generateHeuristicCss(coefficients, label)}

		--_contrast-signed-${label}: clamp(-108, -1 * var(--_contrast-adjusted-${label}), 108);
		--_lc-norm-${label}: calc(abs(var(--_contrast-signed-${label})) / 100);

		--_Y-bg-${label}: var(--_Y-bg);

		--_smooth-t-${label}: 0.022;
		--_ep-${label}: 0.0001;

		${generateNormalPolarityCss(label, cssVar('Y-bg', label))}

		${generateReversePolarityCss(label, cssVar('Y-bg', label))}

		${generateTargetYCss(label)}

		--_con-lum-${label}: clamp(0, pow(${V_Y_FINAL}, 1 / 3), 1);

		--_con-max-chr-${label}: calc(
			${cssMaxChroma(V_CON_LUM, apexLightness, apexChroma, curveScale)}
		);
		--_con-chr-${label}: calc(${V_CON_MAX_CHR} * var(--_chr-pct));

		--${prefix}-color-${label}: oklch(${V_CON_LUM} ${V_CON_CHR} ${hue});
	`
}

const POLARITY_FIXED_CSS = outdent`
	&.polarity-fixed {
		/* Override polarity decision to use --polarity-from (fallback to --lightness) */
		--_polarity-lum-norm: clamp(0, var(--polarity-from, var(--lightness)) / 100, 1);
		--_Y-bg: pow(var(--_polarity-lum-norm), 3);
	}
`

/**
 * Generate CSS for OKLCH color with optional APCA-based contrast colors.
 *
 * Runtime inputs:
 * - `--lightness` (0-100), `--chroma` (0-100)
 * - `--contrast-{label}` (-108 to 108)
 * - `--allow-polarity-inversion-{label}` (0 or 1)
 *
 * Outputs:
 * - `--{prefix}-color`
 * - `--{prefix}-color-{label}`
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

	const baseColorCss = generateBaseColorCss(hue, slice, prefix)

	const sharedYBackground =
		contrastColors.length > 0
			? outdent`
					/* Shared Y background for all contrast calculations */
					--_Y-bg: pow(var(--_lum-norm), 3);
				`
			: ''

	const contrastColorsCss = contrastColors
		.map(({ label }) => generateContrastColorCss(label, hue, slice, prefix))
		.join('\n\n')

	const polarityFixedCss = contrastColors.length > 0 ? POLARITY_FIXED_CSS : ''

	return outdent`
		${options.selector} {
			${baseColorCss}

			${sharedYBackground}

			${contrastColorsCss}

			${polarityFixedCss}
		}
	`
}
