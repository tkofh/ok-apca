import { computeYConversionCoefficients, findGamutBoundary } from './gamut.ts'
import type {
	ColorGeneratorOptions,
	ContrastMode,
	GamutBoundary,
	YConversionCoefficients,
} from './types.ts'
import { outdent } from './util.ts'

function formatNumber(n: number, precision: number = 10): string {
	const formatted = n.toFixed(precision)
	// Remove trailing zeros but keep at least one decimal place
	return formatted.replace(/\.?0+$/, '') || '0'
}

function generateBaseColorCss(selector: string, hue: number, boundary: GamutBoundary): string {
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
    
      /* Tent function: linear ramp to L_MAX, then down to 1 */
      --_above-peak: max(sign(var(--_l) - var(--_L-MAX)), 0);
      --_tent: calc(
        (1 - var(--_above-peak)) * var(--_l) / var(--_L-MAX) +
        var(--_above-peak) * (1 - var(--_l)) / (1 - var(--_L-MAX))
      );
    
      /* Gamut-mapped chroma */
      --_c: min(var(--_c-req), calc(var(--_C-PEAK) * var(--_tent)));
    
      /* Output color */
      --o-color: oklch(var(--_l) var(--_c) ${hue});
    }
  `
}

function generateContrastCss(
	selector: string,
	contrastSelector: string,
	hue: number,
	boundary: GamutBoundary,
	yCoefs: YConversionCoefficients,
	modes: ContrastMode[],
): string {
	const lMax = formatNumber(boundary.lMax)
	const cPeak = formatNumber(boundary.cPeak)
	const yc0Coef = formatNumber(yCoefs.yc0Coef)
	const yc1Coef = formatNumber(yCoefs.yc1Coef)
	const yc2Coef = formatNumber(yCoefs.yc2Coef)

	// Generate polarity constants
	const polarityConstants = modes.map((mode, i) => `--polarity-${mode}: ${i};`).join('\n\t')

	return outdent`
    ${selector}${contrastSelector} {
      /* Polarity mode constants */
      ${polarityConstants}
    
      /* Runtime inputs: --contrast (0-108 APCA Lc), --polarity */
      --_x: clamp(0, var(--contrast) / 100, 1.08);
    
      /* Y-conversion coefficients (hue-dependent, pre-computed) */
      --_YC0-COEF: ${yc0Coef};
      --_YC1-COEF: ${yc1Coef};
      --_YC2-COEF: ${yc2Coef};
    
      /* Compute yc0, yc1, yc2 from chroma */
      --_yc0: calc(var(--_YC0-COEF) * pow(var(--_c), 3));
      --_yc1: calc(var(--_YC1-COEF) * pow(var(--_c), 2));
      --_yc2: calc(var(--_YC2-COEF) * var(--_c));
    
      /* Convert L to luminance Y */
      --_y: calc(
        var(--_yc0) +
        var(--_yc1) * var(--_l) +
        var(--_yc2) * pow(var(--_l), 2) +
        pow(var(--_l), 3)
      );
    
      /* APCA soft-toe adjustment at Y < 0.022 */
      --_y-adj: calc(
        max(sign(0.022 - var(--_y)), 0) * (
          0.0045272 +
          0.0150728 * var(--_y) / 0.022 +
          0.0024 * pow(var(--_y) / 0.022, 2)
        ) +
        (1 - max(sign(0.022 - var(--_y)), 0)) * var(--_y)
      );
    
      /* APCA threshold for switching between formulas */
      --_apca-t: 0.022;
      --_ep: 0.0001;
    
      /* Polarity flags */
      --_is-force-light: calc(1 - abs(sign(var(--polarity) - var(--polarity-force-light, -1))));
      --_is-prefer-light: calc(1 - abs(sign(var(--polarity) - var(--polarity-prefer-light, -1))));
      --_is-prefer-dark: calc(1 - abs(sign(var(--polarity) - var(--polarity-prefer-dark, -1))));
      --_is-force-dark: calc(1 - abs(sign(var(--polarity) - var(--polarity-force-dark, -1))));
    
      /* Normal polarity: dark text on light background (solve for darker Y) */
      --_xn-min: calc(
        pow(abs(pow(var(--_y-adj), 0.56) - (var(--_apca-t) + 0.027) / 1.14), 1 / 0.57) *
        sign(pow(var(--_y-adj), 0.56) - (var(--_apca-t) + 0.027) / 1.14)
      );
      --_xn-v: calc(-1 * abs((pow(abs(var(--_xn-min)), 0.43) * var(--_apca-t)) / 0.6498));
      --_xn: calc(
        min(1, max(0, sign(var(--_x) - var(--_apca-t)) + 1)) *
        pow(abs(pow(var(--_y-adj), 0.56) - (var(--_x) + 0.027) / 1.14), 1 / 0.57) *
        sign(pow(var(--_y-adj), 0.56) - (var(--_x) + 0.027) / 1.14) +
        (1 - min(1, max(0, sign(var(--_x) - var(--_apca-t)) + 1))) * (
          var(--_y-adj) +
          (-3 * var(--_y-adj) + 3 * var(--_xn-min) - var(--_xn-v)) * pow(var(--_x) / var(--_apca-t), 2) +
          (2 * var(--_y-adj) - 2 * var(--_xn-min) + var(--_xn-v)) * pow(var(--_x) / var(--_apca-t), 3)
        )
      );
      --_xn-in-gamut: calc((sign(var(--_xn) + var(--_ep)) + sign(1 - var(--_ep) - var(--_xn))) / 2);
    
      /* Reverse polarity: light text on dark background (solve for lighter Y) */
      --_xr-min: calc(
        pow(abs(pow(var(--_y-adj), 0.65) + (var(--_apca-t) + 0.027) / 1.14), 1 / 0.62) *
        sign(pow(var(--_y-adj), 0.65) + (var(--_apca-t) + 0.027) / 1.14)
      );
      --_xr-v: calc(-1 * abs((pow(abs(var(--_xr-min)), 0.38) * -1 * var(--_apca-t)) / 0.7068));
      --_xr: calc(
        min(1, max(0, sign(var(--_x) - var(--_apca-t)) + 1)) *
        pow(pow(var(--_y-adj), 0.65) - ((-1 * var(--_x)) - 0.027) / 1.14, 1 / 0.62) +
        (1 - min(1, max(0, sign(var(--_x) - var(--_apca-t)) + 1))) * (
          var(--_y-adj) +
          (-3 * var(--_y-adj) + 3 * var(--_xr-min) - var(--_xr-v)) * pow(var(--_x) / var(--_apca-t), 2) +
          (2 * var(--_y-adj) - 2 * var(--_xr-min) + var(--_xr-v)) * pow(var(--_x) / var(--_apca-t), 3)
        )
      );
      --_xr-in-gamut: calc((sign(var(--_xr) + var(--_ep)) + sign(1 - var(--_ep) - var(--_xr))) / 2);
    
      /* Select target Y based on polarity mode and gamut availability */
      --_target-y-adj: clamp(
        0,
        clamp(
          0,
          var(--_is-force-dark) +
          var(--_is-prefer-dark) * (var(--_xr-in-gamut) + (1 - var(--_xr-in-gamut)) * (1 - var(--_xn-in-gamut))) +
          var(--_is-prefer-light) * (1 - var(--_xn-in-gamut)) * var(--_xr-in-gamut),
          1
        ) * var(--_xr) +
        clamp(
          0,
          var(--_is-force-light) +
          var(--_is-prefer-light) * (var(--_xn-in-gamut) + (1 - var(--_xn-in-gamut)) * (1 - var(--_xr-in-gamut))) +
          var(--_is-prefer-dark) * (1 - var(--_xr-in-gamut)) * var(--_xn-in-gamut),
          1
        ) * var(--_xn),
        1
      );
    
      /* Reverse soft-toe to get actual Y */
      --_target-y: calc(
        max(sign(0.022 - var(--_target-y-adj)), 0) * (
          (-0.685127272727 + sqrt(0.469399379835 - 19.8347107438 * (0.0045272 - var(--_target-y-adj)))) /
          9.9173553719
        ) +
        (1 - max(sign(0.022 - var(--_target-y-adj)), 0)) * var(--_target-y-adj)
      );
    
      /* Cardano's formula to solve Y = yc0 + yc1*L + yc2*L² + L³ for L */
      --_p: calc((3 * var(--_yc1) - pow(var(--_yc2), 2)) / 3);
      --_q: calc(
        (2 * pow(var(--_yc2), 3) - 9 * var(--_yc2) * var(--_yc1) + 27 * (var(--_yc0) - var(--_target-y))) / 27
      );
      --_d: calc(pow(var(--_p) / 3, 3) + pow(var(--_q) / 2, 2));
    
      /* Contrast lightness from Cardano solution */
      --_contrast-l: calc(
        sign(var(--_d)) * (
          pow(abs(var(--_q) / -2 + sqrt(var(--_d))), 1 / 3) * sign(var(--_q) / -2 + sqrt(var(--_d))) +
          pow(abs(var(--_q) / -2 - sqrt(var(--_d))), 1 / 3) * sign(var(--_q) / -2 - sqrt(var(--_d))) -
          var(--_yc2) / 3
        ) +
        (1 - sign(var(--_d))) * (var(--_yc2) / -3)
      );
    
      /* Gamut-map contrast color's chroma using tent function */
      --_contrast-above-peak: max(sign(var(--_contrast-l) - ${lMax}), 0);
      --_contrast-tent: calc(
        (1 - var(--_contrast-above-peak)) * var(--_contrast-l) / ${lMax} +
        var(--_contrast-above-peak) * (1 - var(--_contrast-l)) / (1 - ${lMax})
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

export function generateColorCss(options: ColorGeneratorOptions): string {
	const hue = ((options.hue % 360) + 360) % 360
	const boundary = findGamutBoundary(hue)

	let css = generateBaseColorCss(options.selector, hue, boundary)

	if (options.contrast) {
		const yCoefs = computeYConversionCoefficients(hue)
		const contrastSelector = options.contrast.selector ?? '&.contrast'

		css += `\n\n${generateContrastCss(
			options.selector,
			contrastSelector.startsWith('&') ? contrastSelector.slice(1) : ` ${contrastSelector}`,
			hue,
			boundary,
			yCoefs,
			options.contrast.modes,
		)}`
	}

	return css
}
