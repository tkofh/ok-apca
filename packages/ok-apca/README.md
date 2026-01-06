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
  contrastColors: [{ label: 'text' }]
})
```

This generates CSS like:

```css
@property --lightness { ... }
@property --chroma { ... }
@property --contrast-text { ... }

.orange {
  /* Runtime inputs */
  --_lum-norm: clamp(0, var(--lightness) / 100, 1);
  --_chr-pct: clamp(0, var(--chroma) / 100, 1);

  /* Build-time constants for hue 30 (gamut apex) */
  /* ... apex lightness, chroma, curve scale ... */

  /* Gamut mapping via tent function with curvature correction */
  --_max-chr: calc(...);
  --_chr: calc(var(--_max-chr) * var(--_chr-pct));

  /* Output color */
  --o-color: oklch(var(--_lum-norm) var(--_chr) 30);

  /* Contrast color calculations */
  /* ... APCA solving equations ... */
  --o-color-text: oklch(var(--_con-lum-text) var(--_con-chr-text) 30);
}
```

Use the generated CSS:

```html
<div class="orange" style="--lightness: 60; --chroma: 80">
  Background
  <span style="color: var(--o-color-text); --contrast-text: 60">
    Text with 60 Lc contrast (lighter text)
  </span>
  <span style="color: var(--o-color-text); --contrast-text: -60">
    Text with 60 Lc contrast (darker text)
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

// Compute a contrast color (lighter text)
const contrast = applyContrast(
  { hue: 30, chroma: 0.15, lightness: 0.6 },
  60 // positive = lighter text
)

// Compute darker text instead
const contrastDark = applyContrast(
  { hue: 30, chroma: 0.15, lightness: 0.6 },
  -60 // negative = darker text
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
- `prefix` (string, optional): Prefix for output CSS variables (default: `'o'`)
- `contrastColors` (array, optional): Array of contrast color definitions
  - `label` (string): Label for the contrast color (e.g., `'text'`, `'fill'`)

**CSS Variables (input):**
- `--lightness` (0-100): Perceptual lightness
- `--chroma` (0-100): Color saturation as percentage of maximum available
- `--contrast-{label}` (-108 to 108): Target APCA Lc value, signed
  - Positive: Lighter text (text is lighter than background)
  - Negative: Darker text (text is darker than background)

**CSS Variables (output):**
- `--{prefix}-color`: The gamut-mapped OKLCH color (Display P3)
- `--{prefix}-color-{label}`: The contrast color for each label (Display P3)

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

### `applyContrast(color, signedContrast)`

Compute a contrast color achieving the target APCA Lc value.

```typescript
function applyContrast(
  color: Color,
  signedContrast: number // -108 to 108
): Color
```

**Parameters:**
- `signedContrast`: Target APCA Lc value
  - Positive: Lighter text (text is lighter than background)
  - Negative: Darker text (text is darker than background)

The result is clamped to the gamut boundary [0, 1] for lightness. This uses the same simplified math as the CSS output, so results match.

### `measureContrast(baseColor, contrastColor)`

Measure actual APCA contrast between two colors (for verification).

```typescript
function measureContrast(baseColor: Color, contrastColor: Color): number
```

Returns signed Lc value:
- Positive: light on dark (text is lighter than background)
- Negative: dark on light (text is darker than background)

## Contrast Polarity

The library uses a **signed contrast** system:

| Contrast Value | Behavior |
|---------------|-----------|
| Positive (e.g., `60`) | Lighter text (text is lighter than background) |
| Negative (e.g., `-60`) | Darker text (text is darker than background) |

This convention makes it intuitive: positive = lighter, negative = darker.

When the requested polarity would result in an out-of-gamut color (e.g., requesting lighter text when the background is already very light), the result is clamped to the gamut boundary.

## How It Works

### Gamut Mapping

The Display P3 gamut boundary for each hue is approximated by a tent function with curvature correction:

```
maxChroma = apexChroma × min(L / apexLightness, (1 - L) / (1 - apexLightness)) + correction
```

Where `apexLightness` is the lightness where peak chroma occurs (the gamut apex), and `apexChroma` is the maximum chroma at that lightness. The curvature correction improves accuracy on the right half of the tent. These values are computed at build time for each hue.

### APCA Contrast

APCA (Accessible Perceptual Contrast Algorithm) defines contrast differently for:
- **Normal polarity**: Dark text on light background
- **Reverse polarity**: Light text on dark background

The library inverts the APCA equations to solve for the target luminance (Y) that achieves a given Lc value, then converts back to OKLCH lightness.

### Heuristic Correction

CSS uses simplified math (`Y = L³`) that ignores chroma's contribution to luminance. This causes slight under-delivery of contrast. The library fits heuristic correction coefficients for each hue to compensate.

## Browser Support

The generated CSS uses:
- `oklch()` color function with Display P3 gamut
- `pow()`, `sign()`, `abs()` math functions
- CSS custom properties with `@property` declarations

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
- Automatically fitted per-hue to compensate for approximation errors
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
