/**
 * ok-apca - OKLCH color utilities with APCA-based contrast
 *
 * This library provides tools for working with OKLCH colors and generating
 * CSS that computes APCA-compliant contrast colors at runtime.
 *
 * @example
 * ```ts
 * import { generateColorCss, gamutMap, applyContrast, measureContrast } from 'ok-apca'
 *
 * // Generate CSS for a hue with contrast support
 * const css = generateColorCss({
 *   hue: 30,
 *   selector: '.orange',
 *   contrast: { mode: 'prefer-dark' }
 * })
 *
 * // Programmatically compute contrast colors
 * const base = { hue: 30, chroma: 0.15, lightness: 0.6 }
 * const contrast = applyContrast(base, 60, 'prefer-dark')
 * const actualLc = measureContrast(gamutMap(base), contrast)
 * ```
 */

export type { Color } from './color.ts'
export { gamutMap } from './color.ts'
export { applyContrast } from './contrast.ts'
export { generateColorCss } from './generator.ts'
export type { HeuristicCoefficients, HeuristicFitResult } from './heuristic.ts'
export { clearHeuristicCache, fitHeuristicCoefficients } from './heuristic.ts'
export { measureContrast } from './measure.ts'
export type {
	ColorGeneratorOptions,
	ContrastMode,
	ContrastOptions,
	GamutBoundary,
} from './types.ts'
