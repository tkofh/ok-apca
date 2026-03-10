# Optimization C: Lp-norm Soft Clamp in Measurement

**Estimated impact**: 2x reduction in _yl/_yd/_ybg refs through measurement expressions

## Problem

The contrast measurement expressions (`contrastMeasurementReverse`, `contrastMeasurementNormal`) use the true APCA soft black clamp:

```typescript
const softClampY = (y) =>
    ct.add(y, ct.pow(ct.max(0, ct.subtract(APCA_SMOOTH_THRESHOLD, y)), APCA_BLACK_CLAMP))
```

This references `y` **twice** -- once in the identity term `y`, once in `THRESHOLD - y`. Both `yBgClamped` and `yFgClamped` use this, so each measurement expression references its Y inputs 2x:

```
contrastMeasurementReverse:
    max(0, 1.14 * (softClampY(yFg)^0.62 - softClampY(yBg)^0.65) - 0.027)
    -- yFg: 2 refs, yBg: 2 refs
```

In the inversion path, these measurements are bound as:
- `_lcl` = measurement.bind({ yBg: `_ybg`, yFg: `_yl` }) -- 2 `_yl` refs, 2 `_ybg` refs
- `_lcd` = measurement.bind({ yBg: `_ybg`, yFg: `_yd` }) -- 2 `_yd` refs, 2 `_ybg` refs

Since `_lcl` and `_lcd` get expanded through the comparison/preference logic (see Optimization B), every extra ref at the measurement level gets multiplied many times over.

## Insight

The Lp-norm approximation `softClampApprox` is already used for the solver input and references Y exactly once:

```typescript
const softClampApprox = (y) =>
    ct.pow(ct.add(ct.pow(y, LP_SOFT_CLAMP_P), LP_SOFT_CLAMP_KP), LP_SOFT_CLAMP_INV_P)
```

The measurements are only used for **comparison** (which direction achieved higher contrast), not for precise absolute measurement. Since both the light and dark measurements would use the same approximation, the ranking is preserved: if the true clamp gives `lcLight > lcDark`, the Lp-norm clamp will also give `lcLight > lcDark` (the approximation is monotonic and applies equally to both).

## Changes

### `apca.ts`

Replace the true `softClampY` in the measurement expressions with `softClampApprox`:

```typescript
// Before:
const softClampY = <R extends string>(y: CalcExpression<R>) =>
    ct.add(y, ct.pow(ct.max(0, ct.subtract(APCA_SMOOTH_THRESHOLD, y)), APCA_BLACK_CLAMP))

const yBgClamped = softClampY(ct.toExpression('yBg'))
const yFgClamped = softClampY(ct.toExpression('yFg'))

// After:
const yBgClamped = softClampApprox(ct.toExpression('yBg'))
const yFgClamped = softClampApprox(ct.toExpression('yFg'))
```

The `softClampY` function can be removed if no other code uses it. The constants `APCA_SMOOTH_THRESHOLD` and `APCA_BLACK_CLAMP` may also become unused in `apca.ts` (check if the polarity solver still references them -- yes, the smoothing blend does via `APCA_SMOOTH_THRESHOLD`; `APCA_BLACK_CLAMP` may become unused here).

### Reference count after change

Each measurement references `yFg` and `yBg` **once** instead of twice:

```
contrastMeasurementReverse:
    max(0, 1.14 * (softClampApprox(yFg)^0.62 - softClampApprox(yBg)^0.65) - 0.027)
    -- yFg: 1 ref, yBg: 1 ref
```

In the inversion path:
- `_lcl`: `_yl` 1x (was 2x), `_ybg` 1x (was 2x)
- `_lcd`: `_yd` 1x (was 2x), `_ybg` 1x (was 2x)

## Interaction with other optimizations

After Optimization B (simplified comparison), `_lcl` and `_lcd` appear roughly 6 times each in the solver expression (through comparison + usePreference).

With this optimization:
- `_yl` refs from measurements: 6 * 1 = 6 (was 6 * 2 = 12)
- `_yd` refs from measurements: 6 * 1 = 6 (was 12)
- `_ybg` refs from measurements: 6 * 1 + 6 * 1 = 12 (was 24)

Plus direct references (_yl: 1, _yd: 1, _ybg: 1), the totals in `_yt`:
- `_yl`: 7 (was 13)
- `_yd`: 7 (was 13)
- `_ybg`: 13 (was 25)

Each `_yl` expands through `_ylr` (containing `_sc` 3x), so:
- `_sc` from `_yl`: 7 * 3 = 21 (was 13 * 3 = 39)
- `_sc` from `_yd`: 7 * 3 = 21 (was 39)
- Total `_sc`: 42 (was 78)

With Optimization A (2x multiplier from correction pipeline):
- Total `_sc` in final output: 42 * 2 = 84

Compare to current (no optimizations): ~200 * 14 = ~2,800. **That's a 33x reduction.**

## Accuracy analysis

The Lp-norm approximation was optimized for end-to-end Lc error (max ~0.25 Lc, avg ~0.01 Lc per the constants documentation). For comparison purposes, what matters is not absolute accuracy but whether the ranking `lcLight > lcDark` is preserved.

The Lp-norm approximation:
- Is monotonically increasing (preserves ordering)
- Closely tracks the true clamp (max error ~0.25 Lc)
- Applies identically to both directions (symmetric bias)

The only risk is if two measurements differ by less than ~0.5 Lc AND the Lp-norm bias pushes them across the boundary. But this is exactly the "near-tie" regime where the epsilon comparison (Optimization B) defers to user preference anyway. So the practical impact on behavior is negligible.

## Combined expansion summary (all three optimizations)

Starting from the final oklch output and working inward:

| Level | Current refs | Optimized refs | Reduction |
|---|---|---|---|
| `_yt` in oklch (via `_cl`) | 14 | 2 | 7x |
| `_yl` in `_yt` | ~33 | ~7 | ~5x |
| `_yd` in `_yt` | ~33 | ~7 | ~5x |
| `_sc` in `_yt` | ~200 | ~42 | ~5x |
| `_ybg` in `_yt` | ~265 | ~55 | ~5x |
| `_ybg` in final output | ~3,700 | ~110 | ~34x |
| `lightness` in final output | ~3,700 | ~110 | ~34x |
| `chroma` in final output | ~11,100 | ~340 | ~33x |
