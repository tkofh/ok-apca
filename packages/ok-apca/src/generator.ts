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
import { findGamutSlice, type GamutSlice } from './color.ts'
import { correctionCoeffs, type HueYCoefficients, hueYCoefficients } from './correction.ts'
import { maxChroma } from './gamut.ts'
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
		properties.push(numeric('_mc'), numeric('_ybg'), numeric('_sc'))
	}

	for (const label of labels) {
		properties.push(numeric(`contrast-${label}`, true))

		// Inversion properties (only when inversion is enabled)
		if (!noContrastInversion) {
			properties.push(
				numeric(`_ylr-${label}`),
				numeric(`_ydr-${label}`),
				numeric(`_yl-${label}`),
				numeric(`_yd-${label}`),
				numeric(`_lcl-${label}`),
				numeric(`_lcd-${label}`),
			)
		}

		properties.push(
			numeric(`_yr-${label}`),
			numeric(`_yt-${label}`),
			numeric(`_cl-${label}`),
			numeric(`_mc-${label}`),
			color(`${output}-${label}`, true),
		)
	}

	return properties.join('\n')
}

/** Bind maxChroma expression with gamut slice constants */
function bindMaxChroma<const LightnessRefs extends string>(
	lightnessExpr: ct.CalcExpression<LightnessRefs>,
	slice: GamutSlice,
) {
	return maxChroma.bind({
		lightness: lightnessExpr,
		apexL: slice.apex.lightness,
		apexC: slice.apex.chroma,
		curvature: slice.curvature,
	})
}

function buildBaseColorExpr<const OutputRef extends string>(
	hue: number,
	maxChromaExpr: ct.CalcExpression<string>,
	output: OutputRef,
) {
	return ct.oklch('lightness', ct.multiply(maxChromaExpr, 'chroma'), hue).asProperty(output)
}

/**
 * Y_bg = L³ · f where f = 1 + fA·chroma + fB·chroma² + fD·chroma³.
 * On the left half of the gamut tent this is exact; on the right half
 * the base color's chroma is smaller so the correction is smaller too.
 */
function buildYBackgroundExpr(slice: GamutSlice, coeffs: HueYCoefficients) {
	const { fA, fB, fD } = correctionCoeffs(slice, coeffs)
	return ct
		.multiply(
			ct.pow('lightness', 3),
			ct.add(
				1,
				ct.multiply(fA, 'chroma'),
				ct.multiply(fB, ct.pow('chroma', 2)),
				ct.multiply(fD, ct.pow('chroma', 3)),
			),
		)
		.asProperty('_ybg')
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
	yTargetExpr: ct.CalcExpression<string>,
	slice: GamutSlice,
	coeffs: HueYCoefficients,
) {
	const { fA, fB, fD } = correctionCoeffs(slice, coeffs)

	// Pre-computed correction factor: depends only on chroma (a leaf input)
	const fExpr = ct.add(
		1,
		ct.multiply(fA, 'chroma'),
		ct.multiply(fB, ct.pow('chroma', 2)),
		ct.multiply(fD, ct.pow('chroma', 3)),
	)

	// Corrected lightness: L = pow(Y / f, 1/3)
	return ct.pow(ct.divide(yTargetExpr, fExpr), 1 / 3).asProperty(`_cl-${label}`)
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
	slice: GamutSlice,
	coeffs: HueYCoefficients,
	scYBackgroundExpr: ct.CalcExpression<string>,
	output: OutputRef,
) {
	// Solver operates in soft-clamped domain; output is sc_approx(Y_fg)
	const yRawExpr = contrastSolver
		.bind({
			yBg: scYBackgroundExpr,
			contrast: `contrast-${label}`,
		})
		.asProperty(`_yr-${label}`)

	// Unclamp to recover actual Y_fg
	const yTargetExpr = softUnclamp(yRawExpr).asProperty(`_yt-${label}`)

	// Cardano-corrected lightness
	const conLumExpr = buildCorrectedLightness(label, yTargetExpr, slice, coeffs)

	// Max chroma at contrast color's lightness
	const conMaxChromaExpr = bindMaxChroma(conLumExpr, slice).asProperty(`_mc-${label}`)

	// Build the contrast color
	return ct
		.oklch(conLumExpr, ct.multiply(conMaxChromaExpr, 'chroma'), hue)
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
	const YBgRefs extends string,
	const ScYBgRefs extends string,
>(
	label: LabelRef,
	hue: number,
	slice: GamutSlice,
	coeffs: HueYCoefficients,
	yBackgroundExpr: ct.CalcExpression<YBgRefs>,
	scYBackgroundExpr: ct.CalcExpression<ScYBgRefs>,
	output: OutputRef,
) {
	// Solver uses soft-clamped Y_bg; outputs are in sc_approx domain
	const contrastBinding = { yBg: scYBackgroundExpr, contrast: `contrast-${label}` }

	// Raw solver outputs in soft-clamped domain
	const yLightRawExpr = ct
		.clamp(0, reversePolarity.bind(contrastBinding), 1)
		.asProperty(`_ylr-${label}`)
	const yDarkRawExpr = ct
		.clamp(0, normalPolarity.bind(contrastBinding), 1)
		.asProperty(`_ydr-${label}`)

	// Unclamp to recover actual Y values
	const yLightExpr = softUnclamp(yLightRawExpr).asProperty(`_yl-${label}`)
	const yDarkExpr = softUnclamp(yDarkRawExpr).asProperty(`_yd-${label}`)

	// Measure achieved contrast using original Y_bg (measurement has its own true softClampY)
	const lcLightExpr = contrastMeasurementReverse
		.bind({ yBg: yBackgroundExpr, yFg: yLightExpr })
		.asProperty(`_lcl-${label}`)

	const lcDarkExpr = contrastMeasurementNormal
		.bind({ yBg: yBackgroundExpr, yFg: yDarkExpr })
		.asProperty(`_lcd-${label}`)

	// Inversion solver uses original Y_bg for zero-contrast fallback
	// Raw values used for exhaustion detection (softUnclamp(1) < 1 would hide exhaustion)
	const yTargetExpr = contrastSolverWithInversion
		.bind({
			yBg: yBackgroundExpr,
			contrast: `contrast-${label}`,
			yLight: yLightExpr,
			yDark: yDarkExpr,
			yLightRaw: yLightRawExpr,
			yDarkRaw: yDarkRawExpr,
			lcLight: lcLightExpr,
			lcDark: lcDarkExpr,
		})
		.asProperty(`_yt-${label}`)

	// Cardano-corrected lightness
	const conLumExpr = buildCorrectedLightness(label, yTargetExpr, slice, coeffs)

	// Max chroma at contrast color's lightness
	const conMaxChromaExpr = bindMaxChroma(conLumExpr, slice).asProperty(`_mc-${label}`)

	// Build the contrast color
	return ct
		.oklch(conLumExpr, ct.multiply(conMaxChromaExpr, 'chroma'), hue)
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
	coeffs: HueYCoefficients,
	yBackgroundExpr: ct.CalcExpression<string>,
	scYBackgroundExpr: ct.CalcExpression<string>,
	output: string,
	noContrastInversion: boolean,
) {
	if (noContrastInversion) {
		return buildContrastColorExprSimple(label, hue, slice, coeffs, scYBackgroundExpr, output)
	}
	return buildContrastColorExprWithInversion(
		label,
		hue,
		slice,
		coeffs,
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
	const slice = findGamutSlice(hue)
	const coeffs = hueYCoefficients(hue)
	const labels = contrastColors.map((c) => c.label)

	const propertyRules = generatePropertyRules(output, labels, noContrastInversion)

	// Collect all declarations into a single object to deduplicate shared
	// intermediate properties (e.g. --_ybg) that appear in multiple expressions
	const declarations: Record<string, string> = {}

	const mergeCss = (css: { declarations: Record<string, string> }) => {
		Object.assign(declarations, css.declarations)
	}

	// Shared max chroma at base lightness (reused by base color and Y_bg)
	const maxChromaExpr = bindMaxChroma(ct.toExpression('lightness'), slice).asProperty('_mc')

	// Build base color expression
	mergeCss(buildBaseColorExpr(hue, maxChromaExpr, output).toCss())

	// Build Y background if we have contrast colors
	if (contrastColors.length > 0) {
		const yBgExpr = buildYBackgroundExpr(slice, coeffs)
		mergeCss(yBgExpr.toCss())

		// Soft-clamped Y_bg for the contrast solver (Lp-norm approximation)
		const scYBgExpr = softClampApprox(yBgExpr).asProperty('_sc')
		mergeCss(scYBgExpr.toCss())

		// Build contrast color expressions
		for (const { label } of contrastColors) {
			mergeCss(
				buildContrastColorExpr(
					label,
					hue,
					slice,
					coeffs,
					yBgExpr,
					scYBgExpr,
					output,
					noContrastInversion,
				).toCss(),
			)
		}
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
