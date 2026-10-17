import { Calc } from 'fashionable/calc'
import { Color } from 'fashionable/data'
import { Declaration } from 'fashionable/declaration'
import { PropertyRule } from 'fashionable/property'
import { RuleSet, StyleRule } from 'fashionable/rule'
import { Selector } from 'fashionable/selector'
import { Stylesheet } from 'fashionable/stylesheet'
import { Var } from 'fashionable/var'
import { softClampApprox } from './apca.ts'
import type { ColorsDefinition, ResolvedHue, ResolvedRole } from './config.ts'
import { type ComputedPropertyCollector, contrastTargetLightness, yBackground } from './contrast.ts'
import { computeGamutSlice, maxChromaExpr } from './gamut.ts'

export interface ColorSystem {
	/** The generated stylesheet, as a single CSS string. */
	readonly css: string
	/** Each hue name mapped to its class name. */
	readonly hues: Record<string, string>
	/** Each role name mapped to its class name. */
	readonly roles: Record<string, string>
}

/**
 * Registers custom properties as `@property` rules and hands out their
 * handles.
 *
 * A fashionable `Var` handle is one value carrying the property's name and
 * declared type: `PropertyRule.make(handle, initial)` derives the registered
 * syntax from it, `Declaration.make(handle, expr)` type-checks writes against
 * it, and `Calc.var(handle)` reads it. Handing the same handle to all three
 * is what keeps a computed-property chain in sync. This registry is the
 * shared half — every block feeds it, each name registers once, and repeated
 * calls return the same handle (`Var.number` is idempotent per name).
 *
 * The `_` prefix convention drives `inherits`: internal names (`_…`) register
 * `inherits: false` (make's default), so intermediates never leak down the
 * tree; public output names opt in via `PropertyRule.inheritable`.
 */
class PropertyRegistry {
	private readonly rules = new Map<string, PropertyRule.PropertyRule>()

	private inherits(name: string, rule: PropertyRule.PropertyRule): PropertyRule.PropertyRule {
		return name.startsWith('_') ? rule : rule.pipe(PropertyRule.inheritable)
	}

	number<Name extends string>(name: Name) {
		const handle = Var.number(name)
		if (!this.rules.has(name)) {
			this.rules.set(name, this.inherits(name, PropertyRule.make(handle, 0)))
		}
		return handle
	}

	color<Name extends string>(name: Name) {
		const handle = Var.color(name)
		if (!this.rules.has(name)) {
			this.rules.set(name, this.inherits(name, PropertyRule.make(handle, 'transparent')))
		}
		return handle
	}

	/** All registered `@property` rules, in registration order. */
	get nodes(): readonly PropertyRule.PropertyRule[] {
		return [...this.rules.values()]
	}
}

/**
 * The gamut-slice fields the role expressions read, in declaration order for
 * the hue blocks. Must stay in step with the record `makeGamutInputs` builds —
 * a key here without a handle there is a type error; the reverse would drop a
 * constant from the hue blocks silently.
 */
const GAMUT_INPUTS = ['hue', 'apexL', 'apexC', 'tentK', 'fA', 'fB', 'fD'] as const

/**
 * One typed handle per hue-dependent gamut input, namespaced under the shared
 * (not per-role) prefix. The handle record is the seam between the two block
 * kinds: role blocks read these properties (`Calc.var`), hue blocks write
 * their per-slice values (`Declaration.make`), and the registration both rely
 * on happens here — one value keeps all three in sync. The rest of a
 * `GamutSlice` (`maxChroma`) is used only by the TypeScript runtime, never
 * emitted.
 */
function makeGamutInputs(prefix: string, registry: PropertyRegistry) {
	return {
		hue: registry.number(`_${prefix}-hue`),
		apexL: registry.number(`_${prefix}-apexL`),
		apexC: registry.number(`_${prefix}-apexC`),
		tentK: registry.number(`_${prefix}-tentK`),
		fA: registry.number(`_${prefix}-fA`),
		fB: registry.number(`_${prefix}-fB`),
		fD: registry.number(`_${prefix}-fD`),
	}
}

type GamutInputs = ReturnType<typeof makeGamutInputs>

/**
 * Build the style rule for a single active role.
 *
 * Emits the role's own color plus its contrast-target colors, registering the
 * `@property` rules and intermediate computed properties along the way. The
 * gamut-slice inputs stay unbound reads, set per element by the hue rules.
 */
function buildRoleRule(
	role: ResolvedRole,
	prefix: string,
	registry: PropertyRegistry,
	gamut: GamutInputs,
): StyleRule.StyleRule {
	const rolePrefix = `_${prefix}-${role.name}-`
	const decls: Declaration.Declaration[] = []

	const hue = Calc.var(gamut.hue)
	const apexL = Calc.var(gamut.apexL)
	const apexC = Calc.var(gamut.apexC)
	const tentK = Calc.var(gamut.tentK)
	const fA = Calc.var(gamut.fA)
	const fB = Calc.var(gamut.fB)
	const fD = Calc.var(gamut.fD)

	// Register a computed number property, emit its declaration into this block,
	// and hand back a read of it. The read — not the sub-expression — is what
	// downstream expressions carry, so each intermediate stays a single `var()`
	// in the fully-substituted tree (see the DevTools expansion constraint in
	// CLAUDE.md).
	const computeNumber = (name: string, expr: Calc.Calc): Calc.Calc => {
		const handle = registry.number(name)
		decls.push(Declaration.make(handle, expr))
		return Calc.var(handle)
	}
	const outputColor = (name: string, expr: Color.Color): void => {
		decls.push(Declaration.make(registry.color(name), expr))
	}

	// Max chroma at the active role's lightness.
	const maxChromaProp = computeNumber(
		`${rolePrefix}mc`,
		Calc.bind(maxChromaExpr, { lightness: Calc.var('lightness'), apexL, apexC, tentK }),
	)

	// Active role's base color output.
	outputColor(
		`${prefix}-${role.name}`,
		Color.oklch(Calc.var('lightness'), Calc.multiply(maxChromaProp, Calc.var('chroma')), hue),
	)

	// Contrast colors.
	if (role.contrastTargets.length > 0) {
		const yBg = computeNumber(`${rolePrefix}ybg`, Calc.bind(yBackground, { fA, fB, fD }))
		const scYBg = computeNumber(`${rolePrefix}sc`, Calc.bind(softClampApprox, { y: yBg }))

		// The hue/role-scoped leaf inputs each contrast intermediate reads. The
		// collector binds them where calc-tree bound them once at the top; names
		// the expression lacks are ignored, so the same object serves every
		// intermediate.
		const leafBindings = { fA, fB, fD, yBg, scYBg }
		const collect: ComputedPropertyCollector = (name, expr) =>
			computeNumber(name, Calc.bind(expr, leafBindings))

		for (const target of role.contrastTargets) {
			const conL = contrastTargetLightness(target, collect)
			const conCMax = computeNumber(
				`${rolePrefix}mc-${target}`,
				Calc.bind(maxChromaExpr, { lightness: conL, apexL, apexC, tentK }),
			)
			outputColor(
				`${prefix}-${target}`,
				Color.oklch(conL, Calc.multiply(conCMax, Calc.var('chroma')), hue),
			)
		}
	}

	return StyleRule.make(Selector.class(role.className), RuleSet.make(...decls))
}

/**
 * Build a hue rule: the hue selector wrapping a nested rule that assigns the
 * slice's gamut constants directly to role elements.
 *
 * The nested selector is `:is(&, & *):is(.role1, .role2, …)`: within the hue
 * subtree (`&` — `Selector.nest` — reads the enclosing hue selector; `& *` is
 * its descendants), exactly the elements carrying a role class. Writing
 * the constants on the role elements themselves, rather than letting them
 * inherit, is what lets the role properties register `inherits: false`.
 * The constants' `@property` registrations live on the shared handles; the
 * hue rule only writes values.
 */
function buildHueRule(
	hueEntry: ResolvedHue,
	gamut: GamutInputs,
	roleSelectors: readonly Selector.Selector[],
): StyleRule.StyleRule {
	const slice = computeGamutSlice(hueEntry.hue)
	const scope = Selector.and(
		Selector.is(Selector.nest, Selector.descendant(Selector.nest, Selector.universal)),
		Selector.is(...roleSelectors),
	)

	return StyleRule.make(
		Selector.class(hueEntry.className),
		RuleSet.make(
			StyleRule.make(
				scope,
				RuleSet.make(...GAMUT_INPUTS.map((key) => Declaration.make(gamut[key], slice[key]))),
			),
		),
	)
}

/**
 * Generate CSS for a multi-hue color system with APCA-based contrast roles.
 *
 * Accepts a pre-validated `ColorsDefinition` from `defineColors`.
 *
 * Each active role gets its own style rule. When active, it sets its own
 * color from `--lightness`/`--chroma`, and computes contrast colors for its
 * target roles. Expression trees are built once (hue-independent). Gamut
 * slice constants are left as CSS custom properties, set by nested hue rules.
 * Everything folds into one fashionable `Stylesheet` for rendering.
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
	const registry = new PropertyRegistry()

	registry.number('lightness')
	registry.number('chroma')

	for (const target of new Set<string>(roles.flatMap((role) => role.contrastTargets))) {
		registry.number(`contrast-${target}`)
		registry.number(`${target}-invertable`)
	}

	const allRoleNames = new Set<string>()
	for (const role of roles) {
		allRoleNames.add(role.name)
		for (const target of role.contrastTargets) {
			allRoleNames.add(target)
		}
	}
	for (const roleName of allRoleNames) {
		registry.color(`${prefix}-${roleName}`)
	}

	const gamutInputs = makeGamutInputs(prefix, registry)
	const roleSelectors = roles.map((role) => Selector.class(role.className))

	// Build role and hue rules first so their computed properties register
	// before the registry's `@property` nodes are read.
	const rules = [
		...roles.map((role) => buildRoleRule(role, prefix, registry, gamutInputs)),
		...hues.map((hueEntry) => buildHueRule(hueEntry, gamutInputs, roleSelectors)),
	]

	return {
		css: Stylesheet.render(Stylesheet.make(...registry.nodes, ...rules)),
		hues: Object.fromEntries(hues.map((h) => [h.name, h.className])),
		roles: Object.fromEntries(roles.map((r) => [r.name, r.className])),
	}
}
