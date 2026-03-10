# Optimization B: Simplified Comparison Logic

**Estimated impact**: 2x reduction in lcLight/lcDark expansion (16 -> 8 refs each)

## Problem

When the preferred contrast direction is exhausted, `contrastSolverWithInversion` falls back to comparing achieved contrasts (`lcLight` vs `lcDark`) to pick the better direction. The current comparison logic uses an epsilon-based tie-breaking system:

```typescript
const lcDiff = ct.subtract('lcLight', 'lcDark')

const outsideEpsilon = ct.subtract(
    1,
    ct.max(0, ct.sign(ct.subtract(COMPARISON_EPSILON, ct.abs(lcDiff)))),
)

const lightWins = ct.multiply(outsideEpsilon, ct.max(0, ct.sign(lcDiff)))
const darkWins = ct.multiply(outsideEpsilon, ct.max(0, ct.sign(ct.multiply(-1, lcDiff))))
const isTie = ct.subtract(1, ct.max(lightWins, darkWins))

const useLightComparison = ct.max(lightWins, ct.multiply(isTie, contrastPreferLight))
const useDarkComparison = ct.max(darkWins, ct.multiply(isTie, contrastPreferDark))
```

Each expression builds on the previous ones, and `lcDiff` (which contains both `lcLight` and `lcDark`) gets referenced at every level. Tracing through the DAG:

| Expression | lcLight refs | lcDark refs |
|---|---|---|
| `lcDiff` | 1 | 1 |
| `outsideEpsilon` | 1 (via lcDiff) | 1 |
| `lightWins` | 2 (outsideEpsilon + lcDiff) | 2 |
| `darkWins` | 2 | 2 |
| `isTie` | 4 (lightWins + darkWins) | 4 |
| `useLightComparison` | 6 (lightWins + isTie) | 6 |
| `useDarkComparison` | 6 | 6 |

Since both `useLightComparison` and `useDarkComparison` appear in the final expression (once each), and `usePreference` appears 4 times (twice per lerp, two lerps), the totals are:

- Through `useLightComparison` (1x): 6
- Through `useDarkComparison` (1x): 6
- Through `usePreference` (4x): 4 (1 ref each via `belowInvertThreshold`)
- **Total: 16 lcLight refs, 16 lcDark refs**

Each `lcLight`/`lcDark` then expands into a measurement expression containing `_yl`/`_yd` and `_ybg`, multiplying through the entire downstream chain.

## Insight

The epsilon and tie-breaking logic serves one purpose: when `lcLight` and `lcDark` are very close (within 0.5 Lc), fall back to the user's preferred direction rather than making an arbitrary choice.

A simpler approach achieves the same semantic: **add a tiny bias toward the preferred direction before comparing**. If the contrast difference is smaller than the bias, preference wins. If it's larger, the better direction wins.

```
preferBias = contrastPreferLight * 0.001 - contrastPreferDark * 0.001
useLightComparison = max(0, sign(lcLight - lcDark + preferBias))
useDarkComparison = max(0, sign(lcDark - lcLight - preferBias))
```

The bias of 0.001 (~0.1 Lc) is smaller than the current epsilon (0.005 = ~0.5 Lc), making the threshold tighter. But the key insight is that this is only reached when the preferred direction is exhausted -- an uncommon case -- and the behavior is semantically equivalent: small differences defer to preference.

## Changes

### `apca.ts`

Replace the comparison block (lines 167-181) with:

```typescript
const preferBias = ct.subtract(
    ct.multiply(contrastPreferLight, 0.001),
    ct.multiply(contrastPreferDark, 0.001),
)

const compDiff = ct.add(ct.subtract('lcLight', 'lcDark'), preferBias)
const useLightComparison = ct.max(0, ct.sign(compDiff))
const useDarkComparison = ct.max(0, ct.sign(ct.multiply(-1, compDiff)))
```

Remove `COMPARISON_EPSILON` from constants and imports (it's no longer needed).

### Reference count after change

| Expression | lcLight refs | lcDark refs |
|---|---|---|
| `compDiff` | 1 | 1 |
| `useLightComparison` | 1 (via compDiff) | 1 |
| `useDarkComparison` | 1 (via compDiff) | 1 |

Note: `useLightComparison` and `useDarkComparison` share the same `compDiff` node in the expression tree, but since the calc-tree serializes DAGs as trees (no node sharing in CSS), `compDiff` gets expanded twice -- once in each. So the actual counts are:

- Through `useLightComparison` (1x): 1 lcLight + 1 lcDark
- Through `useDarkComparison` (1x): 1 lcLight + 1 lcDark
- Through `usePreference` (4x): 4 lcLight + 4 lcDark
- **Total: 6 lcLight refs, 6 lcDark refs**

Wait -- the `compDiff` subtree contains `sign(lcLight - lcDark + bias)`. When referenced by `useDarkComparison` via `sign(-1 * compDiff)`, the expression tree embeds the full `compDiff` subtree inside `-1 * (...)`, then takes `sign(...)`. Let me re-examine.

Actually, `useDarkComparison = max(0, sign(-1 * compDiff))` embeds `compDiff` once. And `useLightComparison = max(0, sign(compDiff))` embeds `compDiff` once. These are separate positions in the tree, so `compDiff` (containing 1 lcLight + 1 lcDark) expands twice total = 2 lcLight + 2 lcDark from comparison.

Combined with usePreference (4x, 1 lcLight + 1 lcDark each = 4+4):

**Total: 6 lcLight + 6 lcDark** (down from 16 + 16).

Hmm, that's slightly less than the 8 I estimated initially because I was double-counting. The improvement is still significant: **16 -> 6 per variable** (2.7x reduction at this level).

## Edge case analysis

- **Normal operation** (preferred direction not exhausted): `usePreference = 1`, comparison weights are ignored. No behavioral change.
- **Exhausted, clear winner**: `sign(lcLight - lcDark + 0.001)` picks the higher contrast. Correct.
- **Exhausted, near-tie**: The 0.001 bias ensures the preferred direction wins when the difference is < 0.1 Lc. This is slightly tighter than the old 0.5 Lc epsilon, but both are well below perceptible contrast thresholds.
- **Exhausted, exact tie** (lcLight == lcDark): The bias breaks the tie toward preference. Correct.
- **Zero contrast**: Handled separately by `contrastIsZero`, unaffected by this change.
