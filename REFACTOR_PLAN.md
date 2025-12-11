# Refactor Plan: Signed Contrast Variable

## Overview

Refactor the contrast API from four discrete `ContrastMode` values to a signed contrast variable in the range `[-108, 108]` with a boolean flag for polarity inversion.

**Benefits:**
- Simpler CSS generation (one block instead of mode-specific variants)
- Smaller build output (no mode duplication)
- Runtime flexibility (change polarity without regenerating CSS)
- Clearer API (sign convention is more intuitive)
- No CSS complexity explosion

## Current API

```typescript
type ContrastMode = 'force-light' | 'prefer-light' | 'prefer-dark' | 'force-dark'

interface ContrastOptions {
  readonly mode: ContrastMode
  readonly selector?: string
}

function applyContrast(color: Color, contrast: number, mode: ContrastMode): Color
```

**CSS Input:**
- `--contrast` (0-108): Unsigned contrast value
- Mode baked into CSS at build time

## New API

```typescript
interface ContrastOptions {
  /** Allow polarity inversion if preferred polarity is out of gamut */
  readonly allowPolarityInversion: boolean
  readonly selector?: string
}

function applyContrast(
  color: Color, 
  contrast: number, // -108 to 108 (signed)
  allowPolarityInversion: boolean
): Color
```

**CSS Input:**
- `--contrast` (-108 to 108): Signed contrast value
  - Positive: Normal polarity (darker text on light background)
  - Negative: Reverse polarity (lighter text on dark background)
- `--allow-polarity-inversion` (0 or 1): Boolean flag

**Migration Mapping:**
- `force-light` → `contrast: -60, allowPolarityInversion: false`
- `force-dark` → `contrast: 60, allowPolarityInversion: false`
- `prefer-light` → `contrast: -60, allowPolarityInversion: true`
- `prefer-dark` → `contrast: 60, allowPolarityInversion: true`

## Implementation Phases

### Phase 1: Type Updates

**Files:**
- `packages/ok-apca/src/types.ts`

**Changes:**

1. Remove `ContrastMode` type
2. Update `ContrastOptions`:
   ```typescript
   export interface ContrastOptions {
     /** Allow polarity inversion if preferred polarity is out of gamut */
     readonly allowPolarityInversion: boolean
     /**
      * CSS selector for the contrast variant.
      * Use `&` prefix for nesting (e.g., `'&.contrast'`).
      * @default '&.contrast'
      */
     readonly selector?: string
   }
   ```

### Phase 2: APCA Solver Updates

**Files:**
- `packages/ok-apca/src/apca.ts`

**Changes:**

1. Update `solveTargetY()` signature and implementation:
   ```typescript
   /**
    * Solve for target Y based on signed contrast value.
    * 
    * @param Y - Base luminance (0-1)
    * @param signedContrast - Target APCA Lc value, signed (-108 to 108)
    *   - Positive: Normal polarity (darker text)
    *   - Negative: Reverse polarity (lighter text)
    * @param apcaT - APCA threshold for Bézier smoothing
    * @param allowPolarityInversion - Allow fallback to opposite polarity if preferred is out of gamut
    * @returns Target luminance Y value
    */
   export function solveTargetY(
     Y: number,
     signedContrast: number,
     apcaT: number,
     allowPolarityInversion: boolean
   ): number {
     const x = Math.abs(signedContrast) / 100
     const preferLight = signedContrast < 0
     
     // Solve for preferred polarity
     const preferred = preferLight 
       ? solveApcaReverse(Y, x, apcaT)
       : solveApcaNormal(Y, x, apcaT)
     
     if (preferred.inGamut || !allowPolarityInversion) {
       return preferred.targetY
     }
     
     // Fallback to opposite polarity
     const fallback = preferLight
       ? solveApcaNormal(Y, x, apcaT)
       : solveApcaReverse(Y, x, apcaT)
     
     if (fallback.inGamut) {
       return fallback.targetY
     }
     
     // Both out of gamut - choose whichever achieves higher contrast
     const contrastPreferred = estimateContrast(Y, preferred.targetY)
     const contrastFallback = estimateContrast(Y, fallback.targetY)
     return contrastPreferred >= contrastFallback ? preferred.targetY : fallback.targetY
   }
   ```

2. Remove now-unused functions:
   - `solvePreferLight()`
   - `solvePreferDark()`

### Phase 3: Contrast Function Updates

**Files:**
- `packages/ok-apca/src/contrast.ts`

**Changes:**

1. Update `applyContrast()` signature and implementation:
   ```typescript
   /**
    * Compute a contrast color that achieves the target APCA contrast value.
    *
    * This function uses the same simplified Y = L³ approximation as the CSS generator
    * to accurately predict CSS behavior.
    *
    * @param color - The requested color (may be out of gamut)
    * @param signedContrast - Target APCA Lc value (-108 to 108)
    *   - Positive: Normal polarity (darker text)
    *   - Negative: Reverse polarity (lighter text)
    * @param allowPolarityInversion - Allow fallback to opposite polarity if out of gamut
    * @returns The contrast color, gamut-mapped to the Display P3 boundary
    */
   export function applyContrast(
     color: Color,
     signedContrast: number,
     allowPolarityInversion: boolean
   ): Color {
     const { hue, chroma: requestedChroma } = color
     
     // Clamp contrast to valid APCA range
     const clampedContrast = Math.max(-108, Math.min(108, signedContrast))
     
     // Gamut-map the input to get the base color for APCA calculations
     const baseColor = gamutMap(color)
     const L = baseColor.lightness
     const C = baseColor.chroma
     
     // Simplified Y approximation to match CSS generator (Y = L³)
     const Y = L ** 3
     
     // APCA threshold for Bézier smoothing
     const apcaT = 0.022
     
     // Solve for target Y
     const targetY = solveTargetY(Y, clampedContrast, apcaT, allowPolarityInversion)
     
     // Recover L from target Y using cube root (inverse of Y = L³)
     const contrastL = Math.max(0, Math.min(1, targetY ** (1 / 3)))
     
     // Compute contrast chroma: average of gamut-mapped and requested
     const contrastC = (C + requestedChroma) / 2
     
     // Gamut-map the result at the new lightness
     return gamutMap(new ColorImpl(hue, contrastC, contrastL))
   }
   ```

### Phase 4: CSS Generator Refactor

**Files:**
- `packages/ok-apca/src/generator.ts`

**Changes:**

1. Update `generateContrastCss()` signature:
   ```typescript
   function generateContrastCss(
     selector: string,
     contrastSelector: string,
     hue: number,
     boundary: GamutBoundary,
     allowPolarityInversion: boolean
   ): string
   ```

2. Replace mode-specific CSS generation with unified approach:
   ```typescript
   function generateContrastCss(
     selector: string,
     contrastSelector: string,
     hue: number,
     boundary: GamutBoundary,
     allowPolarityInversion: boolean
   ) {
     const lMax = formatNumber(boundary.lMax)
     const cPeak = formatNumber(boundary.cPeak)
     
     // Fit heuristic coefficients (will need updating - see Phase 6)
     const { coefficients } = fitHeuristicCoefficients(hue, allowPolarityInversion)
     
     // Heuristic correction CSS
     const heuristicCss = generateHeuristicCss(coefficients)
     
     return outdent`
       ${selector}${contrastSelector} {
         /* Runtime inputs: --contrast (-108 to 108), --allow-polarity-inversion (0 or 1) */
         ${heuristicCss}
         
         --_contrast-signed: clamp(-108, var(--contrast), 108);
         --_lc-norm: calc(abs(${V_CONTRAST_SIGNED}) / 100);
         --_use-light: sign(${V_CONTRAST_SIGNED} - 0.0001); /* -1 if negative, 1 if positive, 0 if zero */
         
         /* Simplified L to luminance Y (ignoring chroma contribution) */
         --_Y-bg: pow(${V_LUM_NORM}, 3);
         
         /* APCA threshold for Bezier smoothing */
         --_smooth-t: 0.022;
         --_ep: 0.0001;
         
         /* Always compute both polarities */
         ${generateNormalPolarityCss()}
         
         ${generateReversePolarityCss()}
         
         /* Select preferred polarity based on contrast sign */
         /* use-light: 1 if negative (light text), 0 if positive (dark text) */
         --_prefer-light: ${cssBooleanFlag(`-1 * ${V_USE_LIGHT}`)};
         --_prefer-dark: ${cssBooleanFlag(V_USE_LIGHT)};
         
         --_Y-preferred: calc(
           ${V_PREFER_LIGHT} * ${V_Y_LIGHT} +
           ${V_PREFER_DARK} * ${V_Y_DARK}
         );
         
         --_preferred-ok: calc(
           ${V_PREFER_LIGHT} * ${V_LIGHT_OK} +
           ${V_PREFER_DARK} * ${V_DARK_OK}
         );
         
         /* Fallback polarity (opposite of preferred) */
         --_Y-fallback: calc(
           ${V_PREFER_LIGHT} * ${V_Y_DARK} +
           ${V_PREFER_DARK} * ${V_Y_LIGHT}
         );
         
         --_fallback-ok: calc(
           ${V_PREFER_LIGHT} * ${V_DARK_OK} +
           ${V_PREFER_DARK} * ${V_LIGHT_OK}
         );
         
         /* Best contrast fallback when both are out of gamut */
         /* Estimate contrast for each polarity using APCA formulas */
         --_lc-dark: ${cssApcaNormalContrast(V_Y_BG, V_Y_DARK)};
         --_lc-light: ${cssApcaReverseContrast(V_Y_BG, V_Y_LIGHT)};
         --_Y-best: ${cssBestContrastFallback(V_Y_DARK, V_Y_LIGHT, V_LC_DARK, V_LC_LIGHT)};
         
         /* Final Y selection */
         --_Y-final: calc(
           /* Use preferred if in gamut */
           ${V_PREFERRED_OK} * clamp(0, ${V_Y_PREFERRED}, 1) +
           /* Use fallback if preferred out of gamut and inversion allowed */
           (1 - ${V_PREFERRED_OK}) * var(--allow-polarity-inversion) * ${V_FALLBACK_OK} * clamp(0, ${V_Y_FALLBACK}, 1) +
           /* Use best contrast if both out of gamut and inversion allowed */
           (1 - ${V_PREFERRED_OK}) * var(--allow-polarity-inversion) * (1 - ${V_FALLBACK_OK}) * clamp(0, ${V_Y_BEST}, 1) +
           /* Force preferred if inversion not allowed (even if out of gamut) */
           (1 - ${V_PREFERRED_OK}) * (1 - var(--allow-polarity-inversion)) * clamp(0, ${V_Y_PREFERRED}, 1)
         );
         
         /* Contrast lightness from cube root (inverse of Y = L³) */
         --_con-lum: clamp(0, pow(${V_Y_FINAL}, 1 / 3), 1);
         
         /* Gamut-map contrast color's chroma */
         --_con-tent: ${cssTentFunction(V_CON_LUM, lMax)};
         --_con-chr: min(
           calc((${V_CHR} + ${V_CHR_REQ}) / 2),
           calc(${cPeak} * ${V_CON_TENT})
         );
         
         /* Output contrast color */
         --o-color-contrast: oklch(${V_CON_LUM} ${V_CON_CHR} ${hue});
       }
     `
   }
   ```

3. Add new CSS variable constants:
   ```typescript
   const V_CONTRAST_SIGNED = 'var(--_contrast-signed)'
   const V_USE_LIGHT = 'var(--_use-light)'
   const V_PREFER_LIGHT = 'var(--_prefer-light)'
   const V_PREFER_DARK = 'var(--_prefer-dark)'
   const V_Y_PREFERRED = 'var(--_Y-preferred)'
   const V_PREFERRED_OK = 'var(--_preferred-ok)'
   const V_Y_FALLBACK = 'var(--_Y-fallback)'
   const V_FALLBACK_OK = 'var(--_fallback-ok)'
   ```

4. Remove now-unused function:
   - `generateTargetYCss(mode: ContrastMode)` - logic now inline

5. Update `generateColorCss()`:
   ```typescript
   if (options.contrast) {
     const contrastSelector = options.contrast.selector ?? '&.contrast'
     
     css += `\n\n${generateContrastCss(
       options.selector,
       contrastSelector.startsWith('&') ? contrastSelector.slice(1) : ` ${contrastSelector}`,
       hue,
       boundary,
       options.contrast.allowPolarityInversion
     )}`
   }
   ```

### Phase 5: Test Updates

**Files:**
- `packages/ok-apca/test/contrast.spec.ts`
- `packages/ok-apca/test/heuristic.spec.ts` (if exists)

**Changes:**

1. Update all `applyContrast()` calls to use signed contrast:
   ```typescript
   // Old: applyContrast(color, 60, 'force-light')
   // New: applyContrast(color, -60, false)
   
   // Old: applyContrast(color, 60, 'force-dark')
   // New: applyContrast(color, 60, false)
   
   // Old: applyContrast(color, 60, 'prefer-light')
   // New: applyContrast(color, -60, true)
   
   // Old: applyContrast(color, 60, 'prefer-dark')
   // New: applyContrast(color, 60, true)
   ```

2. Update test descriptions to reflect new API

3. Add new tests for signed contrast behavior:
   - Negative values produce lighter text
   - Positive values produce darker text
   - Sign flipping produces opposite polarity
   - `allowPolarityInversion` flag behavior

4. Update integration test loops:
   ```typescript
   const testConfigs = [
     { allowInversion: false, polarity: 'light' },
     { allowInversion: false, polarity: 'dark' },
     { allowInversion: true, polarity: 'light' },
     { allowInversion: true, polarity: 'dark' },
   ]
   
   for (const config of testConfigs) {
     describe(`allowInversion: ${config.allowInversion}, polarity: ${config.polarity}`, () => {
       const signedContrast = config.polarity === 'light' ? -60 : 60
       
       it('achieves target contrast within reasonable tolerance', () => {
         const input = { hue: 30, chroma: 0.1, lightness: 0.5 }
         const baseColor = gamutMap(input)
         const contrastColor = applyContrast(input, signedContrast, config.allowInversion)
         const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))
         
         expect(Math.abs(actualContrast - Math.abs(signedContrast))).toBeLessThan(40)
       })
     })
   }
   ```

### Phase 6: Heuristic Coefficient Updates

**Files:**
- `packages/ok-apca/src/heuristic.ts`

**Changes:**

1. Update `fitHeuristicCoefficients()` signature:
   ```typescript
   export function fitHeuristicCoefficients(
     hue: number,
     allowPolarityInversion: boolean
   ): { coefficients: HeuristicCoefficients }
   ```

2. Re-fit coefficients:
   - Since we're moving from 4 modes to 2 polarity types × 2 inversion flags
   - May only need to fit for polarity (light vs dark) if inversion flag doesn't affect accuracy
   - This requires empirical testing and re-running the fitting process

**NOTE:** This phase can be deferred until the end as it's an optimization. The refactor will work without updated heuristics, just with less accuracy.

### Phase 7: Documentation Updates

**Files:**
- `packages/ok-apca/README.md`
- `CLAUDE.md` (if needed)

**Changes:**

1. Update API examples to use signed contrast
2. Update mode table to show migration mapping
3. Update CSS variable documentation
4. Add explanation of polarity sign convention

## Testing Strategy

1. Run existing tests with updated API calls to ensure no regressions
2. Add specific tests for:
   - Signed contrast values
   - Polarity inversion flag behavior
   - Edge cases (contrast = 0, sign boundaries)
3. Visual testing in playground to verify CSS output
4. Compare output between old and new implementation for equivalence

## Rollout

Since the library is unreleased:
1. Implement all phases in sequence
2. Defer Phase 6 (heuristic re-fitting) until the end
3. Update all examples and documentation
4. No migration guide needed (no existing users)

## Success Criteria

- [ ] All existing tests pass with updated API
- [ ] New tests for signed contrast behavior pass
- [ ] Generated CSS is simpler/smaller than before
- [ ] Visual playground demonstrates correct polarity selection
- [ ] Documentation updated with new API
- [ ] Heuristic coefficients re-fitted (deferred to end)
