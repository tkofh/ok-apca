# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ok-apca is a TypeScript monorepo for generating static CSS that produces gamut-mapped OKLCH colors with APCA-based contrast colors. All computation happens at build time—the generated CSS runs without JavaScript.

## Architecture

This is a turborepo monorepo using pnpm workspaces with three packages:

### `@ok-apca/calc-tree`

A standalone expression tree library for building CSS `calc()` expressions. It provides:

- **Expression construction**: `add`, `subtract`, `multiply`, `divide`, `power`, `clamp`, `min`, `max`, `abs`, `sign`, `sin`
- **Color construction**: `oklch(l, c, h)` returns a `ColorExpression`
- **References**: `reference('name')` creates unbound variables tracked at the type level
- **Two expression types**:
  - `CalcExpression<Refs>` - numeric expressions that can be evaluated with `toNumber()` or serialized to CSS
  - `ColorExpression<Refs>` - color expressions that can only be serialized to CSS (prevents misuse in arithmetic)
- **Binding API**: `.bind('key', value)` or `.bind({ key1: value1, key2: value2 })` substitutes references
- **CSS output**: `.toCss()` returns `{ expression, declarations, toDeclarationBlock() }`
- **Property wrapping**: `.asProperty('--name')` wraps expression as a CSS custom property

### `ok-apca`

The main library that uses `@ok-apca/calc-tree` to generate CSS for OKLCH colors with APCA contrast. Key modules:

- **`expressions.ts`** - Expression trees for gamut mapping and APCA contrast solving:
  - `createMaxChromaExpr(slice)` - tent function with sine-based curvature correction
  - `createContrastSolver()` - solves for target Y given signed contrast value
  - `createYFromLightness()` / `createLightnessFromY()` - L³ ↔ Y conversion

- **`generator.ts`** - Builds complete CSS from hue definitions:
  - Generates `@property` declarations for type-safe custom properties
  - Builds base color expressions with gamut mapping
  - Builds contrast color expressions using APCA polarity selection

- **`color.ts`** - Gamut boundary computation using colorjs.io:
  - `findGamutSlice(hue)` returns `{ apex: { lightness, chroma }, curvature }`

- **`defineHue(options)`** - Main API entry point

### `playground`

A Nuxt app for interactive testing and visualization.

## How It Works

1. Given a fixed hue, compute the sRGB gamut boundary (L_max, C_peak, curvature)
2. Build expression trees for gamut-mapped colors and APCA contrast solving
3. Serialize expressions to CSS with intermediate values as custom properties
4. Generated CSS accepts `--lightness` and `--chroma` as runtime inputs
5. Contrast colors accept `--contrast-{label}` inputs (-108 to 108)

## Development Commands

```bash
pnpm install          # Install dependencies
pnpm build            # Build all packages
pnpm test             # Run tests
pnpm typecheck        # Type check all packages
pnpm check            # Lint with biome
pnpm check:fix        # Auto-fix lint issues
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

- After modifying `biome.json`, always run `pnpm check:fix` before proceeding with other work to ensure all files are updated with the new rules/formatting
