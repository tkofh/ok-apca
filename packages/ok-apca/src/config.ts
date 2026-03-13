import { invariant, type OneOrMore, toArray, type ZeroOrMore } from './util.ts'

interface BaseRoleEntry {
	/** Semantic name (e.g., 'fill', 'text', 'border'). */
	readonly name: string
	/**
	 * Which active roles this role should appear on as a contrast color.
	 * Defaults to all other active roles. Narrowing this skips CSS for
	 * unlikely pairings (e.g., a focus ring doesn't need contrast against icons).
	 */
	readonly contrastsWith?: ZeroOrMore<string> | undefined
}

interface ActiveRoleEntry extends BaseRoleEntry {
	/**
	 * CSS selector for this role's active-color class.
	 * @default `.${name}`
	 */
	readonly selector?: string | undefined
	readonly passive?: false | undefined
}

interface PassiveRoleEntry extends BaseRoleEntry {
	readonly passive: true
}

export type RoleEntry = ActiveRoleEntry | PassiveRoleEntry

export interface HueEntry {
	/** Hue angle in degrees. Normalized to [0, 360). */
	readonly hue: number
	/**
	 * Semantic name for this hue.
	 * @default `'hue-${hue}'` (using the normalized hue value)
	 */
	readonly name?: string | undefined
	/**
	 * CSS selector for this hue.
	 * @default `.${name}`
	 */
	readonly selector?: string | undefined
}

export interface ColorSetOptions {
	/**
	 * Property namespace. Prefixes all output properties.
	 * @default 'color'
	 */
	readonly prefix?: string | undefined
	/** Hue definitions. Each gets a selector setting gamut constants. */
	readonly hues: OneOrMore<HueEntry>
	/** Color roles in this set. */
	readonly roles: OneOrMore<RoleEntry>
}

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
}

const LABEL_REGEX = /^[a-z][a-z0-9_-]*$/i

function processRoles(roles: readonly RoleEntry[]): readonly ResolvedRole[] {
	const active: ActiveRoleEntry[] = []
	const names: string[] = []
	const contrastRefs = new Set<string>()

	// Maps role name → set of active roles it wants to appear on (null = all)
	const appearsOn = new Map<string, Set<string> | null>()

	for (const role of roles) {
		invariant(
			LABEL_REGEX.test(role.name),
			`Invalid role name '${role.name}'. Must start with a letter and contain only letters, numbers, hyphens, and underscores.`,
		)
		invariant(
			!names.includes(role.name),
			`Duplicate role name '${role.name}'. Each role name must be unique.`,
		)
		names.push(role.name)

		if (role.contrastsWith != null) {
			const refs = new Set<string>()
			for (const ref of toArray<string>(role.contrastsWith)) {
				invariant(
					ref !== role.name,
					`Role '${role.name}' must not reference itself in contrastsWith.`,
				)
				contrastRefs.add(ref)
				refs.add(ref)
			}
			appearsOn.set(role.name, refs)
		} else {
			appearsOn.set(role.name, null)
		}

		if (!role.passive) {
			active.push(role)
		}
	}

	invariant(active.length > 0, 'At least one active role is required.')

	const unknownRefs = contrastRefs.difference(new Set(names))
	invariant(
		unknownRefs.size === 0,
		`contrastsWith references unknown role: ${[...unknownRefs].join(', ')}`,
	)

	return active.map((role) => ({
		name: role.name,
		selector: role.selector ?? `.${role.name}`,
		contrastTargets: names.filter((target) => {
			if (target === role.name) {
				return false
			}
			const targets = appearsOn.get(target) as Set<string>
			return targets === null || targets.has(role.name)
		}),
	}))
}

function processHues(hues: readonly HueEntry[]): readonly ResolvedHue[] {
	const names = new Set<string>()

	return hues.map((entry) => {
		const hue = ((entry.hue % 360) + 360) % 360
		const name = entry.name ?? `hue-${hue}`
		const selector = entry.selector ?? `.${name}`

		invariant(
			LABEL_REGEX.test(name),
			`Invalid hue name '${name}'. Must start with a letter and contain only letters, numbers, hyphens, and underscores.`,
		)
		invariant(!names.has(name), `Duplicate hue name '${name}'. Each hue name must be unique.`)
		names.add(name)

		return { name, hue, selector }
	})
}

export function resolveColorSet(options: ColorSetOptions): ColorsDefinition {
	return {
		prefix: options.prefix ?? 'color',
		hues: processHues(toArray(options.hues)),
		roles: processRoles(toArray(options.roles)),
	}
}
