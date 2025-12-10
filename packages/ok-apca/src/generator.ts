import { findGamutBoundary } from './gamut.ts'
import type { ColorGeneratorOptions, ContrastMode, GamutBoundary } from './types.ts'
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
function generateNormalPolarityCss(): string {
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
function generateReversePolarityCss(): string {
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
function generateTargetYCss(mode: ContrastMode): string {
	switch (mode) {
		case 'force-light':
			// Light contrast text = reverse polarity (higher Y)
			return '--_target-y: clamp(0, var(--_xr), 1);'
		case 'force-dark':
			// Dark contrast text = normal polarity (lower Y)
			return '--_target-y: clamp(0, var(--_xn), 1);'
		case 'prefer-light':
			return outdent`
        /* Prefer light: use reverse if in gamut, otherwise fall back to normal */
        --_target-y: clamp(
          0,
          var(--_xr-in-gamut) * var(--_xr) +
          (1 - var(--_xr-in-gamut)) * var(--_xn),
          1
        );
      `
		case 'prefer-dark':
			return outdent`
        /* Prefer dark: use normal if in gamut, otherwise fall back to reverse */
        --_target-y: clamp(
          0,
          var(--_xn-in-gamut) * var(--_xn) +
          (1 - var(--_xn-in-gamut)) * var(--_xr),
          1
        );
      `
	}
}

function generateContrastCss(
	selector: string,
	contrastSelector: string,
	hue: number,
	boundary: GamutBoundary,
	mode: ContrastMode,
): string {
	const lMax = formatNumber(boundary.lMax)
	const cPeak = formatNumber(boundary.cPeak)

	// Determine which polarities we need based on mode
	// Normal polarity = darker Y (for dark text), Reverse polarity = lighter Y (for light text)
	const needsNormal = mode === 'force-dark' || mode === 'prefer-light' || mode === 'prefer-dark'
	const needsReverse = mode === 'force-light' || mode === 'prefer-light' || mode === 'prefer-dark'

	// Build polarity-specific CSS (only include what's needed)
	const polarityCss = [
		needsNormal ? generateNormalPolarityCss() : '',
		needsReverse ? generateReversePolarityCss() : '',
	]
		.filter(Boolean)
		.join('\n\n    ')

	return outdent`
    ${selector}${contrastSelector} {
      /* Runtime input: --contrast (0-108 APCA Lc) */
      --_x: clamp(0, var(--contrast) / 100, 1.08);

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

export function generateColorCss(options: ColorGeneratorOptions): string {
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
