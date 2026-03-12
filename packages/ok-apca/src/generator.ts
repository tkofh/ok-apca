import * as ct from '@ok-apca/calc-tree'
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

	const base = ct.declarations()

	// =========================================================================
	// Gamut slice input properties (set by hue selectors, inherit: true)
	// =========================================================================

	const hueInput = base.property(`${p}hue`, 'number', true)
	const apexLInput = base.property(`${p}apexL`, 'number', true)
	const apexCInput = base.property(`${p}apexC`, 'number', true)
	const curvatureInput = base.property(`${p}curvature`, 'number', true)
	const fAInput = base.property(`${p}fA`, 'number', true)
	const fBInput = base.property(`${p}fB`, 'number', true)
	const fDInput = base.property(`${p}fD`, 'number', true)

	// User-facing input properties (inherit: true)
	const lightnessInput = base.property('lightness', 'number', true)
	base.property('chroma', 'number', true)

	// =========================================================================
	// Base color
	// =========================================================================

	// Max chroma at base lightness — bind gamut refs to input properties
	const maxChromaProp = base.property(
		`${p}mc`,
		maxChromaExpr.bind({
			lightness: lightnessInput,
			apexL: apexLInput,
			apexC: apexCInput,
			curvature: curvatureInput,
		}),
	)

	// Base color output (inherit: true)
	base.property(output, ct.oklch('lightness', ct.multiply(maxChromaProp, 'chroma'), hueInput), true)

	// =========================================================================
	// Variants (contrast colors)
	// =========================================================================

	if (variants.length > 0) {
		// Bind gamut slice refs into Y background
		const yBgExpr = base.property(
			`${p}ybg`,
			yBackground.bind({
				fA: fAInput,
				fB: fBInput,
				fD: fDInput,
			}),
		)

		// Soft-clamped Y_bg
		const scYBgExpr = base.property(`${p}sc`, softClampApprox.bind({ y: yBgExpr }))

		for (const variant of variants) {
			// Declare contrast input property (inherit: true)
			base.property(`contrast-${variant}`, 'number', true)

			// Contrast target lightness
			const conLExpr = noContrastInversion
				? contrastTargetLightness(variant)
				: contrastTargetLightnessWithInversion(variant)
			const boundConL = conLExpr.bind({
				fA: fAInput,
				fB: fBInput,
				fD: fDInput,
				yBg: yBgExpr,
				scYBg: scYBgExpr,
			})

			// Max chroma at contrast color's lightness
			const conMaxChroma = base.property(
				`${p}mc-${variant}`,
				maxChromaExpr.bind({
					lightness: boundConL,
					apexL: apexLInput,
					apexC: apexCInput,
					curvature: curvatureInput,
				}),
			)

			// Contrast color output (inherit: true)
			base.property(
				`${output}-${variant}`,
				ct.oklch(boundConL, ct.multiply(conMaxChroma, 'chroma'), hueInput),
				true,
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

		const hueBlock = ct.declarations()
		hueBlock.assign(p, {
			hue,
			apexL: slice.apexL,
			apexC: slice.apexC,
			curvature: slice.curvature,
			fA: slice.fA,
			fB: slice.fB,
			fD: slice.fD,
		})
		hueBlocks.push(hueBlock.toSelector(hueEntry.selector))
	}

	// =========================================================================
	// Build CSS output
	// =========================================================================

	const css = outdent`
		${base.toPropertyRules()}

		${[base.toSelector(baseSelector), ...hueBlocks].join('\n\n')}
	`

	return { css, hues: generatedHues }
}
