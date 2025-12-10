# ok-apca

OKLCH color utilities with APCA-based contrast for accessible color systems.

Generate static CSS that computes gamut-mapped OKLCH colors and APCA-compliant contrast colors at runtime—no JavaScript required in the browser.

## Installation

```bash
npm install ok-apca
# or
pnpm add ok-apca
```

## Overview

This library solves two problems:

1. **Gamut mapping**: OKLCH colors can exceed the sRGB gamut. This library clamps chroma using a tent function approximation that's accurate and CSS-compatible.

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
    mode: 'prefer-dark',
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
  <span class="contrast" style="--contrast: 60">
    Text with 60 Lc contrast
  </span>
</div>
```

### Programmatic API

For JavaScript-based color manipulation:

```typescript
import { gamutMap, applyContrast, measureContrast } from 'ok-apca'

// Gamut-map a color to sRGB
const color = gamutMap({ hue: 264, chroma: 0.3, lightness: 0.5 })
// → { hue: 264, chroma: 0.189, lightness: 0.5 }

// Compute a contrast color
const contrast = applyContrast(
  { hue: 30, chroma: 0.15, lightness: 0.6 },
  60, // target Lc
  'prefer-dark'
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
  - `mode`: `'force-light'` | `'prefer-light'` | `'prefer-dark'` | `'force-dark'`
  - `selector`: CSS selector for contrast variant (default: `'&.contrast'`)

**CSS Variables (input):**
- `--lightness` (0-100): Perceptual lightness
- `--chroma` (0-100): Color saturation  
- `--contrast` (0-108): Target APCA Lc value

**CSS Variables (output):**
- `--o-color`: The gamut-mapped OKLCH color
- `--o-color-contrast`: The contrast color

### `gamutMap(color)`

Clamp a color's chroma to fit within the sRGB gamut.

```typescript
function gamutMap(color: Color): Color

interface Color {
  hue: number      // 0-360
  chroma: number   // 0-0.4
  lightness: number // 0-1
}
```

### `applyContrast(color, contrast, mode)`

Compute a contrast color achieving the target APCA Lc value.

```typescript
function applyContrast(
  color: Color,
  contrast: number, // 0-108
  mode: ContrastMode
): Color
```

This uses the same simplified math as the CSS output, so results match.

### `measureContrast(baseColor, contrastColor)`

Measure actual APCA contrast between two colors (for verification).

```typescript
function measureContrast(baseColor: Color, contrastColor: Color): number
```

Returns signed Lc value:
- Positive: dark on light (normal polarity)
- Negative: light on dark (reverse polarity)

## Contrast Modes

| Mode | Behavior |
|------|----------|
| `force-light` | Always use lighter contrast color |
| `prefer-light` | Use lighter if in gamut, else darker |
| `prefer-dark` | Use darker if in gamut, else lighter |
| `force-dark` | Always use darker contrast color |

## How It Works

### Gamut Mapping

The sRGB gamut boundary for each hue is approximated by a tent function:

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
- `oklch()` color function
- `pow()`, `sign()`, `abs()` math functions
- CSS custom properties

This requires modern browsers (Chrome 111+, Safari 15.4+, Firefox 113+).

## License

MIT
