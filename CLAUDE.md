# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ok-apca is a TypeScript monorepo for generating static CSS that produces gamut-mapped OKLCH colors with APCA-based contrast colors. All computation happens at build time—the generated CSS runs without JavaScript.

## Architecture

This is a turborepo monorepo using pnpm workspaces with three packages:

### `@ok-apca/calc-tree`

A standalone expression tree library for building CSS `calc()` expressions. It provides:

- **Expression construction**: `add`, `subtract`, `multiply`, `divide`, `pow`, `signedPow`, `clamp`, `min`, `max`, `abs`, `sign`, `sin`
- **Color construction**: `oklch(l, c, h)` returns a `ColorExpression`
- **References**: String literals (e.g. `'lightness'`) used as function arguments become unbound variables tracked at the type level
- **Two expression types**:
  - `CalcExpression<Refs>` - numeric expressions that can be evaluated with `.solve()` or serialized to CSS
  - `ColorExpression<Refs>` - color expressions that can only be serialized to CSS (prevents misuse in arithmetic)
- **Binding API**: `.bind({ key1: value1, key2: value2 })` substitutes references
- **CSS output**: `.toCss()` returns `{ expression, declarations, toDeclarationBlock() }`
- **Property wrapping**: `.asProperty('name')` wraps expression as a CSS custom property

### `ok-apca`

The main library that uses `@ok-apca/calc-tree` to generate CSS for OKLCH colors with APCA contrast. Key modules:

- **`gamut.ts`** - Expression tree for gamut boundary:
  - `maxChroma` - tent function with sine-based curvature correction

- **`apca.ts`** - Expression trees for APCA contrast:
  - `contrastSolver` - solves for target Y given signed contrast value
  - `contrastSolverWithInversion` - solver with automatic polarity inversion
  - `contrastMeasurementNormal`, `contrastMeasurementReverse` - measure achieved contrast
  - `normalPolarity`, `reversePolarity` - polarity direction solvers
  - `softClampApprox`, `softUnclamp` - Lp-norm approximation of APCA soft black clamp

- **`generator.ts`** - Builds complete CSS from hue definitions:
  - Generates `@property` declarations for type-safe custom properties
  - Builds base color expressions with gamut mapping
  - Builds contrast color expressions using APCA polarity selection

- **`color.ts`** - Gamut boundary computation using colorjs.io:
  - `findGamutSlice(hue)` returns `{ apex: { lightness, chroma }, curvature }`

- **`contrast.ts`** - TypeScript runtime for contrast computation:
  - `measureContrast(baseColor, contrastColor)` - measure APCA contrast
  - `computeContrastColor(color, contrast, invert?)` - compute contrast color

- **`correction.ts`** - Y-to-L correction pipeline (OKLab polynomial)

- **`constants.ts`** - All shared constants (APCA, gamut, soft clamp)

- **`defineHue(options)`** - Main API entry point (in `index.ts`)

### `playground`

A Nuxt app for interactive testing and visualization.

## How It Works

1. Given a fixed hue, compute the Display P3 gamut boundary (L_apex, C_apex, curvature)
2. Build expression trees for gamut-mapped colors and APCA contrast solving
3. Serialize expressions to CSS with intermediate values as custom properties
4. Generated CSS accepts `--lightness` and `--chroma` as runtime inputs
5. Contrast colors accept `--contrast-{label}` inputs (-1.08 to 1.08)

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
- **Versioning**: Changesets

## Code Style

- Biome enforces strict linting rules (see `biome.json`)
- No default exports (except config files)
- Named exports only
- Tabs for indentation
- Single quotes for strings
- No semicolons (ASI)
- Use `.ts` extensions in all imports

## Workflow Rules

- After modifying `biome.json`, always run `pnpm check` before proceeding with other work to ensure all files are updated with the new rules/formatting
