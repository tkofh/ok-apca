/**
 * ok-apca - OKLCH color utilities with APCA-based contrast
 */

import {
	type ColorSystem,
	type ColorsDefinition,
	generateColorsCss,
	type HueEntry,
	type ResolvedActiveRole,
} from './generator.ts'

export type { Color } from './color.ts'
export { computeContrastColor, measureContrast } from './contrast.ts'
export type { ColorSystem, HueEntry } from './generator.ts'

interface ActiveRoleEntry {
	/** Semantic name (e.g., 'fill', 'text', 'border'). */
	readonly name: string
	/**
	 * CSS selector for this role's active-color class.
	 * @default `.${name}`
	 */
	readonly selector?: string
	readonly passive?: false
	/**
	 * Which other roles this role generates contrast outputs for when active.
	 * Defaults to all other roles. Narrowing this skips CSS for unlikely
	 * pairings (e.g., a focus ring doesn't need contrast against icons).
	 * Duplicates are silently deduplicated.
	 */
	readonly contrastsWith?: readonly string[]
}

interface PassiveRoleEntry {
	/** Semantic name (e.g., 'focus', 'border'). */
	readonly name: string
	readonly passive: true
	/**
	 * Which active roles this passive role should appear as a contrast
	 * target for. Defaults to all active roles.
	 * Duplicates are silently deduplicated.
	 */
	readonly contrastsWith?: readonly string[]
}

export type RoleEntry = ActiveRoleEntry | PassiveRoleEntry

export interface ColorSetOptions {
	/**
	 * Property namespace. Prefixes all output properties.
	 * @default 'color'
	 */
	readonly name?: string
	/** Hue definitions. Each gets a selector setting gamut constants. */
	readonly hues: readonly HueEntry[]
	/** Color roles in this set. */
	readonly roles: readonly RoleEntry[]
	/**
	 * Disables automatic contrast polarity inversion.
	 * @default false
	 */
	readonly noContrastInversion?: boolean
}

type NonEmptyArray<T> = readonly [T, ...T[]]

export type DefineColorsOptions =
	| ColorSetOptions
	| { readonly sets: NonEmptyArray<ColorSetOptions> }

const LABEL_REGEX = /^[a-z][a-z0-9_-]*$/i

function validateLabel(label: string, context: string): void {
	if (!LABEL_REGEX.test(label)) {
		throw new Error(
			`Invalid ${context} '${label}'. Must start with a letter and contain only letters, numbers, hyphens, and underscores.`,
		)
	}
}

function validateUniqueLabels(labels: readonly string[], context: string): void {
	const seen = new Set<string>()
	for (const label of labels) {
		if (seen.has(label)) {
			throw new Error(`Duplicate ${context} '${label}'. Each must be unique.`)
		}
		seen.add(label)
	}
}

function validateContrastRefs(roles: readonly RoleEntry[], roleNameSet: Set<string>): void {
	for (const role of roles) {
		if (role.contrastsWith) {
			for (const ref of role.contrastsWith) {
				if (!roleNameSet.has(ref)) {
					throw new Error(`Role '${role.name}' references unknown role '${ref}' in contrastsWith.`)
				}
				if (ref === role.name) {
					throw new Error(`Role '${role.name}' must not reference itself in contrastsWith.`)
				}
			}
		}
	}
}

function validateRoles(roles: readonly RoleEntry[], roleNames: readonly string[]): void {
	const activeRoles = roles.filter((r) => !r.passive)
	const passiveRoles = roles.filter((r) => r.passive)

	if (activeRoles.length === 0) {
		throw new Error('At least one active role is required.')
	}

	for (const role of passiveRoles) {
		if ('selector' in role && role.selector !== undefined) {
			throw new Error(`Passive role '${role.name}' must not specify a selector.`)
		}
	}

	validateContrastRefs(roles, new Set(roleNames))
}

function buildPassiveAllowedMap(
	passiveRoles: readonly PassiveRoleEntry[],
): Map<string, Set<string> | null> {
	const map = new Map<string, Set<string> | null>()
	for (const role of passiveRoles) {
		map.set(role.name, role.contrastsWith ? new Set(role.contrastsWith) : null)
	}
	return map
}

function resolveActiveRole(
	role: ActiveRoleEntry,
	roleNames: readonly string[],
	passiveAllowedBy: Map<string, Set<string> | null>,
): ResolvedActiveRole {
	const selector = role.selector ?? `.${role.name}`
	let contrastTargets = role.contrastsWith
		? [...new Set(role.contrastsWith)]
		: roleNames.filter((n) => n !== role.name)

	contrastTargets = contrastTargets.filter((target) => {
		const allowed = passiveAllowedBy.get(target)
		if (allowed === undefined) {
			return true
		}
		if (allowed === null) {
			return true
		}
		return allowed.has(role.name)
	})

	return { name: role.name, selector, contrastTargets }
}

function resolveColorSet(options: ColorSetOptions): ColorsDefinition {
	const name = options.name ?? 'color'
	const noContrastInversion = options.noContrastInversion ?? false

	const hueNames = options.hues.map((h) => h.name)
	for (const hueName of hueNames) {
		validateLabel(hueName, 'hue name')
	}
	validateUniqueLabels(hueNames, 'hue name')

	const roleNames = options.roles.map((r) => r.name)
	for (const roleName of roleNames) {
		validateLabel(roleName, 'role name')
	}
	validateUniqueLabels(roleNames, 'role name')
	validateRoles(options.roles, roleNames)

	const activeRoles = options.roles.filter((r) => !r.passive) as ActiveRoleEntry[]
	const passiveRoles = options.roles.filter((r) => r.passive) as PassiveRoleEntry[]
	const passiveAllowedBy = buildPassiveAllowedMap(passiveRoles)

	return {
		name,
		hues: options.hues,
		activeRoles: activeRoles.map((role) => resolveActiveRole(role, roleNames, passiveAllowedBy)),
		noContrastInversion,
	}
}

/**
 * Define a multi-hue color system with APCA-based contrast roles.
 *
 * @example
 * ```ts
 * const system = defineColors({
 *   hues: [
 *     { name: 'red', hue: 25, selector: '.red' },
 *     { name: 'blue', hue: 240, selector: '.blue' },
 *   ],
 *   roles: [
 *     { name: 'fill' },
 *     { name: 'text' },
 *   ],
 * })
 * console.log(system.css) // Generated CSS string
 * ```
 */
export function defineColors(options: ColorSetOptions): ColorSystem
export function defineColors(options: {
	readonly sets: NonEmptyArray<ColorSetOptions>
}): NonEmptyArray<ColorSystem>
export function defineColors(
	options: DefineColorsOptions,
): ColorSystem | NonEmptyArray<ColorSystem> {
	if ('sets' in options) {
		return options.sets.map((set) =>
			generateColorsCss(resolveColorSet(set)),
		) as unknown as NonEmptyArray<ColorSystem>
	}
	return generateColorsCss(resolveColorSet(options))
}
