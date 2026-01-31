# Automatic Contrast Inversion Plan

## Problem Statement

Currently, when a requested contrast value cannot be achieved in the desired polarity direction (e.g., requesting positive/light contrast on an already very light background), the result clamps to white (L=1) or black (L=0) and stops. This produces inadequate or zero contrast.

**Example scenarios where this occurs:**

- Positive contrast (+60) on L=0.95 background → result clamps to L=1.0, achieving minimal contrast
- Negative contrast (-60) on L=0.05 background → result clamps to L=0.0, achieving minimal contrast

The desired behavior is to **automatically invert polarity** when the primary direction cannot satisfy the contrast requirement, falling back to the opposite direction which may have more headroom.

---

## Current Architecture

### How Contrast Solving Works

The contrast solver in `expressions.ts` uses signed contrast values:

- **Positive contrast** → reverse polarity solver → lighter result (towards white)
- **Negative contrast** → normal polarity solver → darker result (towards black)

```typescript
// From createContrastSolver()
const signVal = ct.sign(signedContrast);
const preferLight = ct.max(0, signVal); // 1 if positive, 0 otherwise
const preferDark = ct.max(0, ct.multiply(-1, signVal)); // 1 if negative, 0 otherwise

return ct.clamp(
  0,
  preferLight * reverseExpr + preferDark * normalExpr + isZero * yBg,
  1,
);
```

The `clamp(0, ..., 1)` at the end handles out-of-gamut results by clamping to black/white, but this means we lose contrast when we hit the boundary.

### Key Files Involved

| File                                  | Role                                    |
| ------------------------------------- | --------------------------------------- |
| `packages/ok-apca/src/expressions.ts` | Expression trees for APCA solving       |
| `packages/ok-apca/src/generator.ts`   | CSS generation from expressions         |
| `packages/ok-apca/src/contrast.ts`    | Runtime JS contrast application         |
| `packages/ok-apca/src/apca.ts`        | JS wrappers around expression solvers   |
| `packages/ok-apca/src/constants.ts`   | Shared APCA constants                   |
| `packages/ok-apca/src/types.ts`       | Type definitions including `HueOptions` |

### The APCA Solver Equations

**Normal polarity** (dark text on light background):

```
Lc = 1.14 × (Y_bg^0.56 - Y_fg^0.57) - 0.027
```

Solving for Y_fg given Lc and Y_bg.

**Reverse polarity** (light text on dark background):

```
Lc = 1.14 × (Y_fg^0.62 - Y_bg^0.65) - 0.027
```

Solving for Y_fg given Lc and Y_bg.

---

## Design Decisions

The following decisions have been confirmed:

1. **Inversion is default behavior** with an opt-out option via `HueOptions.noContrastInversion`
2. **Polarity used is not exposed** in CSS output (no `--_polarity-{label}` property needed)
3. **Always maximize absolute contrast** - the signed input is a preference that only breaks ties when both directions achieve equal contrast

### Decision 3 Rationale

If a user requests +108 contrast on a 10% grey background:

- Light polarity: can achieve ~40 Lc before hitting white
- Dark polarity: can achieve ~100 Lc before hitting black

We should use **black** because it achieves higher absolute contrast (~100 Lc vs ~40 Lc). The user's light preference (+) is overridden because dark provides significantly better contrast.

The signed contrast value indicates a _preference_ that breaks ties, but maximizing contrast takes priority.

---

## CSS Expression Complexity Constraint

**Critical constraint**: The number of times a CSS custom property is **referenced** within an expression determines how many times it gets inlined when the browser resolves the value. This can cause exponential blowup that crashes DevTools.

**Example:**

```css
/* Bad: var(--x) referenced twice = --x's resolved value inlined twice */
--result: calc(var(--x) * var(--x));

/* Better: pow() only references --x once */
--result: pow(var(--x), 2);
```

This means:

- `.asProperty()` helps by extracting sub-expressions into named properties
- But if the **final expression** references a property multiple times, it still explodes
- The selection expression `useLight * Y_light + useDark * Y_dark` references `Y_light` and `Y_dark` once each — acceptable
- But computing `Lc_light` requires `Y_light`, and then using `Y_light` again in the final selection = **two references = explosion**

### Reference Count Analysis

The naive approach has this reference pattern:

```
Y_light ──┬── Lc_light ──── comparison
          └── final selection (useLight * Y_light)

Y_dark  ──┬── Lc_dark ──── comparison
          └── final selection (useDark * Y_dark)
```

Each Y value is referenced **twice**: once for contrast measurement, once for output. This doubles the resolved expression size.

---

## Proposed Solution: Single-Reference Architecture

### Key Insight

We need to restructure so each intermediate value is referenced **exactly once** in subsequent expressions.

**Strategy**: Instead of selecting between Y values at the end, compute the **final Y** in a way that only references each intermediate once.

### Approach: Contrast Difference Selection

Instead of:

1. Compute `Y_light`, `Y_dark`
2. Compute `Lc_light` (uses Y_light), `Lc_dark` (uses Y_dark)
3. Compare `Lc_light` vs `Lc_dark`
4. Select `Y_light` or `Y_dark` (references them again!)

We can:

1. Compute `Y_light`, `Y_dark` → store as properties
2. Compute `Lc_light`, `Lc_dark` → store as properties (each Y referenced once)
3. Compute `Lc_diff = Lc_light - Lc_dark` → store as property
4. Compute final Y using the **difference** to blend:

```typescript
// If Lc_light > Lc_dark: use Y_light (lightWins = 1, darkWins = 0)
// If Lc_dark > Lc_light: use Y_dark (lightWins = 0, darkWins = 1)
// Tie: use preference

const Lc_diff = Lc_light - Lc_dark; // property: --_Lc-diff

// Selection flags (each Lc value referenced once total)
const lightWins = max(0, sign(Lc_diff)); // references Lc_diff once
const darkWins = max(0, sign(-Lc_diff)); // references Lc_diff... wait, this is twice!
```

**Problem**: Even `sign(Lc_diff)` and `sign(-Lc_diff)` reference `Lc_diff` twice.

### Approach: Pre-compute Selection Flag

```typescript
// Store the sign as a property
const Lc_diff = (Lc_light - Lc_dark).asProperty("_Lc-diff");
const diffSign = sign(Lc_diff).asProperty("_diff-sign"); // -1, 0, or 1

// Now we can derive flags from diffSign (referenced once each time)
const lightWins = max(0, diffSign); // 1 if light > dark
const darkWins = max(0, -diffSign); // 1 if dark > light  -- references diffSign once
const isTie = 1 - abs(diffSign); // 1 if equal -- references diffSign once

// But wait, we're still referencing diffSign multiple times!
```

**Problem persists**: We need `lightWins`, `darkWins`, and `isTie`, which all derive from the same sign value.

### Approach: Fold Selection into Y Computation

What if we compute the result directly from the diff sign without separate flags?

```typescript
const Lc_diff = (Lc_light - Lc_dark).asProperty("_Lc-diff");
const diffSign = sign(Lc_diff).asProperty("_diff-sign"); // -1, 0, or 1

// For ties (diffSign = 0), we need preference
const preferLight = max(0, sign(signedContrast)).asProperty("_prefer-light"); // 0 or 1

// Compute a single "use light" coefficient:
// - If diffSign > 0: use light (diffSign = 1)
// - If diffSign < 0: use dark (diffSign = -1)
// - If diffSign = 0: use preference

// useLight = 1 when we should use light, 0 otherwise
// useLight = max(0, diffSign) + (1 - abs(diffSign)) * preferLight
//          = max(0, diffSign) + isTie * preferLight

// But this still references diffSign twice (once in max, once in abs)
```

### Approach: Separate Properties for Each Flag

The most explicit solution: compute each flag as its own property, accepting that we reference `diffSign` in each, but then each flag is only referenced once downstream.

```typescript
const Lc_diff = (Lc_light - Lc_dark).asProperty("_Lc-diff");

// These all reference Lc_diff, but Lc_diff is a simple subtraction
const lightWins = max(0, sign(Lc_diff)).asProperty("_light-wins");
const darkWins = max(0, sign(ct.multiply(-1, Lc_diff))).asProperty(
  "_dark-wins",
);

// For tie-breaking
const preferLight = max(0, sign(signedContrast)).asProperty("_prefer-light");
const preferDark = max(0, sign(ct.multiply(-1, signedContrast))).asProperty(
  "_prefer-dark",
);

const isTie = ct.subtract(1, max(lightWins, darkWins)).asProperty("_is-tie");

// Final selection - each flag and Y referenced exactly once
const useLight = max(lightWins, ct.multiply(isTie, preferLight)).asProperty(
  "_use-light",
);
const useDark = max(darkWins, ct.multiply(isTie, preferDark)).asProperty(
  "_use-dark",
);

// Y_light and Y_dark each referenced exactly once here
const result = ct.add(
  ct.add(ct.multiply(useLight, Y_light), ct.multiply(useDark, Y_dark)),
  ct.multiply(isZero, yBg),
);
```

**Reference analysis:**

- `Lc_diff` referenced 2× (in lightWins and darkWins) — but Lc_diff is a simple `Lc_light - Lc_dark`
- `Lc_light` referenced 1× (in Lc_diff)
- `Lc_dark` referenced 1× (in Lc_diff)
- `Y_light` referenced 1× (in Lc_light computation) + 1× (in result) = **2× total** ❌

**Still a problem**: Y values are still referenced twice — once for contrast measurement, once for final output.

---

## Alternative Approach: Precomputed Crossover Threshold

Since the core problem is that we need Y values both to measure contrast AND to output, let's avoid measuring contrast entirely.

**Key insight**: For a given `|Lc|` and `Y_bg`, we can determine which polarity achieves more contrast by comparing `Y_bg` against a **crossover threshold** — the Y_bg value where both polarities achieve equal contrast.

### Mathematical Derivation

At the crossover point, both polarities achieve the same contrast:

```
Lc_light(Y_bg, Y_light) = Lc_dark(Y_bg, Y_dark)
```

Where:

- `Y_light = reverseSolver(Y_bg, |Lc|)` — might exceed 1
- `Y_dark = normalSolver(Y_bg, |Lc|)` — might go below 0

When one direction is clamped (hits black or white), its achieved contrast is reduced. The crossover occurs where:

- Achievable contrast going light = Achievable contrast going dark

### Simplified Threshold

For high contrast values (which is when inversion matters most), the crossover is approximately at `Y_bg ≈ 0.5` (mid-grey). Below mid-grey, dark has more room; above mid-grey, light has more room.

But this is too simplistic — the actual crossover depends on `|Lc|`.

### Build-Time Threshold Computation

Since hue is fixed at build time, we can:

1. **Precompute a threshold function** `T(|Lc|)` that returns the Y_bg crossover point
2. **Encode this as a simple expression** in CSS, e.g., `T(x) ≈ a + b*x + c*x²`
3. **Compare** `Y_bg` against `T(|Lc|)` to determine if we should invert

**In CSS:**

```typescript
const threshold = computeThreshold(absContrast); // e.g., 0.4 + 0.003 * absContrast
const shouldInvert = sign(Y_bg - threshold); // > 0 means light has less room

// If preferring light but shouldInvert > 0, flip to dark
// If preferring dark but shouldInvert < 0, flip to light
```

This avoids computing both Y values entirely when not needed!

### Hybrid Approach

Actually, we still need to compute the selected Y value. But we only compute **one** solver, not both:

```typescript
const threshold = computeThreshold(absContrast).asProperty('_threshold')
const aboveThreshold = max(0, sign(yBg - threshold)).asProperty('_above-threshold')
const belowThreshold = max(0, sign(threshold - yBg)).asProperty('_below-threshold')

// Determine effective polarity (may be inverted from preference)
// If preferLight and aboveThreshold: invert to dark
// If preferDark and belowThreshold: invert to light
const effectiveLight = /* complex logic */
const effectiveDark = /* complex logic */

// Only compute ONE solver based on effective polarity
const result = effectiveLight * reverseSolver + effectiveDark * normalSolver
```

**Problem**: We still need both solvers in the expression, just weighted differently. The current architecture already does this.

### True Single-Solver Approach

The only way to avoid explosion is to **not include both solvers in the same expression tree**. This would require:

1. Generate **two separate CSS rules** — one for each polarity
2. Use a **CSS selector** or **@container** query to switch between them

This is architecturally complex and may not be feasible with the current approach.

---

## Chosen Approach: Dual-Computation with 2× Expansion

Based on prior experience (previous iterations of the expression were ~2× larger when fully resolved), a 2× expansion is acceptable.

### Architecture

1. **Compute both polarity solutions** as separate properties
2. **Clamp both** to gamut [0, 1]
3. **Measure achieved contrast** for both (simplified APCA, no smoothing needed for comparison)
4. **Compare and select** based on max contrast, preference breaks ties

### Property Chain

```
yBg (input)
  ├─→ Y_light (reverseSolver, clamped) ──┬──→ Lc_light ──→ comparison
  │                                      └──→ result
  └─→ Y_dark (normalSolver, clamped)   ──┬──→ Lc_dark ──→ comparison
                                         └──→ result
```

Each Y value is referenced twice:

1. Once for contrast measurement (`Lc_light` / `Lc_dark`)
2. Once for final output selection

This results in 2× expansion of each solver expression, which is within acceptable bounds.

### New Intermediate Properties (per contrast label)

| Property              | Description                   |
| --------------------- | ----------------------------- |
| `--_Y-light-{label}`  | Clamped light polarity result |
| `--_Y-dark-{label}`   | Clamped dark polarity result  |
| `--_Lc-light-{label}` | Achieved contrast for light   |
| `--_Lc-dark-{label}`  | Achieved contrast for dark    |
| `--_Y-target-{label}` | Selected Y value (existing)   |

Total: 4 new properties per contrast label.

### Simplified Contrast Measurement

For comparison purposes, we use a simplified APCA formula without low-contrast smoothing:

```typescript
// Reverse polarity (light result): Y_fg > Y_bg
function measureReverseContrast(yBg, yFg) {
  return max(0, 1.14 * (pow(yFg, 0.62) - pow(yBg, 0.65)) - 0.027);
}

// Normal polarity (dark result): Y_fg < Y_bg
function measureNormalContrast(yBg, yFg) {
  return max(0, 1.14 * (pow(yBg, 0.56) - pow(yFg, 0.57)) - 0.027);
}
```

### Selection Logic

```typescript
// Compare achieved contrasts
const Lc_diff = Lc_light - Lc_dark;
const lightWins = max(0, sign(Lc_diff)); // 1 if light achieves more
const darkWins = max(0, sign(-Lc_diff)); // 1 if dark achieves more
const isTie = 1 - max(lightWins, darkWins); // 1 if equal

// Preference for tie-breaking
const preferLight = max(0, sign(signedContrast));
const preferDark = max(0, -sign(signedContrast));
const isZero = 1 - max(preferLight, preferDark);

// Final selection: winner takes all, ties use preference
const useLight = max(lightWins, isTie * preferLight);
const useDark = max(darkWins, isTie * preferDark);

const result = useLight * Y_light + useDark * Y_dark + isZero * yBg;
```

---

## API Changes

### New Option in `HueOptions`

```typescript
export interface HueOptions {
  readonly hue: number;
  readonly selector: string;
  readonly contrastColors?: readonly ContrastColor[];
  readonly output?: string;
  readonly inputMode?: InputMode;
  /**
   * Disables automatic contrast polarity inversion.
   *
   * By default, when the preferred polarity direction cannot achieve as much
   * contrast as the opposite direction, the system automatically inverts to
   * maximize contrast. Set this to `true` to always use the preferred polarity
   * direction, clamping to black/white if necessary.
   *
   * @default false
   */
  readonly noContrastInversion?: boolean;
}
```

### Updated `HueDefinition`

```typescript
export interface HueDefinition {
  readonly hue: number;
  readonly selector: string;
  readonly output: string;
  readonly contrastColors: readonly ContrastColor[];
  readonly inputMode: InputMode;
  readonly noContrastInversion: boolean;
}
```

---

## Implementation Plan

### Phase 1: Update Types

**File: `packages/ok-apca/src/types.ts`**

1. Add `noContrastInversion?: boolean` to `HueOptions`
2. Add `noContrastInversion: boolean` to `HueDefinition`

### Phase 2: Update Expression Trees

**File: `packages/ok-apca/src/expressions.ts`**

1. Add `createContrastMeasurementReverse()` - simplified APCA for light-on-dark
2. Add `createContrastMeasurementNormal()` - simplified APCA for dark-on-light
3. Rename existing `createContrastSolver()` to `createContrastSolverSimple()`
4. Create `createContrastSolverWithInversion()` that:
   - Computes both raw Y values
   - Clamps both
   - Measures achieved contrast for both
   - Selects based on max contrast with preference tie-breaking

### Phase 3: Update Generator

**File: `packages/ok-apca/src/generator.ts`**

1. Add new intermediate property names to `vars` object:
   - `yLight(label)`, `yDark(label)` (clamped solver results)
   - `lcLight(label)`, `lcDark(label)` (achieved contrast)
2. Update `generatePropertyRules()` to declare new properties when inversion enabled
3. Update `buildContrastColorExpr()` to use new solver based on `noContrastInversion` flag
4. Use `.asProperty()` for all intermediate values

### Phase 4: Update `defineHue`

**File: `packages/ok-apca/src/index.ts`**

1. Accept `noContrastInversion` option (default `false`)
2. Pass to `HueDefinition`

### Phase 5: Update Runtime Functions

**File: `packages/ok-apca/src/apca.ts`**

1. Add `invert` parameter to `solveTargetY()` (default `true`)
2. Implement equivalent selection logic in JS

**File: `packages/ok-apca/src/contrast.ts`**

1. Add `invert` parameter to `applyContrast()` (default `true`)

### Phase 6: Update Tests

**Files in `packages/ok-apca/test/`**

1. Add tests for inversion scenarios
2. Add tests verifying `noContrastInversion: true` preserves old behavior
3. Update parity tests
4. Add CSS size/complexity regression test

### Phase 7: Update Playground

**File: `packages/playground/app/app.vue`**

1. Add checkbox for `noContrastInversion` option

---

## Expected Behavior After Implementation

### With `noContrastInversion: false` (default)

| Background L | Signed Contrast | Current Behavior                | New Behavior                                |
| ------------ | --------------- | ------------------------------- | ------------------------------------------- |
| 0.5          | +60             | L ≈ 0.85 (lighter)              | L ≈ 0.85 (lighter) - unchanged              |
| 0.5          | -60             | L ≈ 0.15 (darker)               | L ≈ 0.15 (darker) - unchanged               |
| 0.9          | +60             | L = 1.0 (clamped, low contrast) | L ≈ 0.35 (inverted to dark, more contrast)  |
| 0.1          | -60             | L = 0.0 (clamped, low contrast) | L ≈ 0.65 (inverted to light, more contrast) |
| 0.95         | +30             | L = 1.0 (clamped)               | L ≈ 0.55 (inverted to dark, more contrast)  |
| 0.05         | -30             | L = 0.0 (clamped)               | L ≈ 0.45 (inverted to light, more contrast) |
| 0.1          | +108            | L = 1.0 (clamped, ~40 Lc)       | L = 0.0 (inverted to black, ~100 Lc)        |

### With `noContrastInversion: true`

Behavior identical to current implementation - always use preferred polarity, clamp to gamut.

---

## Success Criteria

1. **Contrast is maximized**: The polarity that achieves higher absolute contrast is always selected
2. **Preference breaks ties**: When both polarities achieve equal contrast, the signed input determines direction
3. **Parity maintained**: JS and CSS implementations produce identical results
4. **Backwards compatible**: `noContrastInversion: true` produces identical behavior to current implementation
5. **Opt-out available**: Users can disable inversion via `HueOptions.noContrastInversion`
6. **Gamut safe**: All results remain within the valid Y range [0, 1]
7. **CSS complexity bounded**: Resolved CSS expressions don't crash DevTools; each intermediate value referenced minimally
