import type { CalcExpression, ColorExpression } from '@ok-apca/calc-tree'
import * as ct from '@ok-apca/calc-tree'
import { findGamutSlice } from './color.ts'
import { createContrastSolver, createMaxChromaExpr } from './expressions.ts'
import type { GamutSlice, HueDefinition, InputMode } from './types.ts'
import { outdent } from './util.ts'

const vars = {
	lightness: 'lightness',
	chroma: 'chroma',
	lumNorm: '_lum-norm',
	chrPct: '_chr-pct',
	yBg: '_Y-bg',

	lumNormFor: (mode: InputMode) => (mode === 'percentage' ? vars.lumNorm : vars.lightness),
	chrPctFor: (mode: InputMode) => (mode === 'percentage' ? vars.chrPct : vars.chroma),
	contrastScaleFor: (mode: InputMode) => (mode === 'percentage' ? 100 : 1),

	contrastInput: (label: string) => `contrast-${label}`,
	contrastSigned: (label: string) => `_contrast-signed-${label}`,
	yTarget: (label: string) => `_Y-target-${label}`,
	conLum: (label: string) => `_con-lum-${label}`,

	output: (name: string) => name,
	outputContrast: (name: string, label: string) => `${name}-${label}`,
}

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

	const properties: string[] = [numeric(vars.lightness, true), numeric(vars.chroma, true)]

	if (inputMode === 'percentage') {
		properties.push(numeric(vars.lumNorm), numeric(vars.chrPct))
	}

	properties.push(color(vars.output(output), true))

	if (labels.length > 0) {
		properties.push(numeric(vars.yBg))
	}

	for (const label of labels) {
		properties.push(
			numeric(vars.contrastInput(label), true),
			numeric(vars.contrastSigned(label)),
			numeric(vars.conLum(label)),
			numeric(vars.yTarget(label)),
			color(vars.outputContrast(output, label), true),
		)
	}

	return properties.join('\n')
}

function buildBaseColorExpr(
	hue: number,
	slice: GamutSlice,
	output: string,
	inputMode: InputMode,
): ColorExpression<string> {
	const isPercentage = inputMode === 'percentage'

	const lumNorm = isPercentage
		? ct.clamp(0, ct.divide(ct.reference(vars.lightness), 100), 1).asProperty(`--${vars.lumNorm}`)
		: ct.reference(vars.lightness)

	const chrPct = isPercentage
		? ct.clamp(0, ct.divide(ct.reference(vars.chroma), 100), 1).asProperty(`--${vars.chrPct}`)
		: ct.reference(vars.chroma)

	const maxChroma = createMaxChromaExpr(slice).bind('lightness', lumNorm)

	// Final chroma = maxChroma * chromaPercentage
	const chroma = ct.multiply(maxChroma, chrPct)

	// Build the color
	return ct.oklch(lumNorm, chroma, hue).asProperty(`--${vars.output(output)}`)
}

/**
 * Build expression for Y background (shared across contrast colors).
 */
function buildYBackgroundExpr(inputMode: InputMode): CalcExpression<string> {
	return ct
		.power(ct.reference(vars.lumNormFor(inputMode)), 3)
		.asProperty(`--${vars.yBg}`)
}

/**
 * Build contrast color expression tree for a single label.
 */
function buildContrastColorExpr(
	label: string,
	hue: number,
	slice: GamutSlice,
	output: string,
	inputMode: InputMode,
): ColorExpression<string> {
	const isPercentage = inputMode === 'percentage'

	// Signed contrast: clamp if percentage mode, otherwise direct
	const signedContrastExpr = isPercentage
		? ct
				.clamp(-108, ct.reference(vars.contrastInput(label)), 108)
				.asProperty(`--${vars.contrastSigned(label)}`)
		: ct.reference(vars.contrastInput(label)).asProperty(`--${vars.contrastSigned(label)}`)

	// Target Y from contrast solver
	const yTargetExpr = createContrastSolver()
		.bind({
			contrastScale: vars.contrastScaleFor(inputMode),
			yBg: ct.reference(vars.yBg),
			signedContrast: signedContrastExpr,
		})
		.asProperty(`--${vars.yTarget(label)}`)

	// Convert Y to lightness
	const conLumExpr = ct.power(yTargetExpr, 1 / 3).asProperty(`--${vars.conLum(label)}`)

	// Max chroma at contrast lightness
	const maxChroma = createMaxChromaExpr(slice).bind('lightness', conLumExpr)

	// Final chroma
	const chroma = ct.multiply(maxChroma, ct.reference(vars.chrPctFor(inputMode)))

	// Build the contrast color
	return ct.oklch(conLumExpr, chroma, hue).asProperty(`--${vars.outputContrast(output, label)}`)
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

	// Build base color expression
	const baseColorExpr = buildBaseColorExpr(hue, slice, output, inputMode)
	const baseColorCss = baseColorExpr.toCss().toDeclarationBlock()

	// Build Y background if we have contrast colors
	const yBackgroundCss =
		contrastColors.length > 0 ? buildYBackgroundExpr(inputMode).toCss().toDeclarationBlock() : ''

	// Build contrast color expressions
	const contrastColorsCss = contrastColors
		.map(({ label }) =>
			buildContrastColorExpr(label, hue, slice, output, inputMode).toCss().toDeclarationBlock(),
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
