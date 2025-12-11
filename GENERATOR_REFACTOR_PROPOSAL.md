# CSS Generator Refactoring Proposal

## Overview

This proposal outlines improvements to `generator.ts` focused on:
1. **Variable naming clarity** - Expanding cryptic abbreviations to self-documenting names
2. **Code organization** - Extracting common CSS patterns into reusable template functions
3. **Maintainability** - Making the complex APCA math more approachable

## Variable Naming Improvements

### Current Problems
- `--_l`, `--_c`, `--_x`, `--_y` are cryptic single-letter variables
- `--_xn`, `--_xr` don't clearly indicate "normal polarity Y" vs "reverse polarity Y"
- `--_ep` is unclear (epsilon for gamut checking)
- `--_apca-t` could be clearer about being a threshold

### Proposed Renames

#### Base Color Variables
```
--_l              → --_lum-norm      (lightness normalized 0-1)
--_c-req          → --_chr-req       (chroma requested, keep abbreviated)
--_c              → --_chr           (chroma gamut-mapped)
--_L-MAX          → --_lum-max       (gamut lightness maximum)
--_C-PEAK         → --_chr-peak      (gamut chroma peak)
--_tent           → --_tent          (✓ already clear - tent function)
```

#### Contrast Calculation Variables
```
--_x              → --_lc-norm       (APCA Lc normalized 0-1.08)
--_y              → --_Y-bg          (background luminance Y value)
--_apca-t         → --_smooth-t      (smoothing threshold for Bezier)
--_ep             → --_ep            (✓ already clear - epsilon)

--_xn             → --_Y-dark        (darker contrast luminance target)
--_xn-min         → --_Y-dark-min    (minimum Y for dark polarity)
--_xn-v           → --_Y-dark-v      (velocity for dark Bezier curve)
--_xn-in-gamut    → --_dark-ok       (boolean: dark solution in gamut)
--_xn-contrast    → --_lc-dark       (estimated Lc for dark solution)

--_xr             → --_Y-light       (lighter contrast luminance target)
--_xr-min         → --_Y-light-min   (minimum Y for light polarity)
--_xr-v           → --_Y-light-v     (velocity for light Bezier curve)
--_xr-in-gamut    → --_light-ok      (boolean: light solution in gamut)
--_xr-contrast    → --_lc-light      (estimated Lc for light solution)

--_target-y       → --_Y-final       (final selected contrast luminance)
--_best-fallback  → --_Y-best        (best fallback when both OOG)

--_contrast-l     → --_con-lum       (contrast color lightness)
--_contrast-tent  → --_con-tent      (contrast tent function)
--_contrast-c     → --_con-chr       (contrast chroma gamut-mapped)
```

### Rationale
- **Bundle-size conscious**: Names are concise but still meaningful
- **Consistent abbreviations**: `lum`=lightness, `chr`=chroma, `lc`=APCA Lc, `Y`=luminance
- **Self-documenting**: Purpose is clear from context (e.g., `--_Y-dark` vs `--_Y-light`)
- **Semantic clarity**: Distinguish lightness (perceptual L) from luminance (physical Y)
- **Polarity naming**: "dark" (lower Y, darker text) vs "light" (higher Y, lighter text)
- **Boolean flags**: `-ok` suffix for in-gamut checks is clear and short

## Code Organization Improvements

### CSS Variable Reference Constants

To improve readability and avoid repetitive `var(--...)` noise, declare constants at the top of the file:

```typescript
// CSS variable references (avoids var(--...) visual noise)
const V_LUM_NORM = 'var(--_lum-norm)'
const V_CHR_REQ = 'var(--_chr-req)'
const V_CHR = 'var(--_chr)'
const V_LUM_MAX = 'var(--_lum-max)'
const V_CHR_PEAK = 'var(--_chr-peak)'
const V_TENT = 'var(--_tent)'

const V_LC_NORM = 'var(--_lc-norm)'
const V_Y_BG = 'var(--_Y-bg)'
const V_SMOOTH_T = 'var(--_smooth-t)'
const V_EP = 'var(--_ep)'

const V_Y_DARK = 'var(--_Y-dark)'
const V_Y_DARK_MIN = 'var(--_Y-dark-min)'
const V_Y_DARK_V = 'var(--_Y-dark-v)'
const V_DARK_OK = 'var(--_dark-ok)'
const V_LC_DARK = 'var(--_lc-dark)'

const V_Y_LIGHT = 'var(--_Y-light)'
const V_Y_LIGHT_MIN = 'var(--_Y-light-min)'
const V_Y_LIGHT_V = 'var(--_Y-light-v)'
const V_LIGHT_OK = 'var(--_light-ok)'
const V_LC_LIGHT = 'var(--_lc-light)'

const V_Y_FINAL = 'var(--_Y-final)'
const V_Y_BEST = 'var(--_Y-best)'

const V_CON_LUM = 'var(--_con-lum)'
const V_CON_TENT = 'var(--_con-tent)'
const V_CON_CHR = 'var(--_con-chr)'
```

### Extract Common CSS Expression Patterns

#### 1. Boolean Flag Pattern
**Current code (repeated 4+ times):**
```typescript
calc((sign(var(--_xn) + var(--_ep)) + sign(1 - var(--_ep) - var(--_xn))) / 2)
```

**Proposed helper:**
```typescript
/**
 * Generates CSS to check if a luminance value is within the valid gamut (0 to 1).
 * Returns 1 if in gamut, 0 if out of gamut.
 * 
 * Formula: (sign(Y + ε) + sign(1 - ε - Y)) / 2
 * Where ε is a small epsilon value to handle floating point precision.
 */
function cssIsInGamut(luminanceVar: string, epsilonVar = V_EP): string {
	return `calc((sign(${luminanceVar} + ${epsilonVar}) + sign(1 - ${epsilonVar} - ${luminanceVar})) / 2)`
}
```

**Usage:**
```typescript
--_dark-ok: ${cssIsInGamut(V_Y_DARK)};
```

#### 2. Ternary Selection Pattern
**Current code:**
```typescript
min(1, max(0, sign(var(--_x) - var(--_apca-t)) + 1))
```

**Proposed helper:**
```typescript
/**
 * Converts a condition expression to a 0 or 1 boolean flag.
 * Clamps result to [0, 1] range.
 * 
 * Formula: min(1, max(0, condition))
 */
function cssBooleanFlag(condition: string): string {
	return `min(1, max(0, ${condition}))`
}

/**
 * Generates a CSS sign-based comparison: returns 1 if a > b, 0 otherwise.
 * Small epsilon added to handle floating point edge cases.
 * 
 * Formula: sign(a - b + 0.0001)
 */
function cssGreaterThan(a: string, b: string): string {
	return `sign(${a} - ${b} + 0.0001)`
}
```

#### 3. Hermite Interpolation (Bezier) Pattern
**Current code (repeated twice):**
```typescript
var(--_y) +
(-3 * var(--_y) + 3 * var(--_xn-min) - var(--_xn-v)) * pow(var(--_x) / var(--_apca-t), 2) +
(2 * var(--_y) - 2 * var(--_xn-min) + var(--_xn-v)) * pow(var(--_x) / var(--_apca-t), 3)
```

**Proposed helper:**
```typescript
/**
 * Generates cubic Hermite interpolation (smoothstep with velocity control).
 * Used by APCA for smooth transitions near the perceptual threshold.
 * 
 * Formula: p₀ + (-3p₀ + 3p₁ - v₁)t² + (2p₀ - 2p₁ + v₁)t³
 * 
 * @param startValue - p₀: Starting value
 * @param endValue - p₁: Ending value
 * @param endVelocity - v₁: Velocity at endpoint (controls curve shape)
 * @param tParameter - t: Interpolation parameter (0 to 1)
 */
function cssHermiteInterpolation(
	startValue: string,
	endValue: string,
	endVelocity: string,
	tParameter: string
): string {
	return outdent`
		${startValue} +
		(-3 * ${startValue} + 3 * ${endValue} - ${endVelocity}) * pow(${tParameter}, 2) +
		(2 * ${startValue} - 2 * ${endValue} + ${endVelocity}) * pow(${tParameter}, 3)
	`
}
```

#### 4. Tent Function Pattern
**Current code (repeated twice):**
```typescript
min(
  var(--_l) / var(--_L-MAX),
  (1 - var(--_l)) / (1 - var(--_L-MAX))
)
```

**Proposed helper:**
```typescript
/**
 * Generates tent function for gamut mapping chroma based on lightness.
 * The tent function determines the maximum chroma available at a given lightness
 * by computing the minimum of the distance from both lightness boundaries.
 * 
 * Formula: min(L/L_max, (1-L)/(1-L_max))
 * 
 * @param lightnessVar - Current lightness value (0 to 1)
 * @param lMaxValue - Maximum lightness where peak chroma occurs
 */
function cssTentFunction(lightnessVar: string, lMaxValue: string): string {
	return outdent`
		min(
			${lightnessVar} / ${lMaxValue},
			(1 - ${lightnessVar}) / (1 - ${lMaxValue})
		)
	`
}
```

#### 5. APCA Contrast Estimation
**Current code (duplicated for prefer-light/prefer-dark):**
```typescript
calc(1.14 * (pow(var(--_y), 0.56) - pow(clamp(0, var(--_xn), 1), 0.57)) - 0.027)
calc(1.14 * (pow(clamp(0, var(--_xr), 1), 0.62) - pow(var(--_y), 0.65)) - 0.027)
```

**Proposed helpers:**
```typescript
/**
 * Estimates APCA contrast for normal polarity (darker text on lighter background).
 * Normal polarity uses the standard APCA formula where background is lighter than text.
 * 
 * APCA Formula: Lc = 1.14 × (Y_bg^0.56 - Y_fg^0.57) - 0.027
 * 
 * @param bgLuminanceVar - Background luminance Y value
 * @param fgLuminanceVar - Foreground (text) luminance Y value
 * @returns APCA Lc value (contrast)
 */
function cssApcaNormalContrast(bgLuminanceVar: string, fgLuminanceVar: string): string {
	return `calc(1.14 * (pow(${bgLuminanceVar}, 0.56) - pow(clamp(0, ${fgLuminanceVar}, 1), 0.57)) - 0.027)`
}

/**
 * Estimates APCA contrast for reverse polarity (lighter text on darker background).
 * Reverse polarity uses a modified APCA formula where text is lighter than background.
 * 
 * APCA Formula: Lc = 1.14 × (Y_fg^0.62 - Y_bg^0.65) - 0.027
 * 
 * @param bgLuminanceVar - Background luminance Y value
 * @param fgLuminanceVar - Foreground (text) luminance Y value
 * @returns APCA Lc value (contrast)
 */
function cssApcaReverseContrast(bgLuminanceVar: string, fgLuminanceVar: string): string {
	return `calc(1.14 * (pow(clamp(0, ${fgLuminanceVar}, 1), 0.62) - pow(${bgLuminanceVar}, 0.65)) - 0.027)`
}
```

### Refactored Polarity Functions

**Before:**
```typescript
function generateNormalPolarityCss() {
	return outdent`
		--_xn-min: calc(
			pow(abs(pow(var(--_y), 0.56) - (var(--_apca-t) + 0.027) / 1.14), 1 / 0.57) *
			sign(pow(var(--_y), 0.56) - (var(--_apca-t) + 0.027) / 1.14)
		);
		--_xn-v: calc(-1 * abs((pow(abs(var(--_xn-min)), 0.43) * var(--_apca-t)) / 0.6498));
		--_xn: calc(
			min(1, max(0, sign(var(--_x) - var(--_apca-t)) + 1)) *
			pow(abs(pow(var(--_y), 0.56) - (var(--_x) + 0.027) / 1.14), 1 / 0.57) *
			sign(pow(var(--_y), 0.56) - (var(--_x) + 0.027) / 1.14) +
			(1 - min(1, max(0, sign(var(--_x) - var(--_apca-t)) + 1))) * (...)
		);
		--_xn-in-gamut: calc((sign(var(--_xn) + var(--_ep)) + sign(1 - var(--_ep) - var(--_xn))) / 2);
	`
}
```

**After:**
```typescript
// CSS variable reference constants at top of file
const V_Y_BG = 'var(--_Y-bg)'
const V_LC_NORM = 'var(--_lc-norm)'
const V_SMOOTH_T = 'var(--_smooth-t)'
const V_Y_DARK_MIN = 'var(--_Y-dark-min)'
const V_Y_DARK_V = 'var(--_Y-dark-v)'
const V_Y_DARK = 'var(--_Y-dark)'

function generateNormalPolarityCss() {
	// Simplified APCA formula component
	const apcaTerm = `(pow(${V_Y_BG}, 0.56) - (${V_LC_NORM} + 0.027) / 1.14)`
	
	// Direct solution when above threshold
	const directSolution = `pow(abs(pow(${V_Y_BG}, 0.56) - (${V_LC_NORM} + 0.027) / 1.14), 1 / 0.57) * sign(${apcaTerm})`
	
	// Bezier interpolation when below threshold
	const tParameter = `${V_LC_NORM} / ${V_SMOOTH_T}`
	const bezierInterpolation = cssHermiteInterpolation(
		V_Y_BG,
		V_Y_DARK_MIN,
		V_Y_DARK_V,
		tParameter
	)
	
	// Branch selection flag: 1 if above threshold, 0 if below
	const aboveThreshold = cssBooleanFlag(`sign(${V_LC_NORM} - ${V_SMOOTH_T}) + 1`)
	
	return outdent`
		/* Normal polarity: solve for darker Y (dark text on light background) */
		--_Y-dark-min: calc(${directSolution} | where contrast = threshold);
		--_Y-dark-v: calc(-1 * abs((pow(abs(${V_Y_DARK_MIN}), 0.43) * ${V_SMOOTH_T}) / 0.6498));
		--_Y-dark: calc(
			${aboveThreshold} * (${directSolution}) +
			(1 - ${aboveThreshold}) * (${bezierInterpolation})
		);
		--_dark-ok: ${cssIsInGamut(V_Y_DARK)};
	`
}
```

### Complete Refactored Structure

```typescript
// ============================================================================
// CSS Expression Helpers
// ============================================================================

function cssIsInGamut(luminanceVar: string, epsilon = 'var(--_gamut-epsilon)'): string
function cssBooleanFlag(condition: string): string
function cssGreaterThan(a: string, b: string): string
function cssTentFunction(lightnessVar: string, lMax: string): string
function cssHermiteInterpolation(...): string
function cssApcaNormalContrast(...): string
function cssApcaReverseContrast(...): string
function cssBestContrastFallback(normalVar: string, reverseVar: string, normalContrast: string, reverseContrast: string): string

// ============================================================================
// CSS Block Generators
// ============================================================================

function generateBaseColorCss(...) // ✓ Already well-structured
function generateNormalPolarityCss() // Refactor with helpers
function generateReversePolarityCss() // Refactor with helpers
function generateTargetYCss(mode) // Refactor with helpers
function generateHeuristicCss(...) // ✓ Already clear
function generateContrastCss(...) // Update to use new variable names

// ============================================================================
// Main Export
// ============================================================================

export function generateColorCss(...)
```

## Benefits

### Readability
- Variable names explain purpose without needing comments
- Helper functions make complex math patterns reusable
- Easier for contributors to understand APCA logic

### Maintainability
- Single source of truth for repeated patterns
- Changes to formulas only need updates in one place
- Helper functions can be unit tested independently

### Debugging
- Generated CSS is more self-documenting
- Clearer which intermediate values to inspect in DevTools
- Variable names match documentation and APCA spec terminology

## Migration Strategy

1. **Phase 1**: Add CSS helper functions alongside existing code
2. **Phase 2**: Refactor polarity functions to use helpers
3. **Phase 3**: Update variable names throughout
4. **Phase 4**: Update tests to match new variable names
5. **Validation**: Ensure generated CSS is functionally identical (can diff output)

## Implementation Decisions

1. ✅ Keep everything in `generator.ts` (single file for now)
2. ✅ Add JSDoc with APCA formula references to helper functions
3. ✅ Declare all V_* constants in one section at the top of the file

## Example: Before & After

### Before
```css
.color.contrast {
	--_x: clamp(0, var(--contrast) / 100, 1.08);
	--_y: pow(var(--_l), 3);
	--_xn: calc(/* 80 characters of math */);
	--_target-y: clamp(0, var(--_xn), 1);
}
```

### After
```css
.color.contrast {
	--_lc-norm: clamp(0, var(--contrast) / 100, 1.08);
	--_Y-bg: pow(var(--_lum-norm), 3);
	--_Y-dark: calc(/* same math but readable variable names */);
	--_Y-final: clamp(0, var(--_Y-dark), 1);
}
```

The variable names now tell a story: we normalize the APCA Lc value, calculate background luminance Y, solve for the darker contrast luminance target, and select the final Y value.

### Size Impact
Estimated bundle size increase: ~150-200 bytes per generated CSS block (before gzip). With gzip, the impact is minimal due to compression of repeated patterns.
