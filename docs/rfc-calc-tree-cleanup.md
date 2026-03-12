```css
@property --_color-hue {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_color-apexL {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_color-apexC {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_color-curvature {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_color-fA {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_color-fB {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_color-fD {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --lightness {
  inherits: true;
  initial-value: 0;
  syntax: "<number>";
}
@property --chroma {
  inherits: true;
  initial-value: 0;
  syntax: "<number>";
}
@property --_color-mc {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --color {
  inherits: true;
  initial-value: transparent;
  syntax: "<color>";
}
@property --_color-ybg {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_color-sc {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --contrast-text {
  inherits: true;
  initial-value: 0;
  syntax: "<number>";
}
@property --_color-mc-text {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_cl-text {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_yt-text {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_lcl-text {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_yl-text {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_ylr-text {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_lcd-text {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_yd-text {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --_ydr-text {
  inherits: false;
  initial-value: 0;
  syntax: "<number>";
}
@property --color-text {
  inherits: true;
  initial-value: transparent;
  syntax: "<color>";
}

.preview {
  --_color-mc: calc(
    (1 - max(0, sign(var(--lightness) - var(--_color-apexL)))) *
      var(--_color-apexC) * var(--lightness) / var(--_color-apexL) +
      max(0, sign(var(--lightness) - var(--_color-apexL))) *
      (
        var(--_color-apexC) * (1 - var(--lightness)) /
          (1 - var(--_color-apexL)) + var(--_color-curvature) *
          pow(
            sin(
              max(
                  0,
                  (var(--lightness) - var(--_color-apexL)) /
                    (1 - var(--_color-apexL))
                ) *
                pi
            ),
            0.95
          ) *
          var(--_color-apexC)
      )
  );
  --color: oklch(
    var(--lightness) calc(var(--_color-mc) * var(--chroma)) var(--_color-hue)
  );
  --_color-ybg: calc(
    pow(var(--lightness), 3) *
      (
        1 + var(--_color-fA) * var(--chroma) + var(--_color-fB) *
          pow(var(--chroma), 2) + var(--_color-fD) * pow(var(--chroma), 3)
      )
  );
  --_color-sc: pow(pow(var(--_color-ybg), 1.75) + 0.00009, 0.57143);
  --_color-mc-text: calc(
    (1 - max(0, sign(var(--_cl-text) - var(--_color-apexL)))) *
      var(--_color-apexC) * var(--_cl-text) / var(--_color-apexL) +
      max(0, sign(var(--_cl-text) - var(--_color-apexL))) *
      (
        var(--_color-apexC) * (1 - var(--_cl-text)) /
          (1 - var(--_color-apexL)) + var(--_color-curvature) *
          pow(
            sin(
              max(
                  0,
                  (var(--_cl-text) - var(--_color-apexL)) /
                    (1 - var(--_color-apexL))
                ) *
                pi
            ),
            0.95
          ) *
          var(--_color-apexC)
      )
  );
  --_cl-text: pow(
    var(--_yt-text) /
      (
        1 + var(--_color-fA) * var(--chroma) + var(--_color-fB) *
          pow(var(--chroma), 2) + var(--_color-fD) * pow(var(--chroma), 3)
      ),
    0.33333
  );
  --_yt-text: calc(
    (
        (
            1 -
              max(
                max(0, sign(0.08 - var(--_lcl-text))) *
                  max(0, sign(0.08 - var(--_lcd-text))),
                max(0, -1 * sign(var(--contrast-text))) *
                  max(0, sign(var(--_ydr-text))) +
                  max(0, sign(var(--contrast-text))) *
                  max(0, sign(1 - var(--_ylr-text)))
              )
          ) *
          max(
            0,
            sign(
              var(--_lcl-text) - var(--_lcd-text) +
                max(0, sign(var(--contrast-text))) * 0.001 -
                max(0, -1 * sign(var(--contrast-text))) * 0.001
            )
          ) +
          max(
            max(0, sign(0.08 - var(--_lcl-text))) *
              max(0, sign(0.08 - var(--_lcd-text))),
            max(0, -1 * sign(var(--contrast-text))) *
              max(0, sign(var(--_ydr-text))) +
              max(0, sign(var(--contrast-text))) *
              max(0, sign(1 - var(--_ylr-text)))
          ) *
          max(0, sign(var(--contrast-text)))
      ) *
      var(--_yl-text) +
      (
        (
            1 -
              max(
                max(0, sign(0.08 - var(--_lcl-text))) *
                  max(0, sign(0.08 - var(--_lcd-text))),
                max(0, -1 * sign(var(--contrast-text))) *
                  max(0, sign(var(--_ydr-text))) +
                  max(0, sign(var(--contrast-text))) *
                  max(0, sign(1 - var(--_ylr-text)))
              )
          ) *
          max(
            0,
            sign(
              -1 *
                (
                  var(--_lcl-text) - var(--_lcd-text) +
                    max(0, sign(var(--contrast-text))) * 0.001 -
                    max(0, -1 * sign(var(--contrast-text))) * 0.001
                )
            )
          ) +
          max(
            max(0, sign(0.08 - var(--_lcl-text))) *
              max(0, sign(0.08 - var(--_lcd-text))),
            max(0, -1 * sign(var(--contrast-text))) *
              max(0, sign(var(--_ydr-text))) +
              max(0, sign(var(--contrast-text))) *
              max(0, sign(1 - var(--_ylr-text)))
          ) *
          max(0, -1 * sign(var(--contrast-text)))
      ) *
      var(--_yd-text) +
      (
        1 -
          max(
            max(0, sign(var(--contrast-text))),
            max(0, -1 * sign(var(--contrast-text)))
          )
      ) *
      var(--_color-ybg)
  );
  --_lcl-text: max(
    0,
    1.14 *
      (
        pow(pow(pow(var(--_yl-text), 1.75) + 0.00009, 0.57143), 0.62) -
          pow(pow(pow(var(--_color-ybg), 1.75) + 0.00009, 0.57143), 0.65)
      ) -
      0.027
  );
  --_yl-text: pow(max(0, pow(var(--_ylr-text), 1.75) - 0.00009), 0.57143);
  --_ylr-text: clamp(
    0,
    (1 - max(0, sign(abs(var(--contrast-text)) - 0.022))) *
      (
        (
            1 -
              pow(sin(min(abs(var(--contrast-text)) / 0.022, 1) * 1.5708), 2.46)
          ) *
          var(--_color-sc) +
          pow(sin(min(abs(var(--contrast-text)) / 0.022, 1) * 1.5708), 2.46) *
          pow(pow(var(--_color-sc), 0.65) + 0.04298, 1.6129)
      ) +
      max(0, sign(abs(var(--contrast-text)) - 0.022)) *
      pow(
        pow(var(--_color-sc), 0.65) + (abs(var(--contrast-text)) + 0.027) / 1.14,
        1.6129
      ),
    1
  );
  --_lcd-text: max(
    0,
    1.14 *
      (
        pow(pow(pow(var(--_color-ybg), 1.75) + 0.00009, 0.57143), 0.56) -
          pow(pow(pow(var(--_yd-text), 1.75) + 0.00009, 0.57143), 0.57)
      ) -
      0.027
  );
  --_yd-text: pow(max(0, pow(var(--_ydr-text), 1.75) - 0.00009), 0.57143);
  --_ydr-text: clamp(
    0,
    (1 - max(0, sign(abs(var(--contrast-text)) - 0.022))) *
      (
        (
            1 -
              pow(sin(min(abs(var(--contrast-text)) / 0.022, 1) * 1.5708), 2.46)
          ) *
          var(--_color-sc) +
          pow(sin(min(abs(var(--contrast-text)) / 0.022, 1) * 1.5708), 2.46) *
          pow(abs(pow(var(--_color-sc), 0.56) - 0.04298), 1.75439) *
          sign(pow(var(--_color-sc), 0.56) - 0.04298)
      ) +
      max(0, sign(abs(var(--contrast-text)) - 0.022)) *
      pow(
        abs(
          pow(var(--_color-sc), 0.56) - (abs(var(--contrast-text)) + 0.027) /
            1.14
        ),
        1.75439
      ) *
      sign(
        pow(var(--_color-sc), 0.56) - (abs(var(--contrast-text)) + 0.027) / 1.14
      ),
    1
  );
  --color-text: oklch(
    var(--_cl-text) calc(var(--_color-mc-text) * var(--chroma))
      var(--_color-hue)
  );
}

.preview {
  --_color-hue: 240;
  --_color-apexL: 0.68;
  --_color-apexC: 0.20342;
  --_color-curvature: -0.02484;
  --_color-fA: 0.04705;
  --_color-fB: -0.02418;
  --_color-fD: -0.00292;
}
```

# RFC: calc-tree API cleanup

## Status

Draft — prerequisite for peer-colors implementation.

## Summary

Simplify the `@ok-apca/calc-tree` API to be consistently functional, make `@property` block sets a first-class concept, and encode the `_`-prefix = `inherits: false` convention so callers never pass `inherits` directly.

## Motivation

The peer-colors RFC (multi-role CSS generation) needs multiple `DeclarationBlock`s that share `@property` rules. Today each block independently collects its own rules via `.property()`, so the same `@property` would be emitted multiple times. That's task 3 in the peer-colors implementation plan.

Rather than patch around the current API, this is an opportunity to clean up accumulated friction:

1. **Mixed paradigms.** Expression construction is functional (`add`, `multiply`, `property`), but CSS collection is class-method (`DeclarationBlock` with `.property()`, `.set()`, `.assign()`, `.toPropertyRules()`, `.toSelector()`). The `DeclarationBlock.property()` method duplicates the standalone `property()` function with added side effects (merging declarations/properties into internal maps). This is confusing — two `property` functions with different semantics.

2. **`inherits` is always computable.** In ok-apca, the convention is: names starting with `_` are intermediate/private (`inherits: false`), everything else is public (`inherits: true`). Every single `inherits` argument in `generator.ts` follows this rule. Passing it explicitly is a source of potential bugs — the naming convention and the `inherits` flag could drift apart.

3. **`@property` sharing across blocks.** The current `DeclarationBlock` has no concept of shared property declarations. Each block that calls `.property()` independently collects its own `@property` rules. For peer-colors, we need multiple role blocks (one per active role) that share a common set of `@property` rules (for inputs like `--lightness`, outputs like `--color-fill`, and intermediates namespaced per role). There's no clean way to do this today.

4. **`DeclarationBlock` does too much.** It mixes property declaration, expression wrapping, literal value assignment, and CSS rendering into one mutable class. Separating these concerns would make the API easier to understand and compose.

## Design

### Drop `DeclarationBlock`, replace with functional `Properties` namespace

The core idea: a **property set** is a plain collection of `@property` rules and CSS declarations that can be rendered to CSS. Property sets are built with functions, not methods. All functions are exported as a `Properties` namespace (following the Effect convention of namespaced submodule exports).

Property types are split into separate functions — `number` and `color` — rather than passing a type string as an argument. When called without a value, the property is an input (just an `@property` rule). When called with an expression, the property is computed (both `@property` rule and declaration).

```ts
import { Properties } from "@ok-apca/calc-tree";

// Create a property set
const shared = Properties.make();

// Define input properties — returns an expression, registers the @property rule in the set
const lightness = Properties.number(shared, "lightness");
const hue = Properties.number(shared, "_color-hue");

// Define computed property — wraps expression, registers @property and declaration
const mc = Properties.number(
  shared,
  "_color-mc",
  maxChromaExpr.bind({ lightness }),
);

// Define output color
Properties.color(
  shared,
  "color",
  oklch(lightness, multiply(mc, "chroma"), hue),
);

// Render
Properties.toAtRules(shared); // → all @property rules as CSS string
Properties.toRuleset(shared, ".fill"); // → selector block with all declarations
```

### Encode `_`-prefix convention: drop `inherits` parameter

The `inherits` value is derived from the property name:

- Name starts with `_` → `inherits: false` (intermediate/private)
- Otherwise → `inherits: true` (public input or output)

```ts
// Before
base.property(`${p}hue`, 'number', true)    // _ prefix + inherits: true ← contradictory!
base.property(`${p}mc`, maxChromaExpr...)    // _ prefix, inherits defaults to false ✓
base.property('lightness', 'number', true)   // no prefix, inherits: true ✓
base.property(output, color, true)           // no prefix, inherits: true ✓

// After — no inherits argument, convention is the API
Properties.number(set, '_color-hue')        // _ → inherits: false
Properties.number(set, 'lightness')         // no _ → inherits: true
Properties.color(set, 'color', colorExpr)   // no _ → inherits: true
```

Previously, the gamut slice properties (`_color-hue`, `_color-apexL`, etc.) were `_`-prefixed but `inherits: true` — they were set by a hue ancestor selector and inherited via CSS inheritance. This broke the convention.

The peer-colors RFC resolves this: hue selectors now use `:is()` nesting to assign gamut constants directly to role elements (e.g., `.red { :is(&, & *):is(.fill, .text) { --_color-hue: 25; } }`). With this change, all `_`-prefixed properties are `inherits: false` — no exceptions.

| Property        | Prefix | `inherits` | Why                                      |
| --------------- | ------ | ---------- | ---------------------------------------- |
| `_color-hue`    | `_`    | `false`    | Assigned directly by nested hue selector |
| `_color-apexL`  | `_`    | `false`    | Same                                     |
| `_color-mc`     | `_`    | `false`    | Computed intermediate                    |
| `_color-ybg`    | `_`    | `false`    | Computed intermediate                    |
| `lightness`     | none   | `true`     | User-facing input                        |
| `chroma`        | none   | `true`     | User-facing input                        |
| `color`         | none   | `true`     | Output                                   |
| `color-text`    | none   | `true`     | Output                                   |
| `contrast-text` | none   | `true`     | User-facing input                        |

The convention holds universally: `_` prefix → `inherits: false`, no prefix → `inherits: true`.

### Property sets with sharing

For peer-colors, we need shared `@property` rules across multiple selector blocks. The API should support this:

```ts
// Shared set — collects @property rules only, no selector declarations
const shared = Properties.make();

// Input properties (shared across all role selectors)
const lightness = Properties.number(shared, "lightness");

// Per-role sets — each gets its own selector declarations
const fillBlock = Properties.make(shared);
const textBlock = Properties.make(shared);

// Gamut constants as intermediates (inherits: false via _ prefix)
// Values assigned by nested hue selectors, not inherited
const hue = Properties.number(fillBlock, "_color-fill-hue");

// Computed intermediates scoped to fill's selector
const mc = Properties.number(
  fillBlock,
  "_color-fill-mc",
  maxChromaExpr.bind({ lightness }),
);

// Output color assigned in fill's selector
Properties.color(
  fillBlock,
  "color-fill",
  oklch(lightness, multiply(mc, "chroma"), hue),
);

// Render — shared @property rules include everything from all linked sets
Properties.toAtRules(shared);
Properties.toRuleset(fillBlock, ".fill");
Properties.toRuleset(textBlock, ".text");
```

Key behaviors:

- `Properties.make()` creates a standalone set
- `Properties.make(parent)` creates a child set that contributes `@property` rules to the parent
- `Properties.toAtRules(parent)` renders rules from the parent and all children (deduplicated)
- `Properties.toRuleset(child, selector)` renders only that child's declarations
- `Properties.number(set, name)` without a value registers an `@property` rule and returns an expression (input)
- `Properties.number(set, name, expr)` with a value registers `@property` rule + declaration, returns expression (computed intermediate)
- `Properties.color(set, name, expr)` registers `@property` rule + declaration for color properties

### Batch number definitions (hue selectors)

Hue selectors assign many literal values at once. `numbers` is a batch `number` that takes a `Record<string, number | NumberExpression>`:

```ts
const hueBlock = Properties.make();
Properties.numbers(hueBlock, {
  "_color-hue": 25,
  "_color-apexL": 0.65,
  "_color-apexC": 0.28,
  "_color-curvature": 1.2,
  "_color-fA": 0.12,
  "_color-fB": 0.34,
  "_color-fD": 0.56,
});
Properties.toRuleset(hueBlock, ".red");
```

No prefix support — full property names are always explicit. This keeps the API compatible with future type-level tracking of property names in a set.

### Merging property sets

When mapping over color sets or roles produces an array of `PropertySet`s, `merge` combines them into a single set:

```ts
const roleSets = activeRoles.map((role) => {
  const set = Properties.make();
  // ... define properties for this role ...
  return set;
});

const merged = Properties.merge(...roleSets);
Properties.toAtRules(merged); // all @property rules, deduplicated
```

Conflict resolution: `@property` rules are deduplicated by name — if two sets define the same property name with the same syntax/inherits, only one rule is emitted. Declarations use last-write-wins (later sets override earlier ones for the same property name), matching `Object.assign` semantics. In practice, the primary use case is combining `@property` rules across independently-built sets, where property names are already disjoint by design (namespaced per role).

### Expression construction — no changes

The functional expression builders (`add`, `multiply`, `pow`, `oklch`, etc.) and the expression classes (`NumberExpression`, `ColorExpression`) stay as-is. They're already well-designed:

- Pure functional construction
- Type-safe ref tracking
- Immutable `.bind()` returns new expressions
- `.solve()` for build-time evaluation
- `.toCss()` for standalone CSS generation (still useful for testing/debugging)

The standalone `property()` function is removed — its role is taken by `Properties.number` and `Properties.color`.

## Migration

### Before (current API)

```ts
const base = ct.declarations();

const hueInput = base.property(`${p}hue`, "number", true);
const lightnessInput = base.property("lightness", "number", true);
base.property("chroma", "number", true);

const maxChromaProp = base.property(
  `${p}mc`,
  maxChromaExpr.bind({ lightness: lightnessInput }),
);
base.property(
  output,
  ct.oklch("lightness", ct.multiply(maxChromaProp, "chroma"), hueInput),
  true,
);

base.toPropertyRules();
base.toSelector(baseSelector);
```

### After (new API, current single-base model)

```ts
import { Properties } from "@ok-apca/calc-tree";

const set = Properties.make();

const hueRef = Properties.number(set, `${p}hue`); // _ prefix → inherits: false
const lightnessInput = Properties.number(set, "lightness");
Properties.number(set, "chroma");

const maxChromaProp = Properties.number(
  set,
  `${p}mc`,
  maxChromaExpr.bind({ lightness: lightnessInput }),
);
Properties.color(
  set,
  output,
  ct.oklch("lightness", ct.multiply(maxChromaProp, "chroma"), hueRef),
);

Properties.toAtRules(set);
Properties.toRuleset(set, baseSelector);
```

### After (peer-colors, multiple roles)

```ts
import { Properties } from "@ok-apca/calc-tree";

const shared = Properties.make();

const lightnessInput = Properties.number(shared, "lightness");
Properties.number(shared, "chroma");

for (const role of activeRoles) {
  const roleBlock = Properties.make(shared);

  // Gamut constants — intermediates assigned by nested hue selectors
  const hueRef = Properties.number(roleBlock, `${p}${role.name}-hue`);
  // ... apexL, apexC, curvature, fA, fB, fD ...

  const mc = Properties.number(
    roleBlock,
    `${p}${role.name}-mc`,
    maxChromaExpr.bind({ lightness: lightnessInput }),
  );
  Properties.color(
    roleBlock,
    `${name}-${role.name}`,
    ct.oklch(lightnessInput, ct.multiply(mc, "chroma"), hueRef),
  );

  // contrast targets...

  roleSelectors.push(Properties.toRuleset(roleBlock, role.selector));
}

Properties.toAtRules(shared); // all @property rules, deduplicated
```

## Scope

### In scope

- Replace `DeclarationBlock` class with `Properties` namespace: `make()`, `number()`, `color()`, `numbers()`, `merge()`
- Replace `toPropertyRules()` / `toSelector()` methods with `Properties.toAtRules()` / `Properties.toRuleset()`
- Remove the standalone `property()` constructor function
- Add parent-child property set linking for `@property` sharing
- Update ok-apca `generator.ts` to use the new API

### Out of scope

- Expression construction API (`add`, `multiply`, etc.) — no changes
- Expression classes (`NumberExpression`, `ColorExpression`) — no changes
- `.bind()`, `.solve()`, `.toCss()` on expressions — no changes
- `formatNumber` — no changes

## Implementation plan

### 1. Implement `Properties` namespace

**File:** `packages/calc-tree/src/property.ts` (new)

- [ ] Define `PropertySet` type (opaque — internal structure not exposed)
- [ ] Implement `make(parent?)` — creates a property set, optionally linked to a parent
- [ ] Implement `number(set, name)` — registers `@property` rule with `syntax: '<number>'`, returns expression (input)
- [ ] Implement `number(set, name, expr)` — registers `@property` rule + declaration, returns expression (computed)
- [ ] Implement `color(set, name, expr)` — registers `@property` rule with `syntax: '<color>'` + declaration, returns expression
- [ ] Implement `numbers(set, values)` — batch `number` taking `Record<string, number | NumberExpression>`, no prefix support
- [ ] Implement `merge(...sets)` — combines multiple property sets into one (deduplicates `@property` rules, last-write-wins for declarations)
- [ ] Implement `toAtRules(set)` — renders deduplicated `@property` rules from set + children
- [ ] Implement `toRuleset(set, selector)` — renders set's declarations as selector block

### 2. Update exports

**File:** `packages/calc-tree/src/index.ts`

- [ ] Export `Properties` namespace (containing `make`, `number`, `color`, `numbers`, `merge`, `toAtRules`, `toRuleset`)
- [ ] Remove `declarations` export
- [ ] Remove standalone `property` export
- [ ] Keep `PropertyRule`, `CSSResult` type exports

### 3. Remove old code

**Files:** `packages/calc-tree/src/declarations.ts`, `packages/calc-tree/src/constructors.ts`

- [ ] Delete `DeclarationBlock` class and `declarations()` factory
- [ ] Remove standalone `property()` function from constructors
- [ ] Remove `PropertyNode` from nodes if it can be replaced (or keep as internal implementation detail for `input`/`intermediate`/`output`)

### 4. Update ok-apca generator

**File:** `packages/ok-apca/src/generator.ts`

- [ ] Migrate from `DeclarationBlock` to `Properties.make` + `Properties.number`/`Properties.color`
- [ ] Verify generated CSS is identical (snapshot test or diff)

### 5. Update tests

**Files:** `packages/calc-tree/test/**`

- [ ] Update unit tests for new API surface
- [ ] Verify expression construction tests unchanged
- [ ] Add tests for parent-child property set sharing
- [ ] Add tests for `toPropertyRules` deduplication

### 6. Update CLAUDE.md

- [ ] Update calc-tree architecture description
