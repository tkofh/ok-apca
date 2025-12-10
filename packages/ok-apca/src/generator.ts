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
import type { ColorGeneratorOptions, ContrastMode, GamutBoundary } from './types.ts'
import { outdent } from './util.ts'

function formatNumber(n: number, precision = 10) {
	const formatted = n.toFixed(precision)
	// Remove trailing zeros but keep at least one decimal place
	return formatted.replace(/\.?0+$/, '') || '0'
}

function generateBaseColorCss(selector: string, hue: number, boundary: GamutBoundary) {
	const lMax = formatNumber(boundary.lMax)
	const cPeak = formatNumber(boundary.cPeak)

	return outdent`
    ${selector} {
      /* Runtime inputs: --lightness (0-100), --chroma (0-100) */
      --_l: clamp(0, var(--lightness) / 100, 1);
      --_c-req: clamp(0, var(--chroma) / 100, 1);

      /* Build-time constants for hue ${hue} */
      --_L-MAX: ${lMax};
      --_C-PEAK: ${cPeak};

      /* Tent function: min(L/L_MAX, (1-L)/(1-L_MAX)) */
      --_tent: min(
        var(--_l) / var(--_L-MAX),
        (1 - var(--_l)) / (1 - var(--_L-MAX))
      );

      /* Gamut-mapped chroma */
      --_c: min(var(--_c-req), calc(var(--_C-PEAK) * var(--_tent)));

      /* Output color */
      --o-color: oklch(var(--_l) var(--_c) ${hue});
    }
  `
}

/**
 * Generate CSS for normal polarity APCA (darker contrast color).
 * Used for force-dark and prefer-dark modes.
 */
function generateNormalPolarityCss() {
	return outdent`
    /* Normal polarity: solve for darker Y */
    --_xn-min: calc(
      pow(abs(pow(var(--_y), 0.56) - (var(--_apca-t) + 0.027) / 1.14), 1 / 0.57) *
      sign(pow(var(--_y), 0.56) - (var(--_apca-t) + 0.027) / 1.14)
    );
    --_xn-v: calc(-1 * abs((pow(abs(var(--_xn-min)), 0.43) * var(--_apca-t)) / 0.6498));
    --_xn: calc(
      min(1, max(0, sign(var(--_x) - var(--_apca-t)) + 1)) *
      pow(abs(pow(var(--_y), 0.56) - (var(--_x) + 0.027) / 1.14), 1 / 0.57) *
      sign(pow(var(--_y), 0.56) - (var(--_x) + 0.027) / 1.14) +
      (1 - min(1, max(0, sign(var(--_x) - var(--_apca-t)) + 1))) * (
        var(--_y) +
        (-3 * var(--_y) + 3 * var(--_xn-min) - var(--_xn-v)) * pow(var(--_x) / var(--_apca-t), 2) +
        (2 * var(--_y) - 2 * var(--_xn-min) + var(--_xn-v)) * pow(var(--_x) / var(--_apca-t), 3)
      )
    );
    --_xn-in-gamut: calc((sign(var(--_xn) + var(--_ep)) + sign(1 - var(--_ep) - var(--_xn))) / 2);
  `
}

/**
 * Generate CSS for reverse polarity APCA (lighter contrast color).
 * Used for force-light and prefer-light modes.
 */
function generateReversePolarityCss() {
	return outdent`
    /* Reverse polarity: solve for lighter Y */
    --_xr-min: calc(
      pow(abs(pow(var(--_y), 0.65) + (var(--_apca-t) + 0.027) / 1.14), 1 / 0.62) *
      sign(pow(var(--_y), 0.65) + (var(--_apca-t) + 0.027) / 1.14)
    );
    --_xr-v: calc(-1 * abs((pow(abs(var(--_xr-min)), 0.38) * -1 * var(--_apca-t)) / 0.7068));
    --_xr: calc(
      min(1, max(0, sign(var(--_x) - var(--_apca-t)) + 1)) *
      pow(pow(var(--_y), 0.65) - ((-1 * var(--_x)) - 0.027) / 1.14, 1 / 0.62) +
      (1 - min(1, max(0, sign(var(--_x) - var(--_apca-t)) + 1))) * (
        var(--_y) +
        (-3 * var(--_y) + 3 * var(--_xr-min) - var(--_xr-v)) * pow(var(--_x) / var(--_apca-t), 2) +
        (2 * var(--_y) - 2 * var(--_xr-min) + var(--_xr-v)) * pow(var(--_x) / var(--_apca-t), 3)
      )
    );
    --_xr-in-gamut: calc((sign(var(--_xr) + var(--_ep)) + sign(1 - var(--_ep) - var(--_xr))) / 2);
  `
}

/**
 * Generate CSS for target Y selection based on mode.
 */
function generateTargetYCss(mode: ContrastMode) {
	switch (mode) {
		case 'force-light':
			// Light contrast text = reverse polarity (higher Y)
			return '--_target-y: clamp(0, var(--_xr), 1);'
		case 'force-dark':
			// Dark contrast text = normal polarity (lower Y)
			return '--_target-y: clamp(0, var(--_xn), 1);'
		case 'prefer-light':
			// Prefer light: use reverse if in gamut, fall back to normal if in gamut,
			// otherwise choose whichever achieves higher contrast
			return outdent`
        /* Estimate contrast for each polarity using APCA formulas */
        /* Normal (darker): Lc = 1.14 * (Ybg^0.56 - Yfg^0.57) - 0.027 */
        --_xn-contrast: calc(1.14 * (pow(var(--_y), 0.56) - pow(clamp(0, var(--_xn), 1), 0.57)) - 0.027);
        /* Reverse (lighter): Lc = 1.14 * (Yfg^0.62 - Ybg^0.65) - 0.027 */
        --_xr-contrast: calc(1.14 * (pow(clamp(0, var(--_xr), 1), 0.62) - pow(var(--_y), 0.65)) - 0.027);
        --_best-fallback: calc(
          max(0, sign(var(--_xr-contrast) - var(--_xn-contrast) + 0.0001)) * clamp(0, var(--_xr), 1) +
          max(0, sign(var(--_xn-contrast) - var(--_xr-contrast))) * clamp(0, var(--_xn), 1)
        );
        --_target-y: clamp(
          0,
          var(--_xr-in-gamut) * var(--_xr) +
          (1 - var(--_xr-in-gamut)) * var(--_xn-in-gamut) * var(--_xn) +
          (1 - var(--_xr-in-gamut)) * (1 - var(--_xn-in-gamut)) * var(--_best-fallback),
          1
        );
      `
		case 'prefer-dark':
			// Prefer dark: use normal if in gamut, fall back to reverse if in gamut,
			// otherwise choose whichever achieves higher contrast
			return outdent`
        /* Estimate contrast for each polarity using APCA formulas */
        /* Normal (darker): Lc = 1.14 * (Ybg^0.56 - Yfg^0.57) - 0.027 */
        --_xn-contrast: calc(1.14 * (pow(var(--_y), 0.56) - pow(clamp(0, var(--_xn), 1), 0.57)) - 0.027);
        /* Reverse (lighter): Lc = 1.14 * (Yfg^0.62 - Ybg^0.65) - 0.027 */
        --_xr-contrast: calc(1.14 * (pow(clamp(0, var(--_xr), 1), 0.62) - pow(var(--_y), 0.65)) - 0.027);
        --_best-fallback: calc(
          max(0, sign(var(--_xn-contrast) - var(--_xr-contrast) + 0.0001)) * clamp(0, var(--_xn), 1) +
          max(0, sign(var(--_xr-contrast) - var(--_xn-contrast))) * clamp(0, var(--_xr), 1)
        );
        --_target-y: clamp(
          0,
          var(--_xn-in-gamut) * var(--_xn) +
          (1 - var(--_xn-in-gamut)) * var(--_xr-in-gamut) * var(--_xr) +
          (1 - var(--_xn-in-gamut)) * (1 - var(--_xr-in-gamut)) * var(--_best-fallback),
          1
        );
      `
	}
}

function generateHeuristicCss(coeffs: HeuristicCoefficients): string {
	const fmt = (n: number) => formatNumber(n, 6)

	return outdent`
		/* Heuristic correction to prevent under-delivery of contrast */
		/* boost = darkBoost * max(0, 0.3 - L) + midBoost * max(0, 1 - |L - 0.5| * 2.5) + contrastBoost * max(0, target - 30) */
		--_boost-dark: calc(${fmt(coeffs.darkBoost)} * max(0, 0.3 - var(--_l)));
		--_boost-mid: calc(${fmt(coeffs.midBoost)} * max(0, 1 - abs(var(--_l) - 0.5) * 2.5));
		--_boost-contrast: calc(${fmt(coeffs.contrastBoost)} * max(0, var(--contrast) - 30));
		--_contrast-adjusted: calc(var(--contrast) + var(--_boost-dark) + var(--_boost-mid) + var(--_boost-contrast));
	`
}

function generateContrastCss(
	selector: string,
	contrastSelector: string,
	hue: number,
	boundary: GamutBoundary,
	mode: ContrastMode,
) {
	const lMax = formatNumber(boundary.lMax)
	const cPeak = formatNumber(boundary.cPeak)

	// Fit heuristic coefficients for this specific hue and mode
	const { coefficients: coeffs } = fitHeuristicCoefficients(hue, mode)

	// Determine which polarities we need based on mode
	// force-dark needs normal (darker), force-light needs reverse (lighter)
	// prefer modes need both for fallback
	const needsNormal = mode === 'force-dark' || mode === 'prefer-light' || mode === 'prefer-dark'
	const needsReverse = mode === 'force-light' || mode === 'prefer-light' || mode === 'prefer-dark'

	// Build polarity-specific CSS (only include what's needed)
	const polarityCss = [
		needsNormal ? generateNormalPolarityCss() : '',
		needsReverse ? generateReversePolarityCss() : '',
	]
		.filter(Boolean)
		.join('\n\n    ')

	// Heuristic correction CSS (always enabled)
	const heuristicCss = `\n\n${generateHeuristicCss(coeffs)}\n`

	// Use adjusted contrast
	const contrastVar = 'var(--_contrast-adjusted)'

	return outdent`
    ${selector}${contrastSelector} {
      /* Runtime input: --contrast (0-108 APCA Lc) */${heuristicCss}

      --_x: clamp(0, ${contrastVar} / 100, 1.08);

      /* Simplified L to luminance Y (ignoring chroma contribution) */
      --_y: pow(var(--_l), 3);

      /* APCA threshold for Bezier smoothing */
      --_apca-t: 0.022;
      --_ep: 0.0001;

      ${polarityCss}

      /* Target Y selection (mode: ${mode}) */
      ${generateTargetYCss(mode)}

      /* Contrast lightness from cube root (inverse of Y = L³) */
      --_contrast-l: clamp(0, pow(var(--_target-y), 1 / 3), 1);

      /* Gamut-map contrast color's chroma using simplified tent */
      --_contrast-tent: min(
        var(--_contrast-l) / ${lMax},
        (1 - var(--_contrast-l)) / (1 - ${lMax})
      );
      --_contrast-c: min(
        calc((var(--_c) + var(--_c-req)) / 2),
        calc(${cPeak} * var(--_contrast-tent))
      );

      /* Output contrast color */
      --o-color-contrast: oklch(var(--_contrast-l) var(--_contrast-c) ${hue});
    }
  `
}

/**
 * Generate CSS for an OKLCH color with optional APCA-based contrast.
 *
 * The generated CSS uses CSS custom properties for runtime configuration:
 * - Set `--lightness` (0-100) and `--chroma` (0-100) to control the color
 * - Set `--contrast` (0-108) to control the contrast level (if contrast enabled)
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
 *   contrast: { mode: 'prefer-dark' }
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
			options.contrast.mode,
		)}`
	}

	return css
}
