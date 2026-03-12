# RFC: calc-tree namespace & functional API cleanup

## Status

Draft

## Summary

Reorganize `@ok-apca/calc-tree` around three namespaces — `Calc`, `Colors`, `Properties` — and replace class methods (`.bind()`, `.solve()`, `.serialize()`) with standalone functions. Expressions become opaque data types with `@internal` fields, matching the pattern established by `PropertySet`.

## Motivation

The previous RFC (now implemented) introduced the `Properties` namespace with a clean functional API and opaque `PropertySet` type. The rest of calc-tree hasn't caught up:

1. **No namespace for math.** Consumers import `* as ct` and call `ct.add`, `ct.multiply`, etc. — but the flat export mixes math constructors (`add`, `sin`), color construction (`oklch`), types (`NumberExpression`, `ExpressionInput`), and a formatting utility (`formatNumber`). Namespaces would make the API self-documenting: `Calc.add`, `Colors.oklch`, `Properties.make`.

2. **Mixed paradigms.** Expression construction is functional (`add(a, b)`), but expression operations are class methods (`expr.bind(...)`, `expr.solve(...)`, `expr.serialize(...)`). The `Properties` namespace proved that the functional style works well — `bind`, `solve`, and `serialize` should follow suit.

3. **Murky file organization.** `constructors.ts` ↔ `expression.ts` have a circular import: constructors create expressions, expressions import `toExpression` for bind/solve. `nodes.ts` is cleanly internal, but the boundary between "constructor" and "expression operation" is blurry. The circular dependency makes it hard to understand the data flow.

4. **Expressions are classes but act like data.** `NumberExpression` and `ColorExpression` are immutable — every operation returns a new instance. They carry two fields (`node`, `refs`) that are only accessed by the library internals. Making them opaque data types (like `PropertySet`) with `@internal` fields is more honest about the API contract.

## Design

### Three namespaces

```ts
import { Calc, Colors, Properties } from '@ok-apca/calc-tree'
import type { NumberExpression } from '@ok-apca/calc-tree'

// Math — all numeric expression constructors
const x = Calc.add('a', Calc.multiply('b', 2))
const clamped = Calc.clamp(0, x, 1)

// Expression operations — bind, solve, serialize
const bound = Calc.bind(x, { a: 0.5 })
const value = Calc.solve(bound, { b: 3 })
const css = Calc.serialize(clamped)

// Input type — replaces ExpressionInput
function scale(input: Calc.Input<'factor'>): NumberExpression<'factor'> {
  return Calc.multiply(input, 2)
}

// Colors — oklch constructor + its own bind/serialize
const color = Colors.oklch(0.7, 0.15, 240)
const colorCss = Colors.serialize(color)

// Properties — unchanged from current API
const set = Properties.make()
const lightness = Properties.number(set, 'lightness')
```

### `Calc` namespace

Contains all numeric expression constructors, expression operations for `NumberExpression`, and the `Input` type alias.

**Constructors** (existing, just moved under namespace):
- `add`, `subtract`, `multiply`, `divide`
- `pow`, `signedPow`
- `sin`, `abs`, `sign`
- `clamp`, `min`, `max`
- `lerp`

**Expression operations** for `NumberExpression` (currently class methods, become standalone):
- `bind(expr, bindings)` — substitute references, returns `NumberExpression`
- `solve(expr, bindings?)` — evaluate to number
- `serialize(expr, bindings?)` — produce CSS string

**Types:**
- `Input<Refs>` — union of `NumberExpression<Refs> | number | string` (renamed from `ExpressionInput`). Consumers use `Calc.Input` where they'd use `ExpressionInput` today.
- `InferRefs<T>` — type utility to extract reference variables from an `Input`

**Utilities:**
- `formatNumber(n)` — number formatting (π detection, trailing zeros)

### `Colors` namespace

Contains `oklch` and expression operations for `ColorExpression`.

```ts
export function oklch<L, C, H>(lightness: L, chroma: C, hue: H): ColorExpression<...>
```

Pluralized to `Colors` to avoid conflicts with a `Color` interface in consuming modules.

**Expression operations** for `ColorExpression`:
- `Colors.bind(expr, bindings)` — substitute references, returns `ColorExpression`
- `Colors.serialize(expr, bindings?)` — produce CSS string

`Colors` does not have `solve` — color expressions cannot be evaluated to a number. Each namespace owns the operations for its expression type, so there's no shared `Expr` namespace or method duplication concern.

### Opaque expression types

Expressions become interfaces with `@internal` fields, matching `PropertySet`:

```ts
export interface NumberExpression<Refs extends string = never> {
  /** @internal */ readonly _node: ExpressionNode
  /** @internal */ readonly _refs: ReadonlySet<string>
  /** @internal */ readonly _brand: 'NumberExpression'
}

export interface ColorExpression<Refs extends string = never> {
  /** @internal */ readonly _node: ExpressionNode
  /** @internal */ readonly _refs: ReadonlySet<string>
  /** @internal */ readonly _brand: 'ColorExpression'
}
```

The `_brand` field distinguishes the two types at the type level and prevents accidental interchange. Internally, creation uses plain object literals (or a factory function) — no classes needed.

### File reorganization

Current:
```
constructors.ts  ← math constructors + oklch + toExpression/constant/reference
expression.ts    ← BaseExpression/NumberExpression/ColorExpression classes (methods: bind, solve, serialize)
nodes.ts         ← internal AST node classes
properties.ts    ← Properties namespace
index.ts         ← flat re-exports
```

Proposed:
```
expression.ts    ← opaque NumberExpression/ColorExpression interfaces + internal factory functions
nodes.ts         ← internal AST node classes (unchanged)
calc.ts          ← Calc namespace (math constructors + bind/solve/serialize for NumberExpression)
colors.ts        ← Colors namespace (oklch + bind/serialize for ColorExpression)
properties.ts    ← Properties namespace (unchanged)
index.ts         ← export { Calc } from './calc.ts'; export { Colors } from './colors.ts'; export * as Properties from './properties.ts'
```

The circular dependency is eliminated: `expression.ts` defines only types and factory functions (no imports from `calc.ts`). `calc.ts` and `colors.ts` import from `expression.ts` and `nodes.ts`.

### Breaking change: import style

**Before:**
```ts
import * as ct from '@ok-apca/calc-tree'
import { Properties } from '@ok-apca/calc-tree'
import type { ExpressionInput } from '@ok-apca/calc-tree'

ct.add('a', ct.multiply('b', 2))
ct.oklch(lightness, chroma, hue)
expr.bind({ x: 5 })
expr.solve({ x: 5 })
const input: ExpressionInput<'x'> = 'x'
```

**After:**
```ts
import { Calc, Colors, Properties } from '@ok-apca/calc-tree'

Calc.add('a', Calc.multiply('b', 2))
Colors.oklch(lightness, chroma, hue)
Calc.bind(expr, { x: 5 })
Calc.solve(expr, { x: 5 })
const input: Calc.Input<'x'> = 'x'
```

### Type exports

Expression types are exported at the top level for convenience. `Input` and `InferRefs` live on the `Calc` namespace since they describe numeric expression inputs:

```ts
// Top-level type exports
export type { NumberExpression, ColorExpression } from './expression.ts'
export type { PropertySet, PropertyRule } from './properties.ts'

// Namespace-scoped types (accessed as Calc.Input, Calc.InferRefs)
Calc.Input<Refs>      // NumberExpression<Refs> | number | string
Calc.InferRefs<T>     // extract refs from an Input
```

Usage:
```ts
import type { NumberExpression } from '@ok-apca/calc-tree'
import { Calc } from '@ok-apca/calc-tree'

// Where you'd previously use ExpressionInput:
function foo(x: Calc.Input<'lightness'>): NumberExpression<'lightness'> { ... }
```

## Migration

### ok-apca gamut.ts

```ts
// Before
import * as ct from '@ok-apca/calc-tree'

const maxChromaExpr: ct.NumberExpression<'lightness' | 'apexL' | 'apexC' | 'curvature'> =
  ct.lerp(
    ct.divide(ct.multiply('apexC', 'lightness'), 'apexL'),
    // ...
  )
slice.maxChroma.solve({ lightness })

// After
import { Calc } from '@ok-apca/calc-tree'
import type { NumberExpression } from '@ok-apca/calc-tree'

const maxChromaExpr: NumberExpression<'lightness' | 'apexL' | 'apexC' | 'curvature'> =
  Calc.lerp(
    Calc.divide(Calc.multiply('apexC', 'lightness'), 'apexL'),
    // ...
  )
Calc.solve(slice.maxChroma, { lightness })
```

### ok-apca generator.ts

```ts
// Before
import * as ct from '@ok-apca/calc-tree'
import { Properties } from '@ok-apca/calc-tree'

ct.oklch('lightness', ct.multiply(maxChromaProp, 'chroma'), hueInput)
expr.bind({ fA: fAInput, fB: fBInput, fD: fDInput })

// After
import { Calc, Colors, Properties } from '@ok-apca/calc-tree'

Colors.oklch('lightness', Calc.multiply(maxChromaProp, 'chroma'), hueInput)
Calc.bind(expr, { fA: fAInput, fB: fBInput, fD: fDInput })
```

### ok-apca apca.ts / contrast.ts

```ts
// Before
import * as ct from '@ok-apca/calc-tree'

const absContrast = ct.abs('contrast')
expr.bind({ y: yBgExpr })

// After
import { Calc } from '@ok-apca/calc-tree'

const absContrast = Calc.abs('contrast')
Calc.bind(expr, { y: yBgExpr })
```

## Scope

### In scope

- Create `Calc` namespace with math constructors + `bind`/`solve`/`serialize` + `Input`/`InferRefs` types
- Create `Colors` namespace with `oklch` + `bind`/`serialize` (no `solve`)
- Convert `NumberExpression`/`ColorExpression` from classes to opaque interfaces with `@internal` fields
- Reorganize files: `calc.ts`, `colors.ts`, `expression.ts` (types only)
- Eliminate circular dependency between constructors and expressions
- Update ok-apca consumers (`gamut.ts`, `apca.ts`, `contrast.ts`, `generator.ts`)
- Update tests
- Update CLAUDE.md

### Out of scope

- `Properties` namespace — no changes (already functional)
- `nodes.ts` internal AST — no changes
- `formatNumber` — stays, just moves into `Calc` namespace
- Expression semantics (constant folding, ref tracking, etc.) — no changes

## Implementation plan

### 1. Restructure expression types

**File:** `packages/calc-tree/src/expression.ts`

- [ ] Convert `NumberExpression` and `ColorExpression` from classes to opaque interfaces with `@internal` `_node`, `_refs`, `_brand` fields
- [ ] Add internal factory functions `makeNumber(node, refs)` and `makeColor(node, refs)` (not exported from package)
- [ ] Add internal accessor helpers `getNode(expr)` and `getRefs(expr)` (not exported)
- [ ] Remove `BaseExpression` abstract class

### 2. Create `Calc` namespace

**File:** `packages/calc-tree/src/calc.ts`

- [ ] Move all math constructors from `constructors.ts`: `add`, `subtract`, `multiply`, `divide`, `pow`, `signedPow`, `sin`, `abs`, `sign`, `clamp`, `min`, `max`, `lerp`
- [ ] Move `constant`, `reference`, `toExpression` as internal helpers (not in namespace surface)
- [ ] Implement `bind(expr, bindings)` — extracted from `BaseExpression.bind()`
- [ ] Implement `solve(expr, bindings?)` — extracted from `NumberExpression.solve()`
- [ ] Implement `serialize(expr, bindings?)` — extracted from `BaseExpression.serialize()`
- [ ] Move `formatNumber` into namespace
- [ ] Export `Input` type (renamed from `ExpressionInput`) and `InferRefs` type on the namespace

### 3. Create `Colors` namespace

**File:** `packages/calc-tree/src/colors.ts`

- [ ] Move `oklch` from `constructors.ts`
- [ ] Add `bind(expr, bindings)` for `ColorExpression`
- [ ] Add `serialize(expr, bindings?)` for `ColorExpression`

### 4. Update `properties.ts`

- [ ] Update internal imports to use new expression factory/accessor functions instead of class constructors
- [ ] No public API changes

### 5. Update index.ts exports

- [ ] `export { Calc } from './calc.ts'` (or `export * as Calc`)
- [ ] `export { Colors } from './colors.ts'` (or `export * as Colors`)
- [ ] `export * as Properties from './properties.ts'` (unchanged)
- [ ] Export types at top level: `NumberExpression`, `ColorExpression`, `PropertySet`, `PropertyRule`
- [ ] Ensure `Input` and `InferRefs` are accessible as `Calc.Input` and `Calc.InferRefs`
- [ ] Remove old flat exports (`add`, `multiply`, `oklch`, etc.)
- [ ] Delete `constructors.ts`

### 6. Update ok-apca consumers

**Files:** `gamut.ts`, `apca.ts`, `contrast.ts`, `generator.ts`

- [ ] Replace `import * as ct` with `import { Calc, Colors, Properties }`
- [ ] Replace `ct.add(...)` with `Calc.add(...)`, etc.
- [ ] Replace `ct.oklch(...)` with `Colors.oklch(...)`
- [ ] Replace `expr.bind(...)` with `Calc.bind(expr, ...)` or `Colors.bind(expr, ...)`
- [ ] Replace `expr.solve(...)` with `Calc.solve(expr, ...)`
- [ ] Verify generated CSS is identical

### 7. Update tests

- [ ] Update all test imports to use new namespaces
- [ ] Replace method calls with namespace function calls
- [ ] Verify all tests pass

### 8. Update CLAUDE.md

- [ ] Update calc-tree architecture description to reflect namespaces and functional API
