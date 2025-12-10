i want to create a typescript library that generates static css for gamut-mapped oklch colors with apca-based contrast colors. the css runs without javascript — all computation that can be done at build time should be.

## goal

given a fixed hue, generate css that accepts `--lightness` and `--chroma` as runtime inputs and outputs `--o-color` (gamut-mapped oklch). optionally generate contrast color logic that accepts `--contrast` (apca Lc value) and `--polarity`, outputting `--o-color-contrast`.

## api

```typescript
interface ColorGeneratorOptions {
  hue: number; // 0-360
  selector: string; // e.g. '.color' or '[data-color]'
  contrast?: {
    modes: ('force-light' | 'prefer-light' | 'prefer-dark' | 'force-dark')[];
    selector?: string; // defaults to '&.contrast'
  };
}

function generateColorCSS(options: ColorGeneratorOptions): string;
```

## architecture

build time (this library):
- compute sRGB gamut boundary for the hue using `culori`
- compute L_max (lightness at peak chroma) and C_peak (max chroma)
- compute apca Y-conversion coefficients (yc0, yc1, yc2) from oklab matrix
- output these as literal numbers in the css

runtime (css only):
- inputs: --lightness (0-100), --chroma (0-100)
- gamut mapping: C_max(L) = C_peak * tent(L, L_max)
- output: --o-color: oklch(L C_clamped H)

for contrast (if enabled):
- inputs: --contrast (0-108), --polarity
- convert oklch L → Y (luminance) using pre-computed coefficients
- solve apca equation for target Y
- solve cubic (cardano's formula) to convert Y back to oklch L
- gamut-map the contrast color's chroma
- output: --o-color-contrast

## reference implementation

i have existing css that does all of this with runtime hue selection (attached below). the library should produce equivalent results but with the hue-dependent parts pre-computed.

before implementing:
1. analyze the reference css to understand each calculation
2. identify which values become build-time constants for a fixed hue
3. propose the simplified css structure
4. implement with tests comparing output to the reference

## constraints

- dependencies like `culori` and `apca-w3` are fine (build-time only)
- output css must work in browsers supporting oklch and css math functions (pow, sqrt, sign, etc.)
- the generated css should be reasonably readable, not minified
