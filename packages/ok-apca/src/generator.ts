import { reference } from '@ok-apca/calc-tree'
import { findGamutSlice } from './color.ts'
import {
	createContrastSolver,
	createLightnessFromY,
	createMaxChromaExpr,
	createYFromLightness,
} from './expressions.ts'
import type { GamutSlice, HueDefinition, InputMode } from './types.ts'
import { outdent } from './util.ts'

const cssNumber = (n: number): string => n.toFixed(5).replace(/\.?0+$/, '') || '0'

const cssVar = (name: string, fallback?: string): string =>
	`var(--${name}${fallback ? `, ${fallback}` : ''})`

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
			numeric(`_Y-target-${label}`),
			color(`${output}-${label}`, true),
		)
	}

	return properties.join('\n')
}

/**
 * Generate CSS expression for max chroma using the expression tree.
 * Binds the gamut slice constants and leaves lightness as a reference.
 */
function cssMaxChroma(lightnessRef: string, slice: GamutSlice): string {
	const result = createMaxChromaExpr()
		.bind('apexL', slice.apex.lightness)
		.bind('apexChroma', slice.apex.chroma)
		.bind('curvature', slice.curvature)
		.evaluate({
			lightness: reference(lightnessRef),
		})

	return result.css.expression
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
	const lumNormRef = inputMode === 'percentage' ? '_lum-norm' : 'lightness'
	const chromaExpr = `(${cssMaxChroma(lumNormRef, slice)}) * ${getChrPctVar(inputMode)}`

	if (inputMode === 'percentage') {
		return outdent`
			--_lum-norm: clamp(0, ${cssVar('lightness')} / 100, 1);
			--_chr-pct: clamp(0, ${cssVar('chroma')} / 100, 1);
			--${output}: oklch(${getLumNormVar(inputMode)} calc(${chromaExpr}) ${cssNumber(hue)});
		`
	}

	return `--${output}: oklch(${getLumNormVar(inputMode)} calc(${chromaExpr}) ${cssNumber(hue)});`
}

/**
 * Generate CSS expression for Y from lightness using the expression tree.
 */
function cssYFromLightness(lightnessRef: string): string {
	const result = createYFromLightness().evaluate({
		lightness: reference(lightnessRef),
	})
	return result.css.expression
}

/**
 * Generate CSS expression for contrast solver using the expression tree.
 * The solver determines target Y based on background Y and signed contrast.
 */
function cssContrastSolver(yBgRef: string, signedContrastRef: string, scale: number): string {
	const result = createContrastSolver()
		.bind('contrastScale', scale)
		.evaluate({
			yBg: reference(yBgRef),
			signedContrast: reference(signedContrastRef),
		})
	return result.css.expression
}

/**
 * Generate CSS expression for lightness from Y using the expression tree.
 */
function cssLightnessFromY(yRef: string): string {
	const result = createLightnessFromY().evaluate({
		y: reference(yRef),
	})
	return result.css.expression
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
	const yTargetRef = `_Y-target-${label}`

	// Contrast solver: compute target Y from background Y and signed contrast
	const scale = inputMode === 'percentage' ? 100 : 1
	const yTargetExpr = cssContrastSolver('_Y-bg', `_contrast-signed-${label}`, scale)

	// Convert Y to lightness: L = Y^(1/3)
	const conLumExpr = cssLightnessFromY(yTargetRef)

	// Max chroma at the contrast lightness
	const conChrExpr = `(${cssMaxChroma(`_con-lum-${label}`, slice)}) * ${vChrPct}`

	const isPercentage = inputMode === 'percentage'
	const contrastSignedExpr = isPercentage
		? `clamp(-108, ${cssVar(`contrast-${label}`, '0')}, 108)`
		: cssVar(`contrast-${label}`, '0')

	return outdent`
		--_contrast-signed-${label}: ${contrastSignedExpr};
		--_Y-target-${label}: ${yTargetExpr};
		--_con-lum-${label}: ${conLumExpr};
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

	const lumNormRef = inputMode === 'percentage' ? '_lum-norm' : 'lightness'
	const sharedYBackground =
		contrastColors.length > 0 ? `--_Y-bg: ${cssYFromLightness(lumNormRef)};` : ''

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
