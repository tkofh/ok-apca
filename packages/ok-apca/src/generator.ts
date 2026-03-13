import { Calc, Colors, Properties } from '@ok-apca/calc-tree'
import { softClampApprox } from './apca.ts'
import type { ColorsDefinition, ResolvedHue, ResolvedRole } from './config.ts'
import { contrastTargetLightness, yBackground } from './contrast.ts'
import { computeGamutSlice, maxChromaExpr } from './gamut.ts'
import { outdent, withPrefix } from './util.ts'

export interface ColorSystem {
	readonly css: string
	readonly hues: Record<string, string>
	readonly roles: Record<string, string>
}

/**
 * Build the CSS selector block for a single active role.
 *
 * Creates a child Properties with namespaced gamut inputs, base color, and
 * contrast target expressions.
 */
function buildRoleBlock(parent: Properties.Properties, role: ResolvedRole, prefix: string): string {
	const rolePrefix = `_${prefix}-${role.name}-`
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
		`${prefix}-${role.name}`,
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
			const conL = Calc.bind(contrastTargetLightness(target), { fA, fB, fD, yBg, scYBg })

			const conCMax = Properties.number(
				child,
				`${rolePrefix}mc-${target}`,
				Calc.bind(maxChromaExpr, { lightness: conL, apexL, apexC, tentK }),
			)

			Properties.color(
				child,
				`${prefix}-${target}`,
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
	hue: ResolvedHue,
	roles: readonly ResolvedRole[],
	prefix: string,
	roleSelectorList: string,
): string {
	const slice = computeGamutSlice(hue.hue)

	const nestedDecls: string[] = []
	for (const role of roles) {
		const hueBlock = Properties.make()
		Properties.numbers(hueBlock, withPrefix(`_${prefix}-${role.name}-`, slice))
		for (const [propName, entry] of Properties.entries(hueBlock)) {
			if (entry.declaration !== undefined) {
				nestedDecls.push(`\t\t${propName}: ${entry.declaration};`)
			}
		}
	}

	const nestedSelector = `:is(&, & *):is(${roleSelectorList})`
	const block = `${hue.selector} {\n\t${nestedSelector} {\n${nestedDecls.join('\n')}\n\t}\n}`

	return block
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
export function generateColorSystem(definition: ColorsDefinition): ColorSystem {
	const { prefix, hues, roles } = definition
	const parent = Properties.make()

	Properties.number(parent, 'lightness')
	Properties.number(parent, 'chroma')

	for (const target of new Set<string>(roles.flatMap((role) => role.contrastTargets))) {
		Properties.number(parent, `contrast-${target}`)
		Properties.number(parent, `${target}-invertable`)
	}

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

	const roleSelectorList = roles.map((r) => r.selector).join(', ')

	return {
		css: outdent`
			${Properties.toAtRules(parent)}

			${[
				...roles.map((role) => buildRoleBlock(parent, role, prefix)),
				...hues.map((hueEntry) => buildHueBlock(hueEntry, roles, prefix, roleSelectorList)),
			].join('\n\n')}
		`,
		hues: Object.fromEntries(hues.map((h) => [h.name, h.selector])),
		roles: Object.fromEntries(roles.map((r) => [r.name, r.selector])),
	}
}
