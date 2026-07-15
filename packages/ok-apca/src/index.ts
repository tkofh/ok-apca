import { type ColorSetOptions, resolveColorSet } from './config.ts'
import { type ColorSystem, generateColorSystem } from './generator.ts'

export type { Color } from './color.ts'
export type { ColorSetOptions, HueEntry, RoleEntry } from './config.ts'
export { resolveColorSet } from './config.ts'
export { computeContrastColor, measureContrast } from './contrast.ts'
export type { ColorSystem } from './generator.ts'

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
 *
 * @returns A `ColorSystem`: the generated `css` string plus `hues` and `roles`
 * maps from each name to its selector.
 */
export function defineColors(options: ColorSetOptions): ColorSystem {
	return generateColorSystem(resolveColorSet(options))
}
