import type { ColorExpression } from '@ok-apca/calc-tree'
import * as ct from '@ok-apca/calc-tree'
import { findGamutSlice, type GamutSlice } from './color.ts'
import {
	contrastMeasurementNormal,
	contrastMeasurementReverse,
	createContrastSolver,
	createContrastSolverWithInversion,
	createMaxChromaExpr,
	normalPolarity,
	reversePolarity,
} from './expressions.ts'
import type { HueDefinition } from './types.ts'
import { outdent } from './util.ts'

const vars = {
	lightness: 'lightness',
	chroma: 'chroma',
	yBg: '_Y-bg',

	contrastInput: (label: string) => `contrast-${label}`,
	contrastSigned: (label: string) => `_contrast-signed-${label}`,
	yTarget: (label: string) => `_Y-target-${label}`,
	conLum: (label: string) => `_con-lum-${label}`,

	// Inversion-specific properties
	yLight: (label: string) => `_Y-light-${label}`,
	yDark: (label: string) => `_Y-dark-${label}`,
	lcLight: (label: string) => `_Lc-light-${label}`,
	lcDark: (label: string) => `_Lc-dark-${label}`,

	output: (name: string) => name,
	outputContrast: (name: string, label: string) => `${name}-${label}`,
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

	const properties: string[] = [numeric(vars.lightness, true), numeric(vars.chroma, true)]

	properties.push(color(vars.output(output), true))

	if (labels.length > 0) {
		properties.push(numeric(vars.yBg))
	}

	for (const label of labels) {
		properties.push(numeric(vars.contrastInput(label), true), numeric(vars.contrastSigned(label)))

		// Inversion properties (only when inversion is enabled)
		if (!noContrastInversion) {
			properties.push(
				numeric(vars.yLight(label)),
				numeric(vars.yDark(label)),
				numeric(vars.lcLight(label)),
				numeric(vars.lcDark(label)),
			)
		}

		properties.push(
			numeric(vars.yTarget(label)),
			numeric(vars.conLum(label)),
			color(vars.outputContrast(output, label), true),
		)
	}

	return properties.join('\n')
}

function buildBaseColorExpr(
	hue: number,
	slice: GamutSlice,
	output: string,
): ColorExpression<string> {
	const lightness = ct.reference(vars.lightness)
	const chroma = ct.reference(vars.chroma)

	const maxChroma = createMaxChromaExpr(slice).bind({ lightness })

	return ct.oklch(lightness, ct.multiply(maxChroma, chroma), hue).asProperty(vars.output(output))
}

/**
 * Build expression for Y background (shared across contrast colors).
 */
function buildYBackgroundExpr() {
	return ct.pow(ct.reference(vars.lightness), 3).asProperty(vars.yBg)
}

/**
 * Build contrast color expression tree for a single label (simple solver, no inversion).
 */
function buildContrastColorExprSimple(
	label: string,
	hue: number,
	slice: GamutSlice,
	output: string,
): ColorExpression<string> {
	const signedContrastExpr = ct
		.reference(vars.contrastInput(label))
		.asProperty(vars.contrastSigned(label))

	// Target Y from contrast solver
	const yTargetExpr = createContrastSolver()
		.bind({
			yBg: ct.reference(vars.yBg),
			signedContrast: signedContrastExpr,
		})
		.asProperty(vars.yTarget(label))

	// Convert Y to lightness
	const conLumExpr = ct.pow(yTargetExpr, 1 / 3).asProperty(vars.conLum(label))

	// Max chroma at contrast lightness
	const maxChroma = createMaxChromaExpr(slice).bind({ lightness: conLumExpr })

	// Final chroma
	const chroma = ct.multiply(maxChroma, ct.reference(vars.chroma))

	// Build the contrast color
	return ct.oklch(conLumExpr, chroma, hue).asProperty(vars.outputContrast(output, label))
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
): ColorExpression<string> {
	const yBgRef = ct.reference(vars.yBg)

	const signedContrastExpr = ct
		.reference(vars.contrastInput(label))
		.asProperty(vars.contrastSigned(label))

	// Absolute contrast magnitude
	const x = ct.abs(signedContrastExpr)

	// Clamp both to valid Y range [0, 1]
	const yLightExpr = ct
		.clamp(0, reversePolarity.bind({ yBg: yBgRef, x }), 1)
		.asProperty(vars.yLight(label))
	const yDarkExpr = ct
		.clamp(0, normalPolarity.bind({ yBg: yBgRef, x }), 1)
		.asProperty(vars.yDark(label))

	// Measure achieved contrast for each clamped solution
	const lcLightExpr = contrastMeasurementReverse
		.bind({ yBg: yBgRef, yFg: yLightExpr })
		.asProperty(vars.lcLight(label))

	const lcDarkExpr = contrastMeasurementNormal
		.bind({ yBg: yBgRef, yFg: yDarkExpr })
		.asProperty(vars.lcDark(label))

	// Use the inversion solver to select the best Y
	const yTargetExpr = createContrastSolverWithInversion()
		.bind({
			yBg: yBgRef,
			signedContrast: signedContrastExpr,
			yLight: yLightExpr,
			yDark: yDarkExpr,
			lcLight: lcLightExpr,
			lcDark: lcDarkExpr,
		})
		.asProperty(vars.yTarget(label))

	// Convert Y to lightness
	const conLumExpr = ct.pow(yTargetExpr, 1 / 3).asProperty(vars.conLum(label))

	// Max chroma at contrast lightness
	const maxChroma = createMaxChromaExpr(slice).bind({ lightness: conLumExpr })

	// Final chroma
	const chroma = ct.multiply(maxChroma, ct.reference(vars.chroma))

	// Build the contrast color
	return ct.oklch(conLumExpr, chroma, hue).asProperty(vars.outputContrast(output, label))
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
): ColorExpression<string> {
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
