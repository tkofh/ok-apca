# Optimization A: Pre-computed Correction Factor

**Estimated impact**: 7x reduction in `_yt` expansion (14x -> 2x multiplier)

## Problem

The Y-to-L correction pipeline for contrast colors creates a deep chain of intermediate properties that each reference the previous one multiple times:

```
_la  = pow(_yt, 1/3)                          -- 1 _yt ref
_ca  = maxChroma(_la) * chroma                 -- 1 _la ref
_fo  = 1 + A*k + B*k^2 + D*k^3  (k = _ca/_la) -- 3 _la refs (direct) + 3 _la refs (through _ca) = 6
_cl  = pow(_yt / _fo, 1/3)                     -- 1 _yt ref + 6 _yt refs (through _fo) = 7
```

Then `_cl` appears **twice** in the final oklch output (once for lightness, once in chroma via `maxChroma(_cl)`), giving 7 * 2 = **14x** total `_yt` references in the fully-expanded expression.

The k-polynomial `1 + A*k + B*k^2 + D*k^3` is the main culprit: it references k three times (for k, k^2, k^3), and each k = `_ca/_la` references `_la` and `_ca` once, with `_ca` itself referencing `_la` through `maxChroma`.

## Insight

The forward Y calculation in `buildYBackgroundExpr` already computes:

```
Y_bg = L^3 * (1 + fA*chroma + fB*chroma^2 + fD*chroma^3)
```

where fA, fB, fD are **build-time constants** derived from the hue's apex geometry (`correctionCoeffs` in `correction.ts`). This formula assumes the left-half gamut relationship where `k = (apexC / apexL) * chromaRatio`.

The inverse is simply:

```
L = (Y / f)^(1/3)   where   f = 1 + fA*chroma + fB*chroma^2 + fD*chroma^3
```

This uses the **same** polynomial with the **same** pre-computed constants. Crucially, `f` depends only on `chroma` (a leaf input), not on `_yt`.

## Why this is valid

- **Left half of gamut tent** (L < apexL): The relationship C = (apexC/apexL) * L * chromaRatio makes k = (apexC/apexL) * chromaRatio, which is exactly what the pre-computed fA, fB, fD encode. The inverse is **exact**.

- **Right half of gamut tent** (L > apexL): The actual k is smaller (the gamut boundary curves toward white, reducing chroma relative to lightness). Using the left-half k **overestimates** f slightly, which **underestimates** L by a small amount. But on the right half, chroma is smaller, so f is closer to 1 and the correction term itself is small. The error is bounded by the difference between left-half and right-half k values, which is proportional to the chroma correction (typically < 0.3% of L).

- **Internal consistency**: The same polynomial is used in both directions (forward Y_bg and inverse L), so errors partially cancel when measuring achieved contrast.

## Changes

### `generator.ts`

Replace `buildCorrectedLightness` with a simpler version that uses pre-computed correction coefficients:

```typescript
function buildCorrectedLightness(
    label: string,
    yTargetExpr: ct.CalcExpression<string>,
    slice: GamutSlice,
    coeffs: HueYCoefficients,
) {
    const { fA, fB, fD } = correctionCoeffs(slice, coeffs)

    // Pre-computed correction factor: depends only on chroma (a leaf input)
    const fExpr = ct.add(
        1,
        ct.multiply(fA, 'chroma'),
        ct.multiply(fB, ct.pow('chroma', 2)),
        ct.multiply(fD, ct.pow('chroma', 3)),
    )

    // Corrected lightness: L = pow(Y / f, 1/3)
    return ct.pow(ct.divide(yTargetExpr, fExpr), 1 / 3).asProperty(`_cl-${label}`)
}
```

Remove the `_la-${label}`, `_ca-${label}`, and `_fo-${label}` intermediate properties from `generatePropertyRules`.

### `generatePropertyRules`

Remove:
```typescript
numeric(`_la-${label}`),
numeric(`_ca-${label}`),
numeric(`_fo-${label}`),
```

## Expansion impact

After this change, `_cl` = `pow(_yt / f(chroma), 1/3)`:
- References `_yt` once
- References `chroma` three times (but `chroma` is a leaf -- just `var(--chroma)`)

`_cl` still appears twice in oklch (L and chroma computation):
- Total `_yt` references: **2** (down from 14)

This is the single largest win because it sits at the top of the multiplication chain. Every reference to `_yt` gets expanded into the full contrast solver expression, which itself contains hundreds of leaf references. Reducing from 14 to 2 divides the entire downstream expansion by 7.

## Accuracy expectations

- Achromatic colors (chroma = 0): No change (f = 1 in both old and new)
- Left-half colors (L < apexL): No change (exact match)
- Right-half colors (L > apexL): Small underestimate of L, proportional to chroma. Worst case ~0.3% L error at high chroma, decreasing toward zero at low chroma.

The parity tests should continue to pass within their existing tolerances.
