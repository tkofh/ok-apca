import { Calc } from 'fashionable/calc'
import {
	APCA_BG_EXP_NORMAL,
	APCA_BG_EXP_REVERSE,
	APCA_FG_EXP_NORMAL,
	APCA_FG_EXP_REVERSE,
	APCA_OFFSET,
	APCA_SCALE,
	contrastMeasurementNormal,
	contrastMeasurementReverse,
	contrastSolver,
	normalPolarity,
	reversePolarity,
	softClampApprox,
	softUnclamp,
	trueSoftClamp,
} from './apca.ts'
import { type Color, createColor, getLuminance } from './color.ts'
import { computeGamutSlice, gamutMap } from './gamut.ts'
import { clampNumber, type Reads } from './util.ts'

/**
 * Y-correction polynomial: 1 + fA*chroma + fB*chroma^2 + fD*chroma^3
 *
 * Converts between OKLCH lightness and CIE Y using pre-scaled coefficients.
 * fA, fB, fD are hue-dependent and incorporate the gamut boundary slope
 * (apexC/apexL), so chroma here is the normalized ratio (0–1).
 */
const fCorrection: Calc.Calc<Reads<'chroma' | 'fA' | 'fB' | 'fD'>> = Calc.add(
	1,
	Calc.multiply(Calc.var('fA'), Calc.var('chroma')),
	Calc.multiply(Calc.var('fB'), Calc.pow(Calc.var('chroma'), 2)),
	Calc.multiply(Calc.var('fD'), Calc.pow(Calc.var('chroma'), 3)),
)

/**
 * Y background: L^3 * f(chroma)
 *
 * Computes CIE Y luminance from OKLCH lightness and chroma ratio.
 * Exact on the left half of the gamut tent, where k = (apexC/apexL) * chromaRatio
 * is constant. On the right half it's a close approximation.
 */
export const yBackground: Calc.Calc<Reads<'lightness' | 'chroma' | 'fA' | 'fB' | 'fD'>> =
	Calc.multiply(Calc.pow(Calc.var('lightness'), 3), fCorrection)

/**
 * Corrected lightness from target Y: L = pow(Y / f(chroma), 1/3)
 *
 * Applies the inverse Y-correction to recover OKLCH lightness from CIE Y.
 * Uses the same f-correction polynomial as yBackground, depending only on
 * the input chroma ratio (a leaf variable), not the solver output.
 */
const correctedLightness: Calc.Calc<Reads<'yTarget' | 'chroma' | 'fA' | 'fB' | 'fD'>> = Calc.pow(
	Calc.divide(Calc.var('yTarget'), fCorrection),
	1 / 3,
)

/**
 * Records an intermediate as a computed property and hands back a reference to
 * it. The generator supplies this: it registers the `@property` rule, binds the
 * hue/role-scoped leaf inputs into `expr`, emits the block declaration, and
 * returns a bare `Calc.var(name)`.
 *
 * calc-tree fused "declare an `@property` and read it back" into a single
 * expression node that hoisted its own declaration at serialization time.
 * fashionable keeps the value layer (`Calc`) free of that side effect, so the
 * intermediate chain is threaded through a collector instead. The read it
 * returns (a bare `Calc.var(name)`) is what keeps each intermediate a single
 * `var()` in the fully-substituted tree DevTools renders — the read stands in
 * for the whole sub-expression (see the DevTools expansion constraint in
 * CLAUDE.md).
 */
export type ComputedPropertyCollector = (name: string, expr: Calc.Calc) => Calc.Calc

/**
 * Build contrast target lightness expression with optional polarity inversion.
 *
 * Computes both polarity solutions, measures achieved contrast for each,
 * and selects based on the `{label}-invertable` read:
 * - `1`: picks whichever direction achieves higher contrast
 * - `0`: always follows the contrast sign (no inversion)
 *
 * Uses two distinct Y_bg reads:
 * - `scYBg`: soft-clamped Y_bg for the polarity solvers (operates in clamped domain)
 * - `yBg`: original Y_bg for contrast measurement and zero-contrast fallback
 *
 * With no `label`, the whole chain is inlined into one expression whose unbound
 * reads are `yBg`, `scYBg`, `invertable`, `contrast`, `chroma`, `fA`, `fB`, `fD`
 * — the runtime path (`computeContrastColor`) binds and solves it directly.
 *
 * With a `label` and a `collect`or, each intermediate (`_ylr`, `_ydr`, `_yl`,
 * `_yd`, `_lcl`, `_lcd`, `_yt`, `_cl`) is registered as a `{name}-{label}`
 * computed property and referenced by name, so the emitted CSS names each Y
 * value once. The returned expression is just the final `_cl-{label}`
 * reference; its dependencies live in the declarations `collect` recorded.
 */
export function contrastTargetLightness(): Calc.Calc<
	Reads<'yBg' | 'chroma' | 'fA' | 'fB' | 'fD' | 'scYBg' | 'invertable' | 'contrast'>
>
export function contrastTargetLightness<const Label extends string>(
	label: Label,
	collect: ComputedPropertyCollector,
): Calc.Calc
export function contrastTargetLightness(
	label?: string,
	collect?: ComputedPropertyCollector,
): Calc.Calc {
	const prop = (name: string, expr: Calc.Calc): Calc.Calc =>
		label !== undefined && collect !== undefined ? collect(`${name}-${label}`, expr) : expr

	const contrast = Calc.var(label !== undefined ? `contrast-${label}` : 'contrast')
	const invertable = Calc.var(label !== undefined ? `${label}-invertable` : 'invertable')

	// Raw solver outputs in soft-clamped domain
	const yLightRaw = prop(
		'_ylr',
		Calc.clamp(0, Calc.bind(reversePolarity, { yBg: Calc.var('scYBg'), contrast }), 1),
	)
	const yDarkRaw = prop(
		'_ydr',
		Calc.clamp(0, Calc.bind(normalPolarity, { yBg: Calc.var('scYBg'), contrast }), 1),
	)

	// Unclamp to recover actual Y values
	const yLight = prop('_yl', Calc.bind(softUnclamp, { y: yLightRaw }))
	const yDark = prop('_yd', Calc.bind(softUnclamp, { y: yDarkRaw }))

	// Solver uses original Y_bg for zero-contrast fallback
	const yTarget = prop(
		'_yt',
		Calc.bind(contrastSolver, {
			contrast,
			invertable,
			yLight,
			yDark,
			yLightRaw,
			yDarkRaw,
			lcLight: prop('_lcl', Calc.bind(contrastMeasurementReverse, { yFg: yLight })),
			lcDark: prop('_lcd', Calc.bind(contrastMeasurementNormal, { yFg: yDark })),
		}),
	)

	return prop('_cl', Calc.bind(correctedLightness, { yTarget }))
}

/**
 * Measure APCA contrast between a background and a foreground color.
 *
 * Returns a signed Lc value (Lc / 100): positive = dark-on-light (background
 * lighter than foreground), negative = light-on-dark. Range about -1.08 to 1.06.
 * Returns 0 when the colors are equal or either luminance falls outside APCA's
 * usable range.
 *
 * Defaults to the true APCA soft black clamp for reference-grade values. Pass
 * `approximate: true` for the Lp-norm approximation the generated CSS uses, to
 * get numbers that match the stylesheet.
 *
 * @param baseColor - The background color.
 * @param contrastColor - The foreground color measured against it.
 * @param options - `approximate` swaps exact APCA for the CSS-matching approximation.
 *
 * @example
 * ```ts
 * // white background, black foreground: dark-on-light, so positive
 * measureContrast({ lightness: 1, chroma: 0, hue: 0 }, { lightness: 0, chroma: 0, hue: 0 }) // ~1.0604
 * ```
 */
export function measureContrast(
	baseColor: Color,
	contrastColor: Color,
	{ approximate = false }: { approximate?: boolean } = {},
): number {
	const base = createColor(baseColor)
	const fg = createColor(contrastColor)
	const yBg = getLuminance(base)
	const yFg = getLuminance(fg)

	if (
		!(Number.isFinite(yFg) && Number.isFinite(yBg)) ||
		Math.min(yFg, yBg) < 0 ||
		Math.max(yFg, yBg) > 1.1
	) {
		return 0
	}

	if (approximate) {
		// Use expression trees directly to ensure alignment with the CSS implementation
		if (yBg >= yFg) {
			return Calc.solve(contrastMeasurementNormal, { bindings: { yBg, yFg } })
		}
		return -Calc.solve(contrastMeasurementReverse, { bindings: { yBg, yFg } })
	}

	const scBg = Calc.solve(trueSoftClamp, { bindings: { y: yBg } })
	const scFg = Calc.solve(trueSoftClamp, { bindings: { y: yFg } })

	if (yBg >= yFg) {
		return Math.max(
			0,
			APCA_SCALE * (scBg ** APCA_BG_EXP_NORMAL - scFg ** APCA_FG_EXP_NORMAL) - APCA_OFFSET,
		)
	}
	return -Math.max(
		0,
		APCA_SCALE * (scFg ** APCA_FG_EXP_REVERSE - scBg ** APCA_BG_EXP_REVERSE) - APCA_OFFSET,
	)
}

/**
 * Compute a color that hits a target APCA contrast against an anchor color.
 *
 * Positive `contrast` returns a lighter color, negative a darker one. This is the
 * CSS input convention, the opposite sign from what measureContrast reports. The
 * result keeps the anchor's hue and reuses its chroma ratio at the new lightness.
 *
 * @param color - The anchor color. Clamped to the Display P3 boundary before solving.
 * @param contrast - Signed target, Lc / 100, clamped to -1.08..1.08.
 * @param invert - Allow polarity inversion when the requested direction can't reach
 *   the target (default true). Pass false to always follow the sign, saturating at
 *   white or black.
 * @returns A gamut-mapped OKLCH color at the same hue as `color`.
 *
 * @example
 * ```ts
 * const fill = { lightness: 0.25, chroma: 0.08, hue: 250 }
 * const text = computeContrastColor(fill, 0.75) // lighter, same hue
 * measureContrast(fill, text) // ~ -0.76: a positive request measures negative
 * ```
 *
 * Shares the expression trees the CSS generator uses, so results match the stylesheet.
 */
export function computeContrastColor(color: Color, contrast: number, invert = true): Color {
	const { hue, lightness, chroma } = gamutMap(color)
	const slice = computeGamutSlice(hue)
	const maxChromaAtBase = Calc.solve(slice.maxChroma, { bindings: { lightness } })
	const chromaRatio = maxChromaAtBase > 0 ? clampNumber(0, chroma / maxChromaAtBase, 1) : 0

	const clampedContrast = clampNumber(-1.08, contrast, 1.08)
	// Hoisted rather than inlined into the solve call: bind's data-last
	// overload makes TypeScript defer an inline bind call's inference, and
	// solve's conditional options type then fixes Vars/R at their constraints
	// (see fashionable's docs/solve-inference.md). Hoisting sidesteps both.
	const boundLightness = Calc.bind(
		Calc.bind(contrastTargetLightness(), {
			yBg: yBackground,
			scYBg: Calc.bind(softClampApprox, { y: yBackground }),
		}),
		slice,
	)
	const targetLightness = clampNumber(
		0,
		Calc.solve(boundLightness, {
			bindings: {
				lightness,
				chroma: chromaRatio,
				invertable: invert ? 1 : 0,
				contrast: clampedContrast,
			},
		}),
		1,
	)

	return createColor({
		lightness: targetLightness,
		chroma: Calc.solve(slice.maxChroma, { bindings: { lightness: targetLightness } }) * chromaRatio,
		hue,
	})
}
