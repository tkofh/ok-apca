/**
 * CSS generation for OKLCH colors with APCA-based contrast.
 *
 * This module generates static CSS that computes gamut-mapped colors
 * and APCA-compliant contrast colors at runtime using CSS custom properties.
 *
 * The generated CSS accepts these input variables:
 * - `--lightness` (0-100): Perceptual lightness
 * - `--chroma` (0-100): Color saturation
 * - `--contrast` (0-108): Target APCA Lc value (only with contrast option)
 *
 * And outputs:
 * - `--o-color`: The gamut-mapped OKLCH color
 * - `--o-color-contrast`: The contrast color (only with contrast option)
 */

import { findGamutBoundary } from './color.ts'
import { fitHeuristicCoefficients, type HeuristicCoefficients } from './heuristic.ts'
import type { ColorGeneratorOptions, GamutBoundary } from './types.ts'
import { outdent } from './util.ts'

// ============================================================================
// CSS Variable Reference Constants
// ============================================================================
// These constants avoid repetitive var(--...) noise in CSS generation

// Base color variables
const V_LUM_NORM = 'var(--_lum-norm)'
const V_CHR_PCT = 'var(--_chr-pct)'
const V_CHR = 'var(--_chr)'
const V_LUM_MAX = 'var(--_lum-max)'
const V_CHR_PEAK = 'var(--_chr-peak)'
const V_TENT = 'var(--_tent)'

// Contrast calculation variables
const V_CONTRAST_SIGNED = 'var(--_contrast-signed)'
const V_LC_NORM = 'var(--_lc-norm)'
const V_Y_BG = 'var(--_Y-bg)'
const V_SMOOTH_T = 'var(--_smooth-t)'
const V_EP = 'var(--_ep)'
const V_USE_LIGHT = 'var(--_use-light)'
const V_PREFER_LIGHT = 'var(--_prefer-light)'
const V_PREFER_DARK = 'var(--_prefer-dark)'

// Normal polarity (dark text) variables
const V_Y_DARK = 'var(--_Y-dark)'
const V_Y_DARK_MIN = 'var(--_Y-dark-min)'
const V_Y_DARK_V = 'var(--_Y-dark-v)'
const V_DARK_OK = 'var(--_dark-ok)'
const V_LC_DARK = 'var(--_lc-dark)'

// Reverse polarity (light text) variables
const V_Y_LIGHT = 'var(--_Y-light)'
const V_Y_LIGHT_MIN = 'var(--_Y-light-min)'
const V_Y_LIGHT_V = 'var(--_Y-light-v)'
const V_LIGHT_OK = 'var(--_light-ok)'
const V_LC_LIGHT = 'var(--_lc-light)'

// Target selection variables
const V_Y_PREFERRED = 'var(--_Y-preferred)'
const V_PREFERRED_OK = 'var(--_preferred-ok)'
const V_Y_FALLBACK = 'var(--_Y-fallback)'
const V_FALLBACK_OK = 'var(--_fallback-ok)'
const V_Y_FINAL = 'var(--_Y-final)'
const V_Y_BEST = 'var(--_Y-best)'

// Contrast color output variables
const V_CON_LUM = 'var(--_con-lum)'
const V_CON_TENT = 'var(--_con-tent)'
const V_CON_CHR = 'var(--_con-chr)'

// Polarity-fixed variables
const V_POLARITY_LUM_NORM = 'var(--_polarity-lum-norm)'

// ============================================================================
// Utility Functions
// ============================================================================

function formatNumber(n: number, precision = 10) {
	const formatted = n.toFixed(precision)
	// Remove trailing zeros but keep at least one decimal place
	return formatted.replace(/\.?0+$/, '') || '0'
}

// ============================================================================
// CSS Expression Helpers
// ============================================================================

/**
 * Generates CSS to check if a luminance value is within the valid gamut (0 to 1).
 * Returns 1 if in gamut, 0 if out of gamut.
 *
 * Formula: (sign(Y + ε) + sign(1 - ε - Y)) / 2
 * Where ε is a small epsilon value to handle floating point precision.
 */
function cssIsInGamut(luminanceVar: string, epsilonVar = V_EP): string {
	return `calc((sign(${luminanceVar} + ${epsilonVar}) + sign(1 - ${epsilonVar} - ${luminanceVar})) / 2)`
}

/**
 * Converts a condition expression to a 0 or 1 boolean flag.
 * Clamps result to [0, 1] range.
 *
 * Formula: min(1, max(0, condition))
 */
function cssBooleanFlag(condition: string): string {
	return `min(1, max(0, ${condition}))`
}

/**
 * Generates a CSS sign-based comparison: returns 1 if a > b, 0 otherwise.
 * Small epsilon added to handle floating point edge cases.
 *
 * Formula: sign(a - b + 0.0001)
 */
function cssGreaterThan(a: string, b: string): string {
	return `sign(${a} - ${b} + 0.0001)`
}

/**
 * Generates tent function for gamut mapping chroma based on lightness.
 * The tent function determines the maximum chroma available at a given lightness
 * by computing the minimum of the distance from both lightness boundaries.
 *
 * Formula: min(L/L_max, (1-L)/(1-L_max))
 *
 * @param lightnessVar - Current lightness value (0 to 1)
 * @param lMaxValue - Maximum lightness where peak chroma occurs
 */
function cssTentFunction(lightnessVar: string, lMaxValue: string): string {
	return outdent`
		min(
			${lightnessVar} / ${lMaxValue},
			(1 - ${lightnessVar}) / (1 - ${lMaxValue})
		)
	`
}

/**
 * Generates cubic Hermite interpolation (smoothstep with velocity control).
 * Used by APCA for smooth transitions near the perceptual threshold.
 *
 * Formula: p₀ + (-3p₀ + 3p₁ - v₁)t² + (2p₀ - 2p₁ + v₁)t³
 *
 * @param startValue - p₀: Starting value
 * @param endValue - p₁: Ending value
 * @param endVelocity - v₁: Velocity at endpoint (controls curve shape)
 * @param tParameter - t: Interpolation parameter (0 to 1)
 */
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

/**
 * Estimates APCA contrast for normal polarity (darker text on lighter background).
 * Normal polarity uses the standard APCA formula where background is lighter than text.
 *
 * APCA Formula: Lc = 1.14 × (Y_bg^0.56 - Y_fg^0.57) - 0.027
 *
 * @param bgLuminanceVar - Background luminance Y value
 * @param fgLuminanceVar - Foreground (text) luminance Y value
 * @returns APCA Lc value (contrast)
 */
function cssApcaNormalContrast(bgLuminanceVar: string, fgLuminanceVar: string): string {
	return `calc(1.14 * (pow(${bgLuminanceVar}, 0.56) - pow(clamp(0, ${fgLuminanceVar}, 1), 0.57)) - 0.027)`
}

/**
 * Estimates APCA contrast for reverse polarity (lighter text on darker background).
 * Reverse polarity uses a modified APCA formula where text is lighter than background.
 *
 * APCA Formula: Lc = 1.14 × (Y_fg^0.62 - Y_bg^0.65) - 0.027
 *
 * @param bgLuminanceVar - Background luminance Y value
 * @param fgLuminanceVar - Foreground (text) luminance Y value
 * @returns APCA Lc value (contrast)
 */
function cssApcaReverseContrast(bgLuminanceVar: string, fgLuminanceVar: string): string {
	return `calc(1.14 * (pow(clamp(0, ${fgLuminanceVar}, 1), 0.62) - pow(${bgLuminanceVar}, 0.65)) - 0.027)`
}

/**
 * Generates CSS to select the best fallback luminance when both polarities are out of gamut.
 * Chooses whichever polarity achieves higher contrast.
 *
 * @param normalVar - Normal polarity (darker) luminance variable
 * @param reverseVar - Reverse polarity (lighter) luminance variable
 * @param normalContrast - Estimated contrast for normal polarity
 * @param reverseContrast - Estimated contrast for reverse polarity
 */
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

// ============================================================================
// CSS Block Generators
// ============================================================================

function generateBaseColorCss(selector: string, hue: number, boundary: GamutBoundary) {
	const lMax = formatNumber(boundary.lMax)
	const cPeak = formatNumber(boundary.cPeak)

	return outdent`
		${selector} {
			/* Runtime inputs: --lightness (0-100), --chroma (0-100 as % of max) */
			--_lum-norm: clamp(0, var(--lightness) / 100, 1);
			--_chr-pct: clamp(0, var(--chroma) / 100, 1);

			/* Build-time constants for hue ${hue} */
			--_lum-max: ${lMax};
			--_chr-peak: ${cPeak};

			/* Tent function: min(L/L_max, (1-L)/(1-L_max)) */
			--_tent: ${cssTentFunction(V_LUM_NORM, V_LUM_MAX)};

			/* Chroma as percentage of maximum available at this lightness */
			--_chr: calc(${V_CHR_PEAK} * ${V_TENT} * ${V_CHR_PCT});

			/* Output color */
			--o-color: oklch(${V_LUM_NORM} ${V_CHR} ${hue});
		}
	`
}

/**
 * Generate CSS for normal polarity APCA (darker contrast color).
 * Used for force-dark and prefer-dark modes.
 */
function generateNormalPolarityCss() {
	// Simplified APCA formula component for threshold calculation
	const apcaTermThreshold = `(pow(${V_Y_BG}, 0.56) - (${V_SMOOTH_T} + 0.027) / 1.14)`
	const apcaTermDynamic = `(pow(${V_Y_BG}, 0.56) - (${V_LC_NORM} + 0.027) / 1.14)`

	// Direct solution when above threshold: solve APCA formula for foreground Y
	const directSolution = outdent`
		pow(abs(${apcaTermDynamic}), 1 / 0.57) *
		sign(${apcaTermDynamic})
	`

	// Bezier interpolation when below threshold
	const tParameter = `${V_LC_NORM} / ${V_SMOOTH_T}`
	const bezierInterpolation = cssHermiteInterpolation(V_Y_BG, V_Y_DARK_MIN, V_Y_DARK_V, tParameter)

	// Branch selection flag: 1 if above threshold, 0 if below
	const aboveThreshold = cssBooleanFlag(`sign(${V_LC_NORM} - ${V_SMOOTH_T}) + 1`)

	return outdent`
		/* Normal polarity: solve for darker Y (dark text on light background) */
		--_Y-dark-min: calc(
			pow(abs(${apcaTermThreshold}), 1 / 0.57) *
			sign(${apcaTermThreshold})
		);
		--_Y-dark-v: calc(-1 * abs((pow(abs(${V_Y_DARK_MIN}), 0.43) * ${V_SMOOTH_T}) / 0.6498));
		--_Y-dark: calc(
			${aboveThreshold} * (${directSolution}) +
			(1 - ${aboveThreshold}) * (${bezierInterpolation})
		);
		--_dark-ok: ${cssIsInGamut(V_Y_DARK)};
	`
}

/**
 * Generate CSS for reverse polarity APCA (lighter contrast color).
 * Used for force-light and prefer-light modes.
 */
function generateReversePolarityCss() {
	// Simplified APCA formula component for threshold calculation
	const apcaTermThreshold = `(pow(${V_Y_BG}, 0.65) + (${V_SMOOTH_T} + 0.027) / 1.14)`
	const apcaTermDynamic = `(pow(${V_Y_BG}, 0.65) - ((-1 * ${V_LC_NORM}) - 0.027) / 1.14)`

	// Direct solution when above threshold: solve APCA formula for foreground Y
	const directSolution = `pow(${apcaTermDynamic}, 1 / 0.62)`

	// Bezier interpolation when below threshold
	const tParameter = `${V_LC_NORM} / ${V_SMOOTH_T}`
	const bezierInterpolation = cssHermiteInterpolation(
		V_Y_BG,
		V_Y_LIGHT_MIN,
		V_Y_LIGHT_V,
		tParameter,
	)

	// Branch selection flag: 1 if above threshold, 0 if below
	const aboveThreshold = cssBooleanFlag(`sign(${V_LC_NORM} - ${V_SMOOTH_T}) + 1`)

	return outdent`
		/* Reverse polarity: solve for lighter Y (light text on dark background) */
		--_Y-light-min: calc(
			pow(abs(${apcaTermThreshold}), 1 / 0.62) *
			sign(${apcaTermThreshold})
		);
		--_Y-light-v: calc(-1 * abs((pow(abs(${V_Y_LIGHT_MIN}), 0.38) * -1 * ${V_SMOOTH_T}) / 0.7068));
		--_Y-light: calc(
			${aboveThreshold} * (${directSolution}) +
			(1 - ${aboveThreshold}) * (${bezierInterpolation})
		);
		--_light-ok: ${cssIsInGamut(V_Y_LIGHT)};
	`
}

/**
 * Generate CSS for target Y selection based on signed contrast.
 */
function generateTargetYCss() {
	return outdent`
		/* Select preferred polarity based on contrast sign */
		/* use-light: -1 if negative (prefer light text), 1 if positive (prefer dark text) */
		--_use-light: sign(${V_CONTRAST_SIGNED} - 0.0001);
		--_prefer-light: ${cssBooleanFlag(`-1 * ${V_USE_LIGHT}`)};
		--_prefer-dark: ${cssBooleanFlag(V_USE_LIGHT)};

		--_Y-preferred: calc(
			${V_PREFER_LIGHT} * ${V_Y_LIGHT} +
			${V_PREFER_DARK} * ${V_Y_DARK}
		);

		--_preferred-ok: calc(
			${V_PREFER_LIGHT} * ${V_LIGHT_OK} +
			${V_PREFER_DARK} * ${V_DARK_OK}
		);

		/* Fallback polarity (opposite of preferred) */
		--_Y-fallback: calc(
			${V_PREFER_LIGHT} * ${V_Y_DARK} +
			${V_PREFER_DARK} * ${V_Y_LIGHT}
		);

		--_fallback-ok: calc(
			${V_PREFER_LIGHT} * ${V_DARK_OK} +
			${V_PREFER_DARK} * ${V_LIGHT_OK}
		);

		/* Best contrast fallback when both are out of gamut */
		/* Estimate contrast for each polarity using APCA formulas */
		--_lc-dark: ${cssApcaNormalContrast(V_Y_BG, V_Y_DARK)};
		--_lc-light: ${cssApcaReverseContrast(V_Y_BG, V_Y_LIGHT)};
		--_Y-best: ${cssBestContrastFallback(V_Y_DARK, V_Y_LIGHT, V_LC_DARK, V_LC_LIGHT)};

		/* Final Y selection */
		--_Y-final: calc(
			/* Use preferred if in gamut */
			${V_PREFERRED_OK} * clamp(0, ${V_Y_PREFERRED}, 1) +
			/* Use fallback if preferred out of gamut and inversion allowed */
			(1 - ${V_PREFERRED_OK}) * var(--allow-polarity-inversion) * ${V_FALLBACK_OK} * clamp(0, ${V_Y_FALLBACK}, 1) +
			/* Use best contrast if both out of gamut and inversion allowed */
			(1 - ${V_PREFERRED_OK}) * var(--allow-polarity-inversion) * (1 - ${V_FALLBACK_OK}) * clamp(0, ${V_Y_BEST}, 1) +
			/* Force preferred if inversion not allowed (even if out of gamut) */
			(1 - ${V_PREFERRED_OK}) * (1 - var(--allow-polarity-inversion)) * clamp(0, ${V_Y_PREFERRED}, 1)
		);
	`
}

/**
 * Generate CSS for .polarity-fixed override.
 * Allows polarity decision to be based on --polarity-from instead of --lightness.
 */
function generatePolarityFixedCss(): string {
	return outdent`
		&.polarity-fixed {
			/* Override polarity decision to use --polarity-from (fallback to --lightness) */
			--_polarity-lum-norm: clamp(0, var(--polarity-from, var(--lightness)) / 100, 1);
			--_Y-bg: pow(${V_POLARITY_LUM_NORM}, 3);
		}
	`
}

function generateHeuristicCss(coefficients: HeuristicCoefficients): string {
	const fmt = (n: number) => formatNumber(n, 6)

	return outdent`
		/* Heuristic correction to prevent under-delivery of contrast */
		/* Uses multiplicative boost for smooth interpolation from 0 */
		/* boostPct = (darkBoost * max(0, 0.3 - L) + midBoost * max(0, 1 - |L - 0.5| * 2.5)) / 100 */
		/* adjusted = target * (1 + boostPct) + contrastBoost * max(0, target - 30) */
		--_boost-pct: calc(
			(${fmt(coefficients.darkBoost)} * max(0, 0.3 - ${V_LUM_NORM}) +
		 ${fmt(coefficients.midBoost)} * max(0, 1 - abs(${V_LUM_NORM} - 0.5) * 2.5)) / 100
		);
		--_boost-multiplicative: calc(var(--contrast) * var(--_boost-pct));
		--_boost-absolute: calc(${fmt(coefficients.contrastBoost)} * max(0, var(--contrast) - 30));
		--_contrast-adjusted: calc(var(--contrast) + var(--_boost-multiplicative) + var(--_boost-absolute));
	`
}

function generateContrastCss(
	selector: string,
	contrastSelector: string,
	hue: number,
	boundary: GamutBoundary,
	allowPolarityInversion: boolean,
) {
	const lMax = formatNumber(boundary.lMax)
	const cPeak = formatNumber(boundary.cPeak)

	// Fit heuristic coefficients for this specific hue and polarity inversion flag
	const { coefficients } = fitHeuristicCoefficients(hue, allowPolarityInversion)

	// Heuristic correction CSS
	const heuristicCss = generateHeuristicCss(coefficients)

	return outdent`
		${selector}${contrastSelector} {
			/* Runtime inputs: --contrast (-108 to 108), --allow-polarity-inversion (0 or 1) */
			${heuristicCss}

			--_contrast-signed: clamp(-108, -1 * var(--contrast), 108);
			--_lc-norm: calc(abs(${V_CONTRAST_SIGNED}) / 100);

			/* Simplified L to luminance Y (ignoring chroma contribution) */
			--_Y-bg: pow(${V_LUM_NORM}, 3);

			/* APCA threshold for Bezier smoothing */
			--_smooth-t: 0.022;
			--_ep: 0.0001;

			/* Always compute both polarities */
			${generateNormalPolarityCss()}

			${generateReversePolarityCss()}

			/* Target Y selection */
			${generateTargetYCss()}

			/* Contrast lightness from cube root (inverse of Y = L³) */
			--_con-lum: clamp(0, pow(${V_Y_FINAL}, 1 / 3), 1);

			/* Gamut-map contrast color's chroma */
			--_con-tent: ${cssTentFunction(V_CON_LUM, lMax)};
			--_con-chr: calc(${cPeak} * ${V_CON_TENT} * ${V_CHR_PCT});

			/* Output contrast color */
			--o-color-contrast: oklch(${V_CON_LUM} ${V_CON_CHR} ${hue});

			${generatePolarityFixedCss()}
		}
	`
}

/**
 * Generate CSS for an OKLCH color with optional APCA-based contrast.
 *
 * The generated CSS uses CSS custom properties for runtime configuration:
 * - Set `--lightness` (0-100) and `--chroma` (0-100) to control the color
 * - Set `--contrast` (-108 to 108) to control the contrast level (if contrast enabled)
 * - Set `--allow-polarity-inversion` (0 or 1) to allow fallback to opposite polarity
 *
 * Output variables:
 * - `--o-color`: The gamut-mapped OKLCH color
 * - `--o-color-contrast`: The contrast color (if contrast enabled)
 *
 * @example
 * ```ts
 * const css = generateColorCss({
 *   hue: 30,
 *   selector: '.orange',
 *   contrast: { allowPolarityInversion: true }
 * })
 * ```
 *
 * @param options - Configuration options
 * @returns CSS string ready to embed in a stylesheet
 */
export function generateColorCss(options: ColorGeneratorOptions) {
	const hue = ((options.hue % 360) + 360) % 360
	const boundary = findGamutBoundary(hue)

	let css = generateBaseColorCss(options.selector, hue, boundary)

	if (options.contrast) {
		const contrastSelector = options.contrast.selector ?? '&.contrast'

		css += `\n\n${generateContrastCss(
			options.selector,
			contrastSelector.startsWith('&') ? contrastSelector.slice(1) : ` ${contrastSelector}`,
			hue,
			boundary,
			options.contrast.allowPolarityInversion,
		)}`
	}

	return css
}
