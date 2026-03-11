import * as ct from '@ok-apca/calc-tree'
import { softClampApprox } from './apca.ts'
import {
	contrastTargetLightness,
	contrastTargetLightnessWithInversion,
	yBackground,
} from './contrast.ts'
import { computeGamutSlice } from './gamut.ts'
import { outdent } from './util.ts'

export interface ContrastColor {
	readonly label: string
	readonly selector?: string
}

export interface ContrastColorWithSelector {
	readonly label: string
	readonly selector: string
}

export type HueDefinition = {
	readonly hue: number
	readonly output: string
	readonly noContrastInversion: boolean
} & (
	| {
			readonly selector: string
			readonly contrastColors: readonly ContrastColor[]
	  }
	| {
			readonly selector?: never
			readonly contrastColors: readonly ContrastColorWithSelector[]
	  }
)

function groupContrastDeclarations(
	contrastColors: readonly ContrastColor[],
	contrastDeclarationsByLabel: Map<string, Record<string, string>>,
	sharedDeclarations: Record<string, string>,
	mainBlockDecls: Record<string, string>,
): Map<string, Record<string, string>> {
	const selectorGroups = new Map<string, Record<string, string>>()
	for (const cc of contrastColors) {
		const decls = contrastDeclarationsByLabel.get(cc.label) ?? {}
		if (cc.selector) {
			const existing = selectorGroups.get(cc.selector)
			if (existing) {
				Object.assign(existing, decls)
			} else {
				selectorGroups.set(cc.selector, { ...sharedDeclarations, ...decls })
			}
		} else {
			Object.assign(mainBlockDecls, decls)
		}
	}
	return selectorGroups
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
	const { hue, output, contrastColors, noContrastInversion } = definition
	const slice = computeGamutSlice(hue)

	// Declare input properties
	const lightnessInput = ct.property('lightness', 'number', true)
	const chromaInput = ct.property('chroma', 'number', true)

	// Base declarations (only in main selector)
	const baseDeclarations: Record<string, string> = {}
	// Shared intermediate declarations (main selector + contrast selector blocks)
	const sharedDeclarations: Record<string, string> = {}
	// Per-contrast declarations, keyed by label
	const contrastDeclarationsByLabel = new Map<string, Record<string, string>>()
	// All @property rules
	const properties: Record<string, ct.PropertyRule> = {}

	const mergeBase = (css: ct.CSSResult) => {
		Object.assign(baseDeclarations, css.declarations)
		Object.assign(properties, css.properties)
	}

	const mergeShared = (css: ct.CSSResult) => {
		Object.assign(sharedDeclarations, css.declarations)
		Object.assign(properties, css.properties)
	}

	const mergeContrast = (label: string, css: ct.CSSResult) => {
		let decls = contrastDeclarationsByLabel.get(label)
		if (!decls) {
			decls = {}
			contrastDeclarationsByLabel.set(label, decls)
		}
		Object.assign(decls, css.declarations)
		Object.assign(properties, css.properties)
	}

	// Shared max chroma at base lightness (reused by base color and Y_bg)
	const maxChromaExpr = ct.property('_mc', slice.maxChroma.bind({ lightness: lightnessInput }))

	// Build base color expression
	mergeBase(
		ct
			.property(output, ct.oklch('lightness', ct.multiply(maxChromaExpr, 'chroma'), hue), true)
			.toCss(),
	)

	// Build contrast colors if any
	if (contrastColors.length > 0) {
		// Y_bg with hue-dependent correction bound
		const yBgExpr = ct.property('_ybg', yBackground.bind(slice))
		mergeShared(yBgExpr.toCss())

		// Soft-clamped Y_bg for the contrast solver
		const scYBgExpr = ct.property('_sc', softClampApprox.bind({ y: yBgExpr }))
		mergeShared(scYBgExpr.toCss())

		for (const cc of contrastColors) {
			// Declare contrast input property
			mergeContrast(cc.label, ct.property(`contrast-${cc.label}`, 'number', true).toCss())

			// Get corrected lightness from shared factory, bind Y_bg refs and fA/fB/fD
			const conLExpr = noContrastInversion
				? contrastTargetLightness(cc.label)
				: contrastTargetLightnessWithInversion(cc.label)
			const boundConL = conLExpr.bind({
				...slice,
				yBg: yBgExpr,
				scYBg: scYBgExpr,
			})

			// Max chroma at contrast color's lightness
			const conMaxChroma = ct.property(
				`_mc-${cc.label}`,
				slice.maxChroma.bind({ lightness: boundConL }),
			)

			// Build the contrast color
			mergeContrast(
				cc.label,
				ct
					.property(
						`${output}-${cc.label}`,
						ct.oklch(boundConL, ct.multiply(conMaxChroma, 'chroma'), hue),
						true,
					)
					.toCss(),
			)
		}
	}

	// Ensure input properties are registered even if they weren't serialized
	mergeShared(lightnessInput.toCss())
	mergeShared(chromaInput.toCss())

	// Determine main selector
	const mainSelector =
		definition.selector ??
		`:is(${[...new Set(contrastColors.flatMap((cc) => (cc.selector ? [cc.selector] : [])))].join(', ')})`

	// Build main block: base + shared + contrast colors without own selector
	const mainBlockDecls: Record<string, string> = { ...sharedDeclarations, ...baseDeclarations }

	// Group contrast colors by selector, or merge into main block
	const selectorGroups = groupContrastDeclarations(
		contrastColors,
		contrastDeclarationsByLabel,
		sharedDeclarations,
		mainBlockDecls,
	)

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

	const formatDeclarationBlock = (decls: Record<string, string>) =>
		Object.entries(decls)
			.map(([name, value]) => `${name}: ${value};`)
			.join('\n')

	const blocks = [
		outdent`
			${mainSelector} {
				${formatDeclarationBlock(mainBlockDecls)}
			}
		`,
		...[...selectorGroups].map(
			([selector, decls]) => outdent`
				${selector} {
					${formatDeclarationBlock(decls)}
				}
			`,
		),
	]

	return outdent`
		${propertyRules}

		${blocks.join('\n\n')}
	`
}
