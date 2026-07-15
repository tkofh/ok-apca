# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project

ok-apca is a TypeScript monorepo for generating static CSS that produces gamut-mapped OKLCH colors with APCA-based contrast colors. All computation happens at build time—the generated CSS runs without JavaScript.

## Architecture

This is a turborepo monorepo using pnpm workspaces with three packages:

### `@ok-apca/calc-tree`

A standalone expression tree library for building CSS `calc()` expressions. Organized into three namespaces with expressions as opaque data types:

- **`Calc` namespace** — math constructors and expression operations:
  - Constructors: `add`, `subtract`, `multiply`, `divide`, `pow`, `signedPow`, `clamp`, `min`, `max`, `abs`, `sign`, `sin`, `lerp`
  - Operations: `Calc.bind(expr, bindings)`, `Calc.solve(expr, bindings?)`, `Calc.serialize(expr, bindings?)`
  - References: String literals (e.g. `'lightness'`) become unbound variables tracked at the type level
- **`Colors` namespace** — color expression constructors:
  - `Colors.oklch(l, c, h)` returns a `ColorExpression`
  - `Colors.bind(expr, bindings)`, `Colors.serialize(expr, bindings?)`
- **`Properties` namespace** — CSS `@property` rule generation:
  - `Properties.number(name)` — declare numeric input property (returns expression)
  - `Properties.number(name, expr)` — declare computed numeric property (registers rule + declaration)
  - `Properties.color(name, expr)` — declare computed color property
  - The `_` prefix convention determines `inherits`: names starting with `_` get `inherits: false`, others get `inherits: true`
- **Two opaque expression types** (interfaces with `@internal` fields, phantom `Refs` type parameter):
  - `NumberExpression<Refs>` — numeric expressions
  - `ColorExpression<Refs>` — color expressions (prevents misuse in arithmetic)
- **File structure**: `calc.ts` (Calc namespace), `colors.ts` (Colors namespace), `expression.ts` (types + factories), `properties.ts` (Properties namespace), `nodes.ts` (AST internals)

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

- **`generator.ts`** - Builds complete CSS from role definitions using `Properties` namespace:
  - Creates a parent `Properties` for shared `@property` rules
  - Per active role: creates a child `Properties` with namespaced gamut inputs, base color, Y_bg, and contrast targets
  - Hue selectors use `:is(&, & *):is(.role1, .role2)` nesting to assign gamut constants directly to role elements

- **`color.ts`** - Gamut boundary computation using colorjs.io:
  - `findGamutSlice(hue)` returns `{ apex: { lightness, chroma }, curvature }`

- **`contrast.ts`** - TypeScript runtime for contrast computation:
  - `measureContrast(baseColor, contrastColor)` - measure APCA contrast between role colors
  - `computeContrastColor(color, contrast, invert?)` - compute contrast color relative to an anchor role

- **`index.ts`** - Main API entry point:
  - `defineColors(options)` - accepts `ColorSetOptions` (single set) or `{ sets }` (multiple sets)
  - `ColorSetOptions`: `name` (property namespace), `hues`, `roles` (array of `ActiveRoleEntry | PassiveRoleEntry`), `noContrastInversion`
  - Active roles get a CSS selector (default `.{name}`), passive roles are contrast-only targets
  - `contrastsWith` on roles filters which contrast pairs are generated
  - Validates role names, uniqueness, contrastsWith references, at least one active role

### `playground`

A Nuxt app for interactive testing and visualization.

## How It Works

1. Given a fixed hue, compute the Display P3 gamut boundary (L_apex, C_apex, curvature)
2. For each active role, build expression trees for the active color and its contrast targets
3. Serialize per-role expressions to CSS with intermediate values as `@property` declarations
4. Each active role gets a selector block; hue selectors use `:is()` nesting to set gamut constants on role elements
5. Runtime inputs: `--lightness` (0–1), `--chroma` (0–1), `--contrast-{role}` (-1.08 to 1.08)
6. Outputs: `--{name}-{role}` color properties (e.g., `--color-fill`, `--color-text`)

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

## Documentation

**Declared reader (for code comments).** A contributor working on ok-apca's internals — the expression trees, solvers, and generator. They know TypeScript, CSS custom properties, and the general shape of APCA (Lc contrast, relative luminance Y, polarity). They are competent with math but new to seeing it expressed through `@ok-apca/calc-tree`'s expression trees, and they do not arrive knowing *why* an expression is shaped the way it is — above all, why one references a variable once instead of twice.

- **Gloss** the rationale behind expression shape: reference-count minimization, single-reference approximations (the Lp-norm soft clamp, the `sin()` curvature basis), and any constant whose value isn't self-evident. The DevTools fully-substituted-expansion constraint (see [CSS Expression Size Constraint](#css-expression-size-constraint)) is the reason most shape choices exist; name it where it drove a choice. Gloss a calc-tree idiom on first encounter in a module.
- **Assume** TypeScript, CSS custom properties and `@property`, OKLCH, and APCA fundamentals. Don't re-explain what APCA contrast is or what luminance means.

## Workflow Rules

- After modifying `biome.json`, always run `pnpm check` before proceeding with other work to ensure all files are updated with the new rules/formatting
