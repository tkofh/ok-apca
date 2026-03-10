import * as ct from '@ok-apca/calc-tree'
import {
	contrastMeasurementNormal,
	contrastMeasurementReverse,
	contrastSolver,
	contrastSolverWithInversion,
	normalPolarity,
	reversePolarity,
	softClampApprox,
	softUnclamp,
} from './apca.ts'
import { computeHueData, type HueData, maxChromaExpr as maxChroma } from './gamut.ts'
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

function buildBaseColorExpr<const OutputRef extends string>(
	hue: number,
	maxChromaExpr: ct.NumberExpression<string>,
	output: OutputRef,
) {
	return ct.property(output, ct.oklch('lightness', ct.multiply(maxChromaExpr, 'chroma'), hue), true)
}

/**
 * Y_bg = L³ · f where f = 1 + fA·chroma + fB·chroma² + fD·chroma³.
 * On the left half of the gamut tent this is exact; on the right half
 * the base color's chroma is smaller so the correction is smaller too.
 */
function buildYBackgroundExpr(hueData: HueData) {
	return ct.property(
		'_ybg',
		ct.multiply(
			ct.pow('lightness', 3),
			ct.add(
				1,
				ct.multiply(hueData.fA, 'chroma'),
				ct.multiply(hueData.fB, ct.pow('chroma', 2)),
				ct.multiply(hueData.fD, ct.pow('chroma', 3)),
			),
		),
	)
}

/**
 * Build the Y→L correction pipeline for a contrast color.
 *
 * Uses the pre-computed correction factor f = 1 + fA·chroma + fB·chroma² + fD·chroma³
 * where fA, fB, fD are build-time constants from the hue's apex geometry.
 * Then L = pow(Y / f, 1/3).
 *
 * This is exact on the left half of the gamut tent (where k = apexC/apexL · chromaRatio
 * is constant) and a close approximation on the right half (where chroma is smaller,
 * making f closer to 1). Crucially, f depends only on `chroma` (a leaf input),
 * not on the target Y, avoiding deep expression expansion through the solver chain.
 */
function buildCorrectedLightness(
	label: string,
	yTargetExpr: ct.NumberExpression<string>,
	hueData: HueData,
) {
	// Pre-computed correction factor: depends only on chroma (a leaf input)
	const fExpr = ct.add(
		1,
		ct.multiply(hueData.fA, 'chroma'),
		ct.multiply(hueData.fB, ct.pow('chroma', 2)),
		ct.multiply(hueData.fD, ct.pow('chroma', 3)),
	)

	// Corrected lightness: L = pow(Y / f, 1/3)
	return ct.property(`_cl-${label}`, ct.pow(ct.divide(yTargetExpr, fExpr), 1 / 3))
}

/**
 * Build contrast color expression tree for a single label (simple solver, no inversion).
 */
function buildContrastColorExprSimple<
	const LabelRef extends string,
	const OutputRef extends string,
>(
	label: LabelRef,
	hue: number,
	hueData: HueData,
	scYBackgroundExpr: ct.NumberExpression<string>,
	output: OutputRef,
) {
	// Solver operates in soft-clamped domain; output is sc_approx(Y_fg)
	const yRawExpr = ct.property(
		`_yr-${label}`,
		contrastSolver.bind({
			yBg: scYBackgroundExpr,
			contrast: `contrast-${label}`,
		}),
	)

	// Unclamp to recover actual Y_fg
	const yTargetExpr = ct.property(`_yt-${label}`, softUnclamp(yRawExpr))

	// Cardano-corrected lightness
	const conLumExpr = buildCorrectedLightness(label, yTargetExpr, hueData)

	// Max chroma at contrast color's lightness
	const conMaxChromaExpr = ct.property(
		`_mc-${label}`,
		maxChroma.bind(hueData).bind({ lightness: conLumExpr }),
	)

	// Build the contrast color
	return ct.property(
		`${output}-${label}`,
		ct.oklch(conLumExpr, ct.multiply(conMaxChromaExpr, 'chroma'), hue),
		true,
	)
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
	const YBgRefs extends string,
	const ScYBgRefs extends string,
>(
	label: LabelRef,
	hue: number,
	hueData: HueData,
	yBackgroundExpr: ct.NumberExpression<YBgRefs>,
	scYBackgroundExpr: ct.NumberExpression<ScYBgRefs>,
	output: OutputRef,
) {
	// Solver uses soft-clamped Y_bg; outputs are in sc_approx domain
	const contrastBinding = { yBg: scYBackgroundExpr, contrast: `contrast-${label}` }

	// Raw solver outputs in soft-clamped domain
	const yLightRawExpr = ct.property(
		`_ylr-${label}`,
		ct.clamp(0, reversePolarity.bind(contrastBinding), 1),
	)
	const yDarkRawExpr = ct.property(
		`_ydr-${label}`,
		ct.clamp(0, normalPolarity.bind(contrastBinding), 1),
	)

	// Unclamp to recover actual Y values
	const yLightExpr = ct.property(`_yl-${label}`, softUnclamp(yLightRawExpr))
	const yDarkExpr = ct.property(`_yd-${label}`, softUnclamp(yDarkRawExpr))

	// Measure achieved contrast using original Y_bg (measurement has its own true softClampY)
	const lcLightExpr = ct.property(
		`_lcl-${label}`,
		contrastMeasurementReverse.bind({ yBg: yBackgroundExpr, yFg: yLightExpr }),
	)

	const lcDarkExpr = ct.property(
		`_lcd-${label}`,
		contrastMeasurementNormal.bind({ yBg: yBackgroundExpr, yFg: yDarkExpr }),
	)

	// Inversion solver uses original Y_bg for zero-contrast fallback
	// Raw values used for exhaustion detection (softUnclamp(1) < 1 would hide exhaustion)
	const yTargetExpr = ct.property(
		`_yt-${label}`,
		contrastSolverWithInversion.bind({
			yBg: yBackgroundExpr,
			contrast: `contrast-${label}`,
			yLight: yLightExpr,
			yDark: yDarkExpr,
			yLightRaw: yLightRawExpr,
			yDarkRaw: yDarkRawExpr,
			lcLight: lcLightExpr,
			lcDark: lcDarkExpr,
		}),
	)

	// Cardano-corrected lightness
	const conLumExpr = buildCorrectedLightness(label, yTargetExpr, hueData)

	// Max chroma at contrast color's lightness
	const conMaxChromaExpr = ct.property(
		`_mc-${label}`,
		maxChroma.bind(hueData).bind({ lightness: conLumExpr }),
	)

	// Build the contrast color
	return ct.property(
		`${output}-${label}`,
		ct.oklch(conLumExpr, ct.multiply(conMaxChromaExpr, 'chroma'), hue),
		true,
	)
}

/**
 * Build contrast color expression tree for a single label.
 * Uses inversion solver when noContrastInversion is false.
 */
function buildContrastColorExpr(
	label: string,
	hue: number,
	hueData: HueData,
	yBackgroundExpr: ct.NumberExpression<string>,
	scYBackgroundExpr: ct.NumberExpression<string>,
	output: string,
	noContrastInversion: boolean,
) {
	if (noContrastInversion) {
		return buildContrastColorExprSimple(label, hue, hueData, scYBackgroundExpr, output)
	}
	return buildContrastColorExprWithInversion(
		label,
		hue,
		hueData,
		yBackgroundExpr,
		scYBackgroundExpr,
		output,
	)
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
	const hueData = computeHueData(hue)

	// Declare input properties
	const lightnessInput = ct.property('lightness', 'number', true)
	const chromaInput = ct.property('chroma', 'number', true)

	// Collect all declarations and properties into single objects
	const declarations: Record<string, string> = {}
	const properties: Record<string, ct.PropertyRule> = {}

	// Helper to merge CSS result into the shared collections
	const merge = (css: ct.CSSResult) => {
		Object.assign(declarations, css.declarations)
		Object.assign(properties, css.properties)
	}

	// Shared max chroma at base lightness (reused by base color and Y_bg)
	const maxChromaExpr = ct.property(
		'_mc',
		maxChroma.bind(hueData).bind({ lightness: lightnessInput }),
	)

	// Build base color expression
	merge(buildBaseColorExpr(hue, maxChromaExpr, output).toCss())

	// Build Y background if we have contrast colors
	if (contrastColors.length > 0) {
		const yBgExpr = buildYBackgroundExpr(hueData)
		merge(yBgExpr.toCss())

		// Soft-clamped Y_bg for the contrast solver (Lp-norm approximation)
		const scYBgExpr = ct.property('_sc', softClampApprox(yBgExpr))
		merge(scYBgExpr.toCss())

		// Declare contrast input properties and build contrast color expressions
		for (const { label } of contrastColors) {
			merge(ct.property(`contrast-${label}`, 'number', true).toCss())

			merge(
				buildContrastColorExpr(
					label,
					hue,
					hueData,
					yBgExpr,
					scYBgExpr,
					output,
					noContrastInversion,
				).toCss(),
			)
		}
	}

	// Ensure input properties are registered even if they weren't serialized
	merge(lightnessInput.toCss())
	merge(chromaInput.toCss())

	const propertyRules = Object.entries(properties)
		.map(
			([name, rule]) => outdent`
				@property ${name} {
					inherits: ${rule.inherits ? 'true' : 'false'};
					initial-value: ${rule.initialValue};
					syntax: '${rule.syntax}';
				}
			`,
		)
		.join('\n')

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
