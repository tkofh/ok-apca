# ok-apca

OKLCH color utilities with APCA-based contrast for accessible color systems.

Generate static CSS that computes gamut-mapped OKLCH colors (Display P3) and APCA-compliant contrast colors at runtime—no JavaScript required in the browser.

## Installation

```bash
npm install ok-apca
# or
pnpm add ok-apca
```

## Overview

This library solves two problems:

1. **Gamut mapping**: OKLCH colors can exceed the Display P3 gamut. This library clamps chroma using a tent function approximation that's accurate and CSS-compatible.

2. **Accessible contrast**: Given any background color, compute a foreground color that achieves a target APCA contrast level (Lc 0-108).

The CSS generation approach means colors are computed at build time for each hue, but lightness, chroma, and contrast can vary at runtime via CSS custom properties.

## Usage

### Generate CSS

```typescript
import { generateColorCss } from 'ok-apca'

const css = generateColorCss({
  hue: 30,
  selector: '.orange',
  contrast: {
    allowPolarityInversion: true,
    selector: '&.contrast'
  }
})
```

This generates CSS like:

```css
.orange {
  /* Runtime inputs */
  --_l: clamp(0, var(--lightness) / 100, 1);
  --_c-req: clamp(0, var(--chroma) / 100, 1);

  /* Build-time constants for hue 30 */
  --_L-MAX: 0.705;
  --_C-PEAK: 0.1686;

  /* Gamut mapping via tent function */
  --_tent: min(var(--_l) / var(--_L-MAX), (1 - var(--_l)) / (1 - var(--_L-MAX)));
  --_c: min(var(--_c-req), calc(var(--_C-PEAK) * var(--_tent)));

  /* Output color */
  --o-color: oklch(var(--_l) var(--_c) 30);
}

.orange.contrast {
  /* APCA contrast solving equations... */
  --o-color-contrast: oklch(var(--_contrast-l) var(--_contrast-c) 30);
}
```

Use the generated CSS:

```html
<div class="orange" style="--lightness: 60; --chroma: 80">
  Background
  <span class="contrast" style="--contrast: 60; --allow-polarity-inversion: 1">
    Text with 60 Lc contrast (darker text preferred)
  </span>
  <span class="contrast" style="--contrast: -60; --allow-polarity-inversion: 1">
    Text with 60 Lc contrast (lighter text preferred)
  </span>
</div>
```

### Programmatic API

For JavaScript-based color manipulation:

```typescript
import { gamutMap, applyContrast, measureContrast } from 'ok-apca'

// Gamut-map a color to Display P3
const color = gamutMap({ hue: 264, chroma: 0.3, lightness: 0.5 })
// → { hue: 264, chroma: 0.237, lightness: 0.5 }

// Compute a contrast color (darker text preferred)
const contrast = applyContrast(
  { hue: 30, chroma: 0.15, lightness: 0.6 },
  60, // positive = darker text (normal polarity)
  true // allow polarity inversion if needed
)

// Compute lighter text instead
const contrastLight = applyContrast(
  { hue: 30, chroma: 0.15, lightness: 0.6 },
  -60, // negative = lighter text (reverse polarity)
  true
)

// Verify the actual contrast
const actualLc = measureContrast(gamutMap(base), contrast)
// → ~60 (may vary slightly due to CSS simplifications)
```

## API Reference

### `generateColorCss(options)`

Generate CSS for a hue with optional contrast support.

**Options:**
- `hue` (number): Hue angle in degrees (0-360)
- `selector` (string): CSS selector for the generated styles
- `contrast` (optional): Contrast color configuration
  - `allowPolarityInversion` (boolean): Allow fallback to opposite polarity if preferred is out of gamut
  - `selector`: CSS selector for contrast variant (default: `'&.contrast'`)

**CSS Variables (input):**
- `--lightness` (0-100): Perceptual lightness
- `--chroma` (0-100): Color saturation (Display P3 supports higher chroma than sRGB)
- `--contrast` (-108 to 108): Target APCA Lc value, signed
  - Positive: Normal polarity (darker text on lighter background)
  - Negative: Reverse polarity (lighter text on darker background)
- `--allow-polarity-inversion` (0 or 1): Runtime control of polarity inversion

**CSS Variables (output):**
- `--o-color`: The gamut-mapped OKLCH color (Display P3)
- `--o-color-contrast`: The contrast color (Display P3)

### `gamutMap(color)`

Clamp a color's chroma to fit within the Display P3 gamut.

```typescript
function gamutMap(color: Color): Color

interface Color {
  hue: number      // 0-360
  chroma: number   // 0-0.5 (Display P3 supports higher chroma than sRGB)
  lightness: number // 0-1
}
```

### `applyContrast(color, signedContrast, allowPolarityInversion)`

Compute a contrast color achieving the target APCA Lc value.

```typescript
function applyContrast(
  color: Color,
  signedContrast: number, // -108 to 108
  allowPolarityInversion: boolean
): Color
```

**Parameters:**
- `signedContrast`: Target APCA Lc value
  - Positive: Normal polarity (darker text)
  - Negative: Reverse polarity (lighter text)
- `allowPolarityInversion`: If `true`, allows fallback to opposite polarity when preferred is out of gamut

This uses the same simplified math as the CSS output, so results match.

### `measureContrast(baseColor, contrastColor)`

Measure actual APCA contrast between two colors (for verification).

```typescript
function measureContrast(baseColor: Color, contrastColor: Color): number
```

Returns signed Lc value:
- Positive: dark on light (normal polarity)
- Negative: light on dark (reverse polarity)

## Contrast Polarity

The library uses a **signed contrast** system:

| Contrast Value | Polarity | Behavior |
|---------------|----------|-----------|
| Positive (e.g., `60`) | Normal | Darker text on lighter background |
| Negative (e.g., `-60`) | Reverse | Lighter text on darker background |

**Polarity Inversion:**
- `allowPolarityInversion: false` — Forces the specified polarity (even if out of gamut)
- `allowPolarityInversion: true` — Allows fallback to opposite polarity if preferred is out of gamut

**Migration from old API:**
- `force-light` → `contrast: -60, allowPolarityInversion: false`
- `force-dark` → `contrast: 60, allowPolarityInversion: false`
- `prefer-light` → `contrast: -60, allowPolarityInversion: true`
- `prefer-dark` → `contrast: 60, allowPolarityInversion: true`

## How It Works

### Gamut Mapping

The Display P3 gamut boundary for each hue is approximated by a tent function:

```
maxChroma = cPeak × min(L / lMax, (1 - L) / (1 - lMax))
```

Where `lMax` is the lightness where peak chroma occurs, and `cPeak` is the maximum chroma at that lightness. These values are computed at build time for each hue.

### APCA Contrast

APCA (Accessible Perceptual Contrast Algorithm) defines contrast differently for:
- **Normal polarity**: Dark text on light background
- **Reverse polarity**: Light text on dark background

The library inverts the APCA equations to solve for the target luminance (Y) that achieves a given Lc value, then converts back to OKLCH lightness.

### Heuristic Correction

CSS uses simplified math (`Y = L³`) that ignores chroma's contribution to luminance. This causes slight under-delivery of contrast. The library fits heuristic correction coefficients for each hue and mode to compensate.

## Browser Support

The generated CSS uses:
- `oklch()` color function with Display P3 gamut
- `pow()`, `sign()`, `abs()` math functions
- CSS custom properties

This requires modern browsers with Display P3 support:
- **Chrome/Edge**: 111+ (full P3 support)
- **Safari**: 15+ (excellent P3 support, especially on Mac displays)
- **Firefox**: 113+ (P3 support)

**Note on Display Gamut**: The library generates colors in the Display P3 gamut, which has approximately 25% more colors than sRGB. On displays that support Display P3 (most modern Mac displays, many high-end monitors, and newer mobile devices), you'll see richer, more saturated colors. On sRGB-only displays, browsers will automatically gamut-map the colors down to sRGB, so the colors will still look good but less vibrant.

### Accuracy and Limitations

The library uses a simplified Y = L³ approximation for luminance calculations in the CSS output, which ignores chroma's contribution to perceived brightness. This simplification enables pure CSS computation without per-hue constants, but introduces some error:

**Display P3 Accuracy Characteristics:**
- Average contrast error: ~20 Lc (vs ~3-5 Lc for sRGB)
- Under-delivery rate: ~20% of cases (heuristics compensate for most)
- Worst-case under-delivery: ~5 Lc for well-behaved hues (Red, Blue, Purple)

**Why P3 has larger errors:**
- P3 allows higher chroma values (~0.5 vs ~0.4 for sRGB)
- Higher chroma means chroma's contribution to luminance is more significant
- The Y = L³ simplification becomes less accurate

**Heuristic corrections:**
- Automatically fitted per-hue and per-mode to compensate for approximation errors
- Multiplicative boost for dark bases and mid-lightness colors
- Additional boost for high-contrast targets (> 30 Lc)
- Reduces under-delivery significantly but cannot eliminate all errors

**Practical implications:**
- Colors still achieve accessible contrast levels
- The APCA Lc values are approximate, not exact
- For critical accessibility applications, verify actual contrast with `measureContrast()`
- Most color combinations work well; edge cases may under-deliver contrast slightly

## License

MIT
