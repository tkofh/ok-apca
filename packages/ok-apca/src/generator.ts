import { Calc, Colors, Properties } from '@ok-apca/calc-tree'
import { softClampApprox } from './apca.ts'
import {
	contrastTargetLightness,
	contrastTargetLightnessWithInversion,
	yBackground,
} from './contrast.ts'
import { computeGamutSlice, type GamutSlice, maxChromaExpr } from './gamut.ts'
import { outdent } from './util.ts'

export interface HueEntry {
	readonly name: string
	readonly hue: number
	readonly selector: string
}

export interface ColorsDefinition {
	readonly output: string
	readonly baseSelector: string
	readonly hues: readonly HueEntry[]
	readonly variants: readonly string[]
	readonly noContrastInversion: boolean
}

export interface GeneratedHue {
	readonly name: string
	readonly hue: number
	readonly selector: string
	readonly slice: GamutSlice
}

export interface ColorSystem {
	readonly css: string
	readonly hues: readonly GeneratedHue[]
}

/**
 * Generate CSS for a multi-hue color system with APCA-based contrast variants.
 *
 * Accepts a pre-validated `ColorsDefinition` from `defineColors`.
 *
 * The expression tree is built once (hue-independent). Gamut slice constants
 * are left as CSS custom properties, set by per-hue selectors. All variant
 * declarations live in the base selector.
 *
 * Runtime inputs (all normalized):
 * - `--lightness` (0–1), `--chroma` (0–1)
 * - `--contrast-{variant}` (-1.08 to 1.08)
 *
 * Outputs:
 * - `--{output}` (e.g., `--color`)
 * - `--{output}-{variant}` (e.g., `--color-text`)
 */
export function generateColorsCss(definition: ColorsDefinition): ColorSystem {
	const { output, baseSelector, hues, variants, noContrastInversion } = definition

	// Prefix for internal/intermediate properties
	const p = `_${output}-`

	const base = Properties.make()

	// =========================================================================
	// Gamut slice input properties (set by hue selectors, inherits: false via _ prefix)
	// =========================================================================

	const hueInput = Properties.number(base, `${p}hue`)
	const apexLInput = Properties.number(base, `${p}apexL`)
	const apexCInput = Properties.number(base, `${p}apexC`)
	const curvatureInput = Properties.number(base, `${p}curvature`)
	const fAInput = Properties.number(base, `${p}fA`)
	const fBInput = Properties.number(base, `${p}fB`)
	const fDInput = Properties.number(base, `${p}fD`)

	// User-facing input properties (inherits: true via no _ prefix)
	const lightnessInput = Properties.number(base, 'lightness')
	Properties.number(base, 'chroma')

	// =========================================================================
	// Base color
	// =========================================================================

	// Max chroma at base lightness — bind gamut refs to input properties
	const maxChromaProp = Properties.number(
		base,
		`${p}mc`,
		Calc.bind(maxChromaExpr, {
			lightness: lightnessInput,
			apexL: apexLInput,
			apexC: apexCInput,
			curvature: curvatureInput,
		}),
	)

	// Base color output (inherits: true via no _ prefix)
	Properties.color(
		base,
		output,
		Colors.oklch('lightness', Calc.multiply(maxChromaProp, 'chroma'), hueInput),
	)

	// =========================================================================
	// Variants (contrast colors)
	// =========================================================================

	if (variants.length > 0) {
		// Bind gamut slice refs into Y background
		const yBgExpr = Properties.number(
			base,
			`${p}ybg`,
			Calc.bind(yBackground, {
				fA: fAInput,
				fB: fBInput,
				fD: fDInput,
			}),
		)

		// Soft-clamped Y_bg
		const scYBgExpr = Properties.number(base, `${p}sc`, Calc.bind(softClampApprox, { y: yBgExpr }))

		for (const variant of variants) {
			// Declare contrast input property (inherits: true via no _ prefix)
			Properties.number(base, `contrast-${variant}`)

			// Contrast target lightness
			const conLExpr = noContrastInversion
				? contrastTargetLightness(variant)
				: contrastTargetLightnessWithInversion(variant)
			const boundConL = Calc.bind(conLExpr, {
				fA: fAInput,
				fB: fBInput,
				fD: fDInput,
				yBg: yBgExpr,
				scYBg: scYBgExpr,
			})

			// Max chroma at contrast color's lightness
			const conMaxChroma = Properties.number(
				base,
				`${p}mc-${variant}`,
				Calc.bind(maxChromaExpr, {
					lightness: boundConL,
					apexL: apexLInput,
					apexC: apexCInput,
					curvature: curvatureInput,
				}),
			)

			// Contrast color output (inherits: true via no _ prefix)
			Properties.color(
				base,
				`${output}-${variant}`,
				Colors.oklch(boundConL, Calc.multiply(conMaxChroma, 'chroma'), hueInput),
			)
		}
	}

	// =========================================================================
	// Hue selector blocks
	// =========================================================================

	const generatedHues: GeneratedHue[] = []
	const hueBlocks: string[] = []

	for (const hueEntry of hues) {
		const hue = ((hueEntry.hue % 360) + 360) % 360
		const slice = computeGamutSlice(hue)

		generatedHues.push({
			name: hueEntry.name,
			hue,
			selector: hueEntry.selector,
			slice,
		})

		const hueBlock = Properties.make()
		Properties.numbers(hueBlock, {
			[`${p}hue`]: hue,
			[`${p}apexL`]: slice.apexL,
			[`${p}apexC`]: slice.apexC,
			[`${p}curvature`]: slice.curvature,
			[`${p}fA`]: slice.fA,
			[`${p}fB`]: slice.fB,
			[`${p}fD`]: slice.fD,
		})
		hueBlocks.push(Properties.toRuleset(hueBlock, hueEntry.selector))
	}

	// =========================================================================
	// Build CSS output
	// =========================================================================

	const css = outdent`
		${Properties.toAtRules(base)}

		${[Properties.toRuleset(base, baseSelector), ...hueBlocks].join('\n\n')}
	`

	return { css, hues: generatedHues }
}
