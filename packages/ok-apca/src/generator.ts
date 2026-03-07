import * as ct from '@ok-apca/calc-tree'
import { findGamutSlice, type GamutSlice } from './color.ts'
import {
	chromaRef,
	contrastMeasurementNormal,
	contrastMeasurementReverse,
	contrastSolver,
	contrastSolverWithInversion,
	lightnessRef,
	maxChroma,
	normalPolarity,
	reversePolarity,
} from './expressions.ts'
import { outdent } from './util.ts'

export interface ContrastColor {
	readonly label: string
}

export interface HueDefinition {
	readonly hue: number
	readonly selector: string
	readonly output: string
	readonly contrastColors: readonly ContrastColor[]
	readonly noContrastInversion: boolean
}

function generatePropertyRules(
	output: string,
	labels: readonly string[],
	noContrastInversion: boolean,
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

	properties.push(color(output, true))

	if (labels.length > 0) {
		properties.push(numeric('_ybg'))
	}

	for (const label of labels) {
		properties.push(numeric(`contrast-${label}`, true))

		// Inversion properties (only when inversion is enabled)
		if (!noContrastInversion) {
			properties.push(
				numeric(`_yl-${label}`),
				numeric(`_yd-${label}`),
				numeric(`_lcl-${label}`),
				numeric(`_lcd-${label}`),
			)
		}

		properties.push(
			numeric(`_yt-${label}`),
			numeric(`_cl-${label}`),
			color(`${output}-${label}`, true),
		)
	}

	return properties.join('\n')
}

function buildBaseColorExpr<const OutputRef extends string>(
	hue: number,
	slice: GamutSlice,
	output: OutputRef,
) {
	return ct
		.oklch(
			lightnessRef,
			ct.multiply(
				maxChroma.bind({
					lightness: lightnessRef,
					apexL: slice.apex.lightness,
					apexC: slice.apex.chroma,
					curvature: slice.curvature,
				}),
				chromaRef,
			),
			hue,
		)
		.asProperty(output)
}

const yBackgroundExpr = ct.pow(lightnessRef, 3).asProperty('_ybg')

/**
 * Build contrast color expression tree for a single label (simple solver, no inversion).
 */
function buildContrastColorExprSimple<
	const LabelRef extends string,
	const OutputRef extends string,
>(label: LabelRef, hue: number, slice: GamutSlice, output: OutputRef) {
	// Target Y from contrast solver
	const yTargetExpr = contrastSolver
		.bind({
			yBg: yBackgroundExpr,
			contrast: ct.reference(`contrast-${label}`),
		})
		.asProperty(`_yt-${label}`)

	// Convert Y to lightness
	const conLumExpr = ct.pow(yTargetExpr, 1 / 3).asProperty(`_cl-${label}`)

	// Build the contrast color
	return ct
		.oklch(
			conLumExpr,
			ct.multiply(
				maxChroma.bind({
					lightness: conLumExpr,
					apexL: slice.apex.lightness,
					apexC: slice.apex.chroma,
					curvature: slice.curvature,
				}),
				chromaRef,
			),
			hue,
		)
		.asProperty(`${output}-${label}`)
}

/**
 * Build contrast color expression tree with automatic polarity inversion.
 *
 * Computes both polarity solutions, measures achieved contrast for each,
 * and selects the one that achieves higher absolute contrast.
 */
function buildContrastColorExprWithInversion<
	const LabelRef extends string,
	const OutputRef extends string,
>(label: LabelRef, hue: number, slice: GamutSlice, output: OutputRef) {
	const contrastInputRef = ct.reference(`contrast-${label}`)

	// Absolute contrast magnitude
	const contrastMagnitude = ct.abs(contrastInputRef)

	// Clamp both to valid Y range [0, 1]
	const yLightExpr = ct
		.clamp(0, reversePolarity.bind({ yBg: yBackgroundExpr, contrastMagnitude }), 1)
		.asProperty(`_yl-${label}`)
	const yDarkExpr = ct
		.clamp(0, normalPolarity.bind({ yBg: yBackgroundExpr, contrastMagnitude }), 1)
		.asProperty(`_yd-${label}`)

	// Measure achieved contrast for each clamped solution
	const lcLightExpr = contrastMeasurementReverse
		.bind({ yBg: yBackgroundExpr, yFg: yLightExpr })
		.asProperty(`_lcl-${label}`)

	const lcDarkExpr = contrastMeasurementNormal
		.bind({ yBg: yBackgroundExpr, yFg: yDarkExpr })
		.asProperty(`_lcd-${label}`)

	// Use the inversion solver to select the best Y
	const yTargetExpr = contrastSolverWithInversion
		.bind({
			yBg: yBackgroundExpr,
			contrast: contrastInputRef,
			yLight: yLightExpr,
			yDark: yDarkExpr,
			lcLight: lcLightExpr,
			lcDark: lcDarkExpr,
		})
		.asProperty(`_yt-${label}`)

	// Convert Y to lightness
	const conLumExpr = ct.pow(yTargetExpr, 1 / 3).asProperty(`_cl-${label}`)

	// Build the contrast color
	return ct
		.oklch(
			conLumExpr,
			ct.multiply(
				maxChroma.bind({
					lightness: conLumExpr,
					apexL: slice.apex.lightness,
					apexC: slice.apex.chroma,
					curvature: slice.curvature,
				}),
				chromaRef,
			),
			hue,
		)
		.asProperty(`${output}-${label}`)
}

/**
 * Build contrast color expression tree for a single label.
 * Uses inversion solver when noContrastInversion is false.
 */
function buildContrastColorExpr(
	label: string,
	hue: number,
	slice: GamutSlice,
	output: string,
	noContrastInversion: boolean,
) {
	if (noContrastInversion) {
		return buildContrastColorExprSimple(label, hue, slice, output)
	}
	return buildContrastColorExprWithInversion(label, hue, slice, output)
}

/**
 * Generate CSS for OKLCH color with optional APCA-based contrast colors.
 *
 * Accepts a pre-validated `HueDefinition` from `defineHue`.
 *
 * Runtime inputs (all normalized):
 * - `--lightness` (0–1), `--chroma` (0–1)
 * - `--contrast-{label}` (-1.08 to 1.08)
 *
 * Outputs:
 * - `--{output}` (e.g., `--color`)
 * - `--{output}-{label}` (e.g., `--color-text`)
 *
 * The generated CSS includes `@property` declarations for all custom properties,
 * enabling proper type checking, animation support, and initial values.
 */
export function generateHueCss(definition: HueDefinition): string {
	const { hue, selector, output, contrastColors, noContrastInversion } = definition
	const slice = findGamutSlice(hue)
	const labels = contrastColors.map((c) => c.label)

	const propertyRules = generatePropertyRules(output, labels, noContrastInversion)

	// Collect all declarations into a single object to deduplicate shared
	// intermediate properties (e.g. --_ybg) that appear in multiple expressions
	const declarations: Record<string, string> = {}

	const mergeCss = (css: { declarations: Record<string, string> }) => {
		Object.assign(declarations, css.declarations)
	}

	// Build base color expression
	mergeCss(buildBaseColorExpr(hue, slice, output).toCss())

	// Build Y background if we have contrast colors
	if (contrastColors.length > 0) {
		mergeCss(yBackgroundExpr.toCss())
	}

	// Build contrast color expressions
	for (const { label } of contrastColors) {
		mergeCss(buildContrastColorExpr(label, hue, slice, output, noContrastInversion).toCss())
	}

	const declarationBlock = Object.entries(declarations)
		.map(([name, value]) => `${name}: ${value};`)
		.join('\n')

	return outdent`
		${propertyRules}

		${selector} {
			${declarationBlock}
		}
	`
}
