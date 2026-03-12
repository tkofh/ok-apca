# RFC: Peer Color Roles

## Status

Ready for implementation.

## Reading list

Files to read before working on this RFC, in recommended order:

| File | What to learn |
|------|---------------|
| `packages/ok-apca/src/index.ts` | Current public API (`defineColors`), validation, `DefineColorsOptions` shape |
| `packages/ok-apca/src/generator.ts` | CSS generation engine — how base color + variants become declaration blocks and hue selectors |
| `packages/ok-apca/src/contrast.ts` | `contrastTargetLightness` and `contrastTargetLightnessWithInversion` factories, `yBackground` expression, `computeContrastColor` runtime |
| `packages/ok-apca/src/gamut.ts` | `maxChromaExpr` expression tree, `computeGamutSlice`, `GamutSlice` type |
| `packages/ok-apca/src/apca.ts` | APCA formula expressions — polarity solvers, soft clamp, contrast measurement |
| `packages/calc-tree/src/declarations.ts` | `DeclarationBlock` API — `property()`, `assign()`, `toPropertyRules()`, `toSelector()` |
| `packages/playground/app/app.vue` | Real-world usage of the current API |

## Summary

Replace the current one-to-many model (one base color, N contrast variants) with a many-to-many model where a **set** of **roles** define contrast relationships between each other. Each role can serve as the "active" color on a given element, with other roles computed as contrast colors relative to it.

## Motivation

The current API models colors as a base (`--color`) with dependent variants (`--color-text`, `--color-fill`). In practice, design systems treat these as peers — a card's fill is the anchor for its text, but elsewhere that same text color might anchor an icon. The base/variant hierarchy doesn't reflect this reality.

1. **Rigid hierarchy.** The base color is always the anchor. If you want text to anchor a sub-element, you need a second `defineColors` call with a different configuration.

2. **Semantic mismatch.** Calling one color the "base" and others "variants" implies a derivation relationship that doesn't match how designers think about color roles. Fill and text are peers with a contrast relationship — neither derives from the other.

3. **Redundant work.** If a design system needs both "fill anchors text" and "text anchors fill" perspectives, today that requires two separate color system definitions with duplicated hue data.

## API

```ts
const system = defineColors({
  hues: [
    { name: 'red', hue: 25, selector: '.red' },
    { name: 'blue', hue: 240, selector: '.blue' },
  ],
  roles: [
    { name: 'fill' },
    { name: 'text' },
    { name: 'icon', contrastsWith: ['fill'] },
    { name: 'focus', passive: true },
  ],
})
```

### Terminology

| Current | New | Meaning |
|---------|-----|---------|
| `output` | `name` | Property namespace (e.g., `'color'` → `--color-fill`, `--color-text`) |
| `baseSelector` | _(removed)_ | Each role has its own selector |
| variant | role | A named color with semantic purpose (fill, text, border) |
| base color | active role | The role controlled by `--lightness`/`--chroma` on a given element |

A **set** is the collection of roles that define contrast relationships between each other. Multiple sets can coexist on the same page via the `name` namespace (e.g., `name: 'surface'` produces `--surface-fill`, `--surface-text`).

### Options

```ts
interface ColorSetOptions {
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

type DefineColorsOptions =
  | ColorSetOptions
  | { readonly sets: NonEmptyArray<ColorSetOptions> }
```

`defineColors` is generic on the options type. When called with a single `ColorSetOptions`, it returns a single color set definition. When called with `{ sets: NonEmptyArray<ColorSetOptions> }`, it returns a `NonEmptyArray` of color set definitions.

### Role definition

```ts
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

type RoleEntry = ActiveRoleEntry | PassiveRoleEntry
```

`RoleEntry` is a discriminated union on `passive`. Active roles get a CSS class (via `selector`, defaulting to `.${name}`). Passive roles have no selector — they only appear as contrast targets.

### Active vs passive roles

An **active role** gets a CSS class (via its `selector`, which defaults to `.${name}` if omitted). When that class is applied to an element, the role becomes the anchor: its color is controlled by `--lightness` and `--chroma`, and contrast colors are computed for the roles in its `contrastsWith` list (default: all other roles).

A **passive role** has no selector and no generated class. It can only appear as a contrast target in other roles' output. Useful for colors that are always derived (e.g., a focus ring that only ever contrasts against fill). Passive roles may optionally specify `contrastsWith` to limit which active roles they appear as contrast targets for (e.g., a focus ring that only needs to contrast against fill, not text).

### `contrastsWith` filtering

By default, an active role generates contrast outputs for every other role. `contrastsWith` narrows this to skip unlikely pairings:

```ts
roles: [
  { name: 'fill' },                                   // selector: '.fill', → text, icon, focus
  { name: 'text', contrastsWith: ['fill'] },           // selector: '.text', → fill only
  { name: 'icon', contrastsWith: ['fill'] },           // selector: '.icon', → fill only
  { name: 'focus', passive: true },                    // never active
]
```

| Active class | Outputs |
|---|---|
| `.fill` | `--color-fill` (active), `--color-text`, `--color-icon`, `--color-focus` |
| `.text` | `--color-text` (active), `--color-fill` |
| `.icon` | `--color-icon` (active), `--color-fill` |

Without filtering: 3 active × 3 targets = 9 solver instances.
With filtering: 3 + 1 + 1 = 5 solver instances.

### Runtime inputs

All `@property` declarations with `inherits: true`, defaulting to 0:

- `--lightness` (0–1) — controls the active role's lightness
- `--chroma` (0–1) — shared chroma ratio for all roles in the set
- `--contrast-{role}` — one per contrast target (e.g., `.fill` reads `--contrast-text`)

### CSS output structure

For `roles: [{ name: 'fill' }, { name: 'text' }]` with `name: 'color'`:

```css
/* @property rules (top-level, shared across all role classes) */
@property --color-fill { inherits: true; syntax: '<color>'; initial-value: oklch(0.5 0 0); }
@property --color-text { inherits: true; syntax: '<color>'; initial-value: oklch(0.5 0 0); }
@property --lightness { inherits: true; syntax: '<number>'; initial-value: 0; }
@property --chroma { inherits: true; syntax: '<number>'; initial-value: 0; }
@property --contrast-text { inherits: true; syntax: '<number>'; initial-value: 0; }
@property --contrast-fill { inherits: true; syntax: '<number>'; initial-value: 0; }
/* ... intermediate @property rules namespaced per active role ... */

/* Per-role selectors */
.fill {
  /* fill = active color from --lightness and --chroma */
  --color-fill: oklch(var(--lightness) calc(maxChroma * var(--chroma)) var(--_color-hue));
  /* text = contrast color relative to fill */
  --color-text: oklch(/* solved lightness */ /* chroma */ var(--_color-hue));
}

.text {
  /* text = active color from --lightness and --chroma */
  --color-text: oklch(var(--lightness) calc(maxChroma * var(--chroma)) var(--_color-hue));
  /* fill = contrast color relative to text */
  --color-fill: oklch(/* solved lightness */ /* chroma */ var(--_color-hue));
}

/* Hue selectors — use :is() nesting to assign gamut constants directly to role elements */
.red {
  :is(&, & *):is(.fill, .text) { --_color-hue: 25; --_color-apexL: 0.65; /* ... */ }
}
.blue {
  :is(&, & *):is(.fill, .text) { --_color-hue: 240; --_color-apexL: 0.45; /* ... */ }
}
```

Hue selectors use `:is()` nesting to target elements that are either the hue element itself or a descendant of it, constrained to those with a role class. `:is(&, & *)` matches the hue element or any descendant; `:is(.fill, .text)` constrains to role elements. This keeps the role list in one place per hue, and allows all `_`-prefixed properties to use `inherits: false` (the calc-tree convention).

### Usage

```html
<!-- Card: fill is active, text contrasts against it -->
<div class="red fill" style="--lightness: 0.7; --chroma: 0.8; --contrast-text: 0.75">
  <p style="background: var(--color-fill); color: var(--color-text)">
    Hello
  </p>
</div>

<!-- Badge: text is active, fill contrasts against it -->
<span class="blue text" style="--lightness: 0.5; --chroma: 1; --contrast-fill: 0.6">
  <span style="background: var(--color-fill); color: var(--color-text)">
    Badge
  </span>
</span>
```

Components always consume `var(--color-fill)` and `var(--color-text)` — they don't need to know which role is active. The class on the ancestor determines the perspective.

### Multiple sets

Multiple sets coexist via the `name` namespace. Hue selectors and intermediate properties are namespaced per set (e.g., `_color-hue` vs `_surface-hue`). All `_`-prefixed properties use `inherits: false`:

```ts
const [surface, accent] = defineColors({
  sets: [
    {
      name: 'surface',
      hues: [{ name: 'red', hue: 25, selector: '.surface-red' }],
      roles: [
        { name: 'fill', selector: '.surface-fill' },
        { name: 'text', selector: '.surface-text' },
      ],
    },
    {
      name: 'accent',
      hues: [{ name: 'blue', hue: 240, selector: '.accent-blue' }],
      roles: [
        { name: 'fill', selector: '.accent-fill' },
        { name: 'text', selector: '.accent-text' },
      ],
    },
  ],
})
```

## Scaling characteristics

### DevTools impact (the metric that matters)

Per-element, only one role class is active. The active class contains 1 base + K contrast solvers (where K = number of `contrastsWith` targets). The fully-substituted expression size per element is identical to or less than today's model.

The quadratic growth in total contrast solver instances (N_active × N_targets without filtering) affects CSS file size only — a build-time/transfer concern, not a DevTools concern. For typical usage (2–4 roles, with filtering), this is modest.

### Intermediate properties

Each role class is self-contained. It needs its own `Y_bg` and soft-clamped `Y_bg` since these depend on the active role's lightness. All intermediate properties — including gamut slice constants — are namespaced per active role and use `inherits: false` (the `_` prefix convention). Gamut constants are assigned directly to role elements via nested hue selectors rather than relying on CSS inheritance.

The expression trees themselves are built once and reused — only the CSS serialization is per-role.

## Validation rules

- Role names must match `/^[a-z][a-z0-9_-]*$/i`
- Duplicate role `name`s throw
- Duplicate entries in `contrastsWith` are silently deduplicated (no error)
- Active role `selector` defaults to `.${name}` when omitted
- Passive roles must not specify `selector`
- `contrastsWith` entries must reference other valid role names
- `contrastsWith` must not include the role's own name
- At least one active role is required

## Implementation plan

### 1. Update types and public API

**Files:** `packages/ok-apca/src/index.ts`, `packages/ok-apca/src/generator.ts`

- [ ] Define `ActiveRoleEntry` and `PassiveRoleEntry` interfaces, `RoleEntry` discriminated union
- [ ] Define `ColorSetOptions` (rename from current `DefineColorsOptions` shape, `output` → `name`)
- [ ] Define `DefineColorsOptions` as `ColorSetOptions | { sets: NonEmptyArray<ColorSetOptions> }`
- [ ] Make `defineColors` generic — single `ColorSetOptions` returns one definition, `{ sets }` returns `NonEmptyArray`
- [ ] Replace `ColorsDefinition` — remove `baseSelector` and `variants`, add `roles` and resolved contrast targets per active role
- [ ] Update `defineColors` validation:
  - [ ] Validate role names (format + uniqueness)
  - [ ] Default active role selector to `.${name}` when omitted
  - [ ] Validate passive roles don't have selectors
  - [ ] Deduplicate `contrastsWith` entries silently
  - [ ] Validate contrastsWith references exist and don't self-reference
  - [ ] Validate at least one active role
- [ ] Resolve `contrastsWith` defaults (all other roles) during validation, so the generator receives fully-resolved target lists

### 2. Rewrite `generateColorsCss`

**File:** `packages/ok-apca/src/generator.ts`

This is the core of the change. The current function builds one `DeclarationBlock` for the base selector. The new function builds one block per active role.

- [ ] Collect shared `@property` declarations (user-facing inputs like `--lightness`, `--chroma`, `--contrast-{role}`, and outputs like `--{name}-{role}`)
- [ ] For each active role, build a separate property set:
  - [ ] Namespace intermediate properties with the active role name (e.g., prefix `_${name}-${activeRole}-`)
  - [ ] Declare gamut input properties (hue, apexL, apexC, curvature, fA, fB, fD) as intermediates (`inherits: false`) — values are assigned by nested hue selectors, not inherited
  - [ ] Build the active role's base color: bind `maxChromaExpr` to `lightnessInput`, emit `oklch(lightness, maxChroma * chroma, hue)`
  - [ ] Build Y_bg and soft-clamped Y_bg from the active role's lightness
  - [ ] For each contrast target: bind `contrastTargetLightness[WithInversion]`, bind gamut refs, build max chroma at target lightness, emit `oklch(targetL, targetMaxChroma * chroma, hue)`
- [ ] Build hue selector blocks using CSS nesting — each hue selector nests into role selectors (both `&.role` and `& .role`) to assign gamut constants directly to role elements
- [ ] Assemble CSS: shared `@property` rules + per-role selectors + nested hue selectors

Depends on the calc-tree cleanup RFC (`docs/rfc-calc-tree-cleanup.md`) for the property set sharing API (`input`/`intermediate`/`output` with parent-child sets).

### 3. calc-tree cleanup (prerequisite)

See `docs/rfc-calc-tree-cleanup.md`. The calc-tree API needs to support parent-child property sets with shared `@property` rules before the generator rewrite (task 2) can proceed.

### 4. Update `computeContrastColor` runtime

**File:** `packages/ok-apca/src/contrast.ts`

The runtime function currently computes a contrast color from a base color. Its semantics don't change — it still takes one color and returns another at a target contrast. But the public API context shifts (it's now role-to-role, not base-to-variant).

- [ ] Review whether the function signature needs updating (likely no — it's already symmetric)
- [ ] Update JSDoc to use role terminology instead of base/variant

### 5. Update tests

**Files:** `packages/ok-apca/test/unit/generator.spec.ts`, `packages/ok-apca/test/integration/*.spec.ts`

- [ ] Rewrite `generator.spec.ts` unit tests:
  - [ ] Test `defineColors` validation for roles (format, uniqueness, passive constraints, contrastsWith references)
  - [ ] Test basic 2-role output (fill + text)
  - [ ] Test passive roles (no selector generated)
  - [ ] Test contrastsWith filtering (only specified targets get contrast output)
  - [ ] Test `name` namespacing
  - [ ] Test hue selectors still work
- [ ] Update integration tests:
  - [ ] `base-color.spec.ts` → adapt to test the active role's base color behavior
  - [ ] `contrast-color.spec.ts` → adapt to test role-to-role contrast
  - [ ] `options.spec.ts` → update for new options shape
  - [ ] `parity.spec.ts` → verify CSS/TS parity still holds with per-role selectors
  - [ ] `edge-cases.spec.ts` → verify edge cases with the new structure

### 6. Update playground

**File:** `packages/playground/app/app.vue`

- [ ] Update `defineColors` call to use `roles` instead of `baseSelector` + `variants`
- [ ] Update HTML to apply role selector classes instead of the base selector class
- [ ] Add UI to switch which role is active (e.g., toggle between "fill is active" and "text is active")
- [ ] Update reactive state and CSS variable bindings to match new property names (`--color-fill` instead of `--color`)

### 7. Update CLAUDE.md

**File:** `CLAUDE.md`

- [ ] Update Architecture section — replace base/variant terminology with set/role
- [ ] Update `generator.ts` description — per-role blocks instead of single base block
- [ ] Update `index.ts` description — new `DefineColorsOptions` shape
- [ ] Update "How It Works" section — step 2 mentions expression trees per role
- [ ] Add `RoleEntry` to the API description
