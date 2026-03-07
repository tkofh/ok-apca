import * as ct from '@ok-apca/calc-tree'
import { findGamutSlice, type GamutSlice } from './color.ts'
import {
	contrastMeasurementNormal,
	contrastMeasurementReverse,
	contrastSolver,
	contrastSolverWithInversion,
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

const lightnessRef = ct.reference('lightness')
const chromaRef = ct.reference('chroma')
const yBgRef = ct.reference('_Y-bg')

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
		properties.push(numeric('_Y-bg'))
	}

	for (const label of labels) {
		properties.push(numeric(`contrast-${label}`, true), numeric(`_contrast-signed-${label}`))

		// Inversion properties (only when inversion is enabled)
		if (!noContrastInversion) {
			properties.push(
				numeric(`_Y-light-${label}`),
				numeric(`_Y-dark-${label}`),
				numeric(`_Lc-light-${label}`),
				numeric(`_Lc-dark-${label}`),
			)
		}

		properties.push(
			numeric(`_Y-target-${label}`),
			numeric(`_con-lum-${label}`),
			color(`${output}-${label}`, true),
		)
	}

	return properties.join('\n')
}

function buildBaseColorExpr(hue: number, slice: GamutSlice, output: string) {
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

/**
 * Build expression for Y background (shared across contrast colors).
 */
function buildYBackgroundExpr() {
	return ct.pow(lightnessRef, 3).asProperty('_Y-bg')
}

/**
 * Build contrast color expression tree for a single label (simple solver, no inversion).
 */
function buildContrastColorExprSimple(
	label: string,
	hue: number,
	slice: GamutSlice,
	output: string,
) {
	const contrastInputRef = ct.reference(`contrast-${label}`)

	const signedContrastExpr = contrastInputRef.asProperty(`_contrast-signed-${label}`)

	// Target Y from contrast solver
	const yTargetExpr = contrastSolver
		.bind({
			yBg: yBgRef,
			contrast: signedContrastExpr,
		})
		.asProperty(`_Y-target-${label}`)

	// Convert Y to lightness
	const conLumExpr = ct.pow(yTargetExpr, 1 / 3).asProperty(`_con-lum-${label}`)

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
function buildContrastColorExprWithInversion(
	label: string,
	hue: number,
	slice: GamutSlice,
	output: string,
) {
	const contrastInputRef = ct.reference(`contrast-${label}`)

	const signedContrastExpr = contrastInputRef.asProperty(`_contrast-signed-${label}`)

	// Absolute contrast magnitude
	const contrastMagnitude = ct.abs(signedContrastExpr)

	// Clamp both to valid Y range [0, 1]
	const yLightExpr = ct
		.clamp(0, reversePolarity.bind({ yBg: yBgRef, contrastMagnitude }), 1)
		.asProperty(`_Y-light-${label}`)
	const yDarkExpr = ct
		.clamp(0, normalPolarity.bind({ yBg: yBgRef, contrastMagnitude }), 1)
		.asProperty(`_Y-dark-${label}`)

	// Measure achieved contrast for each clamped solution
	const lcLightExpr = contrastMeasurementReverse
		.bind({ yBg: yBgRef, yFg: yLightExpr })
		.asProperty(`_Lc-light-${label}`)

	const lcDarkExpr = contrastMeasurementNormal
		.bind({ yBg: yBgRef, yFg: yDarkExpr })
		.asProperty(`_Lc-dark-${label}`)

	// Use the inversion solver to select the best Y
	const yTargetExpr = contrastSolverWithInversion
		.bind({
			yBg: yBgRef,
			contrast: signedContrastExpr,
			yLight: yLightExpr,
			yDark: yDarkExpr,
			lcLight: lcLightExpr,
			lcDark: lcDarkExpr,
		})
		.asProperty(`_Y-target-${label}`)

	// Convert Y to lightness
	const conLumExpr = ct.pow(yTargetExpr, 1 / 3).asProperty(`_con-lum-${label}`)

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

	// Build base color expression
	const baseColorExpr = buildBaseColorExpr(hue, slice, output)
	const baseColorCss = baseColorExpr.toCss().toDeclarationBlock()

	// Build Y background if we have contrast colors
	const yBackgroundCss =
		contrastColors.length > 0 ? buildYBackgroundExpr().toCss().toDeclarationBlock() : ''

	// Build contrast color expressions
	const contrastColorsCss = contrastColors
		.map(({ label }) =>
			buildContrastColorExpr(label, hue, slice, output, noContrastInversion)
				.toCss()
				.toDeclarationBlock(),
		)
		.join('\n')

	return outdent`
		${propertyRules}

		${selector} {
			${baseColorCss}

			${yBackgroundCss}

			${contrastColorsCss}
		}
	`
}
