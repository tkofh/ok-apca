import { Calc, Colors, Properties } from '@ok-apca/calc-tree'
import { softClampApprox } from './apca.ts'
import {
	contrastTargetLightness,
	contrastTargetLightnessWithInversion,
	yBackground,
} from './contrast.ts'
import { computeGamutSlice, type GamutSlice, maxChromaExpr } from './gamut.ts'
import { outdent } from './util.ts'

export interface ResolvedHue {
	readonly name: string
	readonly hue: number
	readonly selector: string
}

export interface ResolvedRole {
	readonly name: string
	readonly selector: string
	readonly contrastTargets: readonly string[]
}

export interface ColorsDefinition {
	readonly prefix: string
	readonly hues: readonly ResolvedHue[]
	readonly roles: readonly ResolvedRole[]
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
 * Build the CSS selector block for a single active role.
 *
 * Creates a child Properties with namespaced gamut inputs, base color, and
 * contrast target expressions.
 */
function buildRoleBlock(
	parent: Properties.Properties,
	role: ResolvedRole,
	outputPrefix: string,
	prefix: string,
	noContrastInversion: boolean,
): string {
	const rolePrefix = `${prefix}${role.name}-`
	const child = Properties.make(parent)

	// Gamut slice input properties (inherits: false via _ prefix)
	const hue = Properties.number(child, `${rolePrefix}hue`)
	const apexL = Properties.number(child, `${rolePrefix}apexL`)
	const apexC = Properties.number(child, `${rolePrefix}apexC`)
	const tentK = Properties.number(child, `${rolePrefix}tentK`)
	const fA = Properties.number(child, `${rolePrefix}fA`)
	const fB = Properties.number(child, `${rolePrefix}fB`)
	const fD = Properties.number(child, `${rolePrefix}fD`)

	// Max chroma at active role's lightness
	const maxChromaProp = Properties.number(
		child,
		`${rolePrefix}mc`,
		Calc.bind(maxChromaExpr, {
			lightness: Properties.number('lightness'),
			apexL,
			apexC,
			tentK,
		}),
	)

	// Active role's base color output
	Properties.color(
		child,
		`${outputPrefix}-${role.name}`,
		Colors.oklch(Calc.ref('lightness'), Calc.multiply(maxChromaProp, Calc.ref('chroma')), hue),
	)

	// Contrast colors
	if (role.contrastTargets.length > 0) {
		const yBg = Properties.number(child, `${rolePrefix}ybg`, Calc.bind(yBackground, { fA, fB, fD }))
		const scYBg = Properties.number(
			child,
			`${rolePrefix}sc`,
			Calc.bind(softClampApprox, { y: yBg }),
		)

		for (const target of role.contrastTargets) {
			const conL = Calc.bind(
				noContrastInversion
					? contrastTargetLightness(target)
					: contrastTargetLightnessWithInversion(target),
				{ fA, fB, fD, yBg, scYBg },
			)

			const conCMax = Properties.number(
				child,
				`${rolePrefix}mc-${target}`,
				Calc.bind(maxChromaExpr, { lightness: conL, apexL, apexC, tentK }),
			)

			Properties.color(
				child,
				`${outputPrefix}-${target}`,
				Colors.oklch(conL, Calc.multiply(conCMax, Calc.ref('chroma')), hue),
			)
		}
	}

	return Properties.toRuleset(child, role.selector)
}

/**
 * Build a hue selector block with :is() nesting to assign gamut constants
 * directly to role elements.
 */
function buildHueBlock(
	hueEntry: ResolvedHue,
	roles: readonly ResolvedRole[],
	prefix: string,
	roleSelectorList: string,
): { block: string; generatedHue: GeneratedHue } {
	const { hue } = hueEntry
	const slice = computeGamutSlice(hue)

	const nestedDecls: string[] = []
	for (const role of roles) {
		const rolePrefix = `${prefix}${role.name}-`
		const hueBlock = Properties.make()
		Properties.numbers(hueBlock, {
			[`${rolePrefix}hue`]: hue,
			[`${rolePrefix}apexL`]: slice.apexL,
			[`${rolePrefix}apexC`]: slice.apexC,
			[`${rolePrefix}tentK`]: slice.tentK,
			[`${rolePrefix}fA`]: slice.fA,
			[`${rolePrefix}fB`]: slice.fB,
			[`${rolePrefix}fD`]: slice.fD,
		})
		for (const [propName, entry] of Properties.entries(hueBlock)) {
			if (entry.declaration !== undefined) {
				nestedDecls.push(`\t\t${propName}: ${entry.declaration};`)
			}
		}
	}

	const nestedSelector = `:is(&, & *):is(${roleSelectorList})`
	const block = `${hueEntry.selector} {\n\t${nestedSelector} {\n${nestedDecls.join('\n')}\n\t}\n}`

	return {
		block,
		generatedHue: { name: hueEntry.name, hue, selector: hueEntry.selector, slice },
	}
}

/**
 * Generate CSS for a multi-hue color system with APCA-based contrast roles.
 *
 * Accepts a pre-validated `ColorsDefinition` from `defineColors`.
 *
 * Each active role gets its own selector block. When active, it sets its own
 * color from `--lightness`/`--chroma`, and computes contrast colors for its
 * target roles. Expression trees are built once (hue-independent). Gamut slice
 * constants are left as CSS custom properties, set by nested hue selectors.
 *
 * Runtime inputs (all normalized):
 * - `--lightness` (0–1), `--chroma` (0–1)
 * - `--contrast-{role}` (-1.08 to 1.08)
 *
 * Outputs:
 * - `--{prefix}-{role}` (e.g., `--color-fill`, `--color-text`)
 */
export function generateColorsCss(definition: ColorsDefinition): ColorSystem {
	const { prefix, hues, roles, noContrastInversion } = definition
	const p = `_${prefix}-`

	const parent = Properties.make()

	// Shared input properties
	Properties.number(parent, 'lightness')
	Properties.number(parent, 'chroma')

	// Contrast input properties for all target roles
	const allContrastTargets = new Set<string>()
	for (const role of roles) {
		for (const target of role.contrastTargets) {
			allContrastTargets.add(target)
		}
	}
	for (const target of allContrastTargets) {
		Properties.number(parent, `contrast-${target}`)
	}

	// Output color properties on parent for @property rule collection
	const allRoleNames = new Set<string>()
	for (const role of roles) {
		allRoleNames.add(role.name)
		for (const target of role.contrastTargets) {
			allRoleNames.add(target)
		}
	}
	for (const roleName of allRoleNames) {
		Properties.color(parent, `${prefix}-${roleName}`, Colors.oklch(0.5, 0, 0))
	}

	// Per-active-role selector blocks
	const roleBlocks = roles.map((role) =>
		buildRoleBlock(parent, role, prefix, p, noContrastInversion),
	)

	// Hue selector blocks with :is() nesting
	const roleSelectorList = roles.map((r) => r.selector).join(', ')
	const generatedHues: GeneratedHue[] = []
	const hueBlocks: string[] = []

	for (const hueEntry of hues) {
		const { block, generatedHue } = buildHueBlock(hueEntry, roles, p, roleSelectorList)
		hueBlocks.push(block)
		generatedHues.push(generatedHue)
	}

	const css = outdent`
		${Properties.toAtRules(parent)}

		${[...roleBlocks, ...hueBlocks].join('\n\n')}
	`

	return { css, hues: generatedHues }
}
