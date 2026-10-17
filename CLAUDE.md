# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ok-apca is a TypeScript monorepo for generating static CSS that produces gamut-mapped OKLCH colors with APCA-based contrast colors. All computation happens at build time—the generated CSS runs without JavaScript.

## Architecture

This is a turborepo monorepo using pnpm workspaces with two packages. Expression trees and CSS emission come from the external [`fashionable`](https://www.npmjs.com/package/fashionable) library (previously an in-repo `@ok-apca/calc-tree` package, removed once fashionable replaced it).

### `fashionable` (external dependency)

Imported by subpath, one namespace per module. The pieces ok-apca uses:

- **`fashionable/calc`** — `Calc` namespace. Math constructors (`add`, `subtract`, `multiply`, `divide`, `pow`, `clamp`, `min`, `max`, `abs`, `sign`, `sin`, `lerp`), `Calc.var(nameOrHandle)` to read a custom property, `Calc.bind(expr, bindings)` to substitute reads with other expressions, and `Calc.solve(expr, { bindings })` to evaluate numerically at build time. Unbound reads are tracked in the `Calc.Calc<Reads>` phantom type; `util.ts` exports `Reads<'a' | 'b'>` as shorthand for the `Var.Var<'a'> | Var.Var<'b'>` union it expects.
- **`fashionable/var`** — `Var.number(name)` / `Var.color(name)` make typed property handles. One handle is shared by the `@property` rule, every declaration writing it, and every `Calc.var` reading it; that is what keeps a computed-property chain in sync.
- **`fashionable/property`** — `PropertyRule.make(handle, initial)` registers an `@property` (defaults to `inherits: false`); `PropertyRule.inheritable` opts in to inheritance.
- **`fashionable/declaration`**, **`fashionable/rule`**, **`fashionable/selector`**, **`fashionable/stylesheet`** — `Declaration.make(handle, expr)`, `StyleRule.make(selector, RuleSet.make(...decls))`, selector combinators (`Selector.class`, `Selector.is`, `Selector.and`, `Selector.nest`, `Selector.descendant`, `Selector.universal`), and `Stylesheet.make`/`Stylesheet.render`.
- **`fashionable/data`** — `Color.oklch(l, c, h)` builds a color value from numeric expressions.

Unlike calc-tree, `Calc` has no side effects: nothing in the value layer registers an `@property` or hoists a declaration. Intermediate computed properties are therefore threaded explicitly through a collector callback (see `contrast.ts` and `generator.ts`).

### `ok-apca`

The main library. Key modules:

- **`gamut.ts`** — gamut boundary:
  - `computeGamutSlice(hue)` (cached) returns a `GamutSlice`: `apexL`, `apexC`, `tentK` (sine-basis curvature correction), the pre-scaled Y-correction coefficients `fA`/`fB`/`fD`, and a `maxChroma` expression pre-bound to the slice for the TypeScript runtime
  - `maxChromaExpr` — tent function with sine-based curvature correction, reading `lightness`, `apexL`, `apexC`, `tentK`
  - `gamutMap(color)` — runtime chroma clamp to the P3 boundary

- **`apca.ts`** — expression trees for APCA contrast, all with unbound reads:
  - `contrastSolver` — selects the target Y given signed contrast, the `invertable` flag, both polarity solutions, and their measured contrasts
  - `normalPolarity`, `reversePolarity` — polarity direction solvers
  - `contrastMeasurementNormal`, `contrastMeasurementReverse` — measure achieved contrast
  - `trueSoftClamp`, `softClampApprox`, `softUnclamp` — APCA soft black clamp and its single-reference Lp-norm approximation

- **`contrast.ts`** — shared by the CSS generator and the TypeScript runtime:
  - `yBackground` — CIE Y from OKLCH lightness and chroma ratio via the `fA`/`fB`/`fD` correction polynomial
  - `contrastTargetLightness(label?, collect?)` — builds the contrast-target lightness chain. Called with no arguments it returns one inlined expression for the runtime to solve; called with a `label` and a `ComputedPropertyCollector` it registers each intermediate (`_ylr`, `_ydr`, `_yl`, `_yd`, `_lcl`, `_lcd`, `_yt`, `_cl`) as a `{name}-{label}` property and returns a bare read of the last one
  - `measureContrast(background, foreground, options?)` and `computeContrastColor(color, contrast, invert?)` — runtime equivalents of what the CSS computes

- **`generator.ts`** — assembles the stylesheet:
  - `PropertyRegistry` — hands out `Var` handles and registers each `@property` once; the `_` prefix convention sets `inherits: false`, everything else is inheritable
  - `makeGamutInputs` — one handle per hue-dependent constant (`_{prefix}-hue`, `-apexL`, `-apexC`, `-tentK`, `-fA`, `-fB`, `-fD`); role rules read them, hue rules write them
  - `buildRoleRule` — one `StyleRule` per active role: max chroma, base color, then per contrast target the lightness chain and its gamut-mapped color. Its `computeNumber` closure is the collector that registers an intermediate, emits its declaration, and returns a `Calc.var` read
  - `buildHueRule` — `.{hueClass} { :is(&, & *):is(.role1, .role2) { …constants } }`, writing the slice constants directly onto role elements so role properties can stay `inherits: false`
  - `generateColorSystem(definition)` — registers inputs/outputs, builds all rules, renders one `Stylesheet`, returns `{ css, hues, roles }`

- **`config.ts`** — option types and validation:
  - `ColorSetOptions`: `prefix` (default `'color'`), `hues` (`HueEntry | HueEntry[]`), `roles` (`RoleEntry | RoleEntry[]`)
  - `HueEntry`: `{ hue, name?, className? }`; `RoleEntry`: `{ name, className?, contrastsWith?, passive? }`
  - `className` is a plain class name without the dot (defaults to `name`). Classes are the only selector shape until fashionable can parse selector text, and class names are validated because `Selector.class` would otherwise interpolate arbitrary text
  - `resolveColorSet(options)` validates names, uniqueness, class names, `contrastsWith` references, and the at-least-one-active-role rule, then normalizes hues into `[0, 360)`

- **`color.ts`** — `Color` type plus colorjs.io helpers: `createColor` (clamps), `getLuminance`, `inP3`

- **`index.ts`** — public entry: `defineColors(options)` = `generateColorSystem(resolveColorSet(options))`, plus re-exports of `resolveColorSet`, `measureContrast`, `computeContrastColor`, and the option/result types

Tests live in `test/unit` (node) and `test/integration` (Chromium via Playwright, renders the generated CSS and reads back computed colors).

### `playground`

A Nuxt app for interactive testing and visualization.

## How It Works

1. Given a fixed hue, compute the Display P3 gamut boundary (L_apex, C_apex, curvature)
2. For each active role, build expression trees for the active color and its contrast targets
3. Register each intermediate as an `@property` and reference it by name, so downstream expressions carry a single `var()`
4. Each active role gets a selector block; hue selectors use `:is()` nesting to set gamut constants on role elements
5. Runtime inputs: `--lightness` (0–1), `--chroma` (0–1), `--contrast-{role}` (-1.08 to 1.08)
6. Outputs: `--{prefix}-{role}` color properties (e.g., `--color-fill`, `--color-text`)

## CSS Expression Size Constraint

The generated CSS uses deeply nested `calc()` expressions with `@property` declarations for intermediate values. While `@property` with `syntax: '<number>'` causes the browser to resolve each property's value at compute time (so runtime performance is fine), **Chrome DevTools does not inline `@property` values**. When a developer inspects an element, DevTools recursively substitutes every `var()` reference with the referenced property's full expression. This means the expression DevTools must render grows exponentially with each level of nesting.

### The metric that matters: fully-substituted expression size

The critical metric is the **total size of the expression after all `var()` references are recursively replaced with their definitions**. This is the string that DevTools actually renders, and it is the only metric that matters when evaluating whether an expression tree change improves or worsens the DevTools situation. This is NOT about:

- Character length of a single CSS declaration
- Number of `var()` references in a single declaration
- Number of intermediate `@property` declarations

It IS about the total size of the expression after recursively replacing every `var()` with its definition, all the way down to the leaf inputs. Adding intermediate properties does NOT help — DevTools expands through them. Reducing literal reference count in one declaration doesn't help if the references just moved into a sub-property that gets expanded anyway.

### How expansion compounds

If property A references `var(--x)` 3 times, and `--x` itself references `var(--lightness)` 5 times, then the fully-expanded A contains `--lightness` 15 times (3 × 5). Each additional layer multiplies. A sufficiently large fully-expanded expression will crash the DevTools panel or the browser tab entirely.

### Practical implications

When modifying expression trees:

- **Reducing references to a variable in an expression matters** only if that variable's own expansion is large
- **Adding an intermediate property never reduces the fully-expanded size** — it's purely organizational
- **The only way to shrink the fully-expanded tree** is to reduce the number of times large sub-expressions are referenced, or to use approximations that express the same computation with fewer variable references
- **Single-reference approximations** (like the Lp-norm soft clamp) are valuable specifically because they reference the input once instead of twice, halving the expansion at that level

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm typecheck        # Type check all packages
pnpm check            # Lint with biome (auto-fixes)
pnpm check:force      # Lint with unsafe auto-fixes
pnpm check:report     # Lint without writing changes
pnpm format           # Format code
pnpm changeset        # Create a changeset
pnpm changeset:version   # Apply changesets and bump versions
pnpm changeset:publish   # Build and publish packages
```

## Tech Stack

- **Package Manager**: pnpm with workspaces
- **Monorepo**: Turborepo
- **Linting/Formatting**: Biome (aggressive config)
- **Testing**: Vitest (unit + browser tests via Playwright)
- **Building**: tsdown
- **Color Math**: colorjs.io
- **CSS Expression Trees / Emission**: fashionable
- **Versioning**: Changesets

## Code Style

- Biome enforces strict linting rules (see `biome.json`)
- No default exports (except config files)
- Named exports only
- Tabs for indentation
- Single quotes for strings
- No semicolons (ASI)
- Use `.ts` extensions in all imports

## Documentation

**Declared reader (for code comments).** A contributor working on ok-apca's internals — the expression trees, solvers, and generator. They know TypeScript, CSS custom properties, and the general shape of APCA (Lc contrast, relative luminance Y, polarity). They are competent with math but new to seeing it expressed through fashionable's `Calc` expression trees, and they do not arrive knowing *why* an expression is shaped the way it is — above all, why one references a variable once instead of twice.

- **Gloss** the rationale behind expression shape: reference-count minimization, single-reference approximations (the Lp-norm soft clamp, the `sin()` curvature basis), and any constant whose value isn't self-evident. The DevTools fully-substituted-expansion constraint (see [CSS Expression Size Constraint](#css-expression-size-constraint)) is the reason most shape choices exist; name it where it drove a choice. Gloss a fashionable idiom (shared `Var` handles, `Calc.bind`, the collector pattern) on first encounter in a module.
- **Assume** TypeScript, CSS custom properties and `@property`, OKLCH, and APCA fundamentals. Don't re-explain what APCA contrast is or what luminance means.

## Workflow Rules

- After modifying `biome.json`, always run `pnpm check` before proceeding with other work to ensure all files are updated with the new rules/formatting
