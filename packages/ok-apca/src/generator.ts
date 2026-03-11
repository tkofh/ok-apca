import * as ct from '@ok-apca/calc-tree'
import { softClampApprox } from './apca.ts'
import {
	contrastTargetLightness,
	contrastTargetLightnessWithInversion,
	yBackground,
} from './contrast.ts'
import { computeHueData, maxChromaExpr as maxChroma } from './gamut.ts'
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
	merge(
		ct.property(output, ct.oklch('lightness', ct.multiply(maxChromaExpr, 'chroma'), hue), true).toCss(),
	)

	// Build contrast colors if any
	if (contrastColors.length > 0) {
		const hueDataBindings = { fA: hueData.fA, fB: hueData.fB, fD: hueData.fD }

		// Y_bg with hue-dependent correction bound
		const yBgExpr = ct.property('_ybg', yBackground.bind(hueDataBindings))
		merge(yBgExpr.toCss())

		// Soft-clamped Y_bg for the contrast solver
		const scYBgExpr = ct.property('_sc', softClampApprox.bind({ y: yBgExpr }))
		merge(scYBgExpr.toCss())

		for (const { label } of contrastColors) {
			// Declare contrast input property
			merge(ct.property(`contrast-${label}`, 'number', true).toCss())

			// Get corrected lightness from shared factory, bind Y_bg refs and fA/fB/fD
			const conLExpr = noContrastInversion
				? contrastTargetLightness(label)
				: contrastTargetLightnessWithInversion(label)
			const boundConL = conLExpr.bind({
				...hueDataBindings,
				yBg: yBgExpr,
				scYBg: scYBgExpr,
			})

			// Max chroma at contrast color's lightness
			const conMaxChroma = ct.property(
				`_mc-${label}`,
				maxChroma.bind(hueData).bind({ lightness: boundConL }),
			)

			// Build the contrast color
			merge(
				ct
					.property(
						`${output}-${label}`,
						ct.oklch(boundConL, ct.multiply(conMaxChroma, 'chroma'), hue),
						true,
					)
					.toCss(),
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
