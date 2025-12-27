# ok-apca

A TypeScript library that generates static CSS for gamut-mapped OKLCH colors with APCA-based contrast colors. All computation happens at build time—the CSS runs without JavaScript.

## Features

- 🎨 **Gamut-mapped OKLCH colors** - Generate colors that stay within the sRGB gamut
- ♿ **APCA-based contrast** - Automatic contrast color generation using the APCA algorithm
- 🎭 **Multiple contrast colors** - Define text, fill, stroke, and any other contrast colors, all relative to a base color
- 🔄 **Smart polarity** - Automatic light/dark text selection based on background
- ⚡ **Pure CSS** - All color computation happens at build time
- 🎬 **Pulse animations** - Built-in support for animating chroma and lightness
- 🔒 **Polarity locking** - Lock contrast polarity during animations

## Installation

```bash
pnpm add ok-apca
```

## Quick Start

```typescript
import { generateColorCss } from 'ok-apca'

const css = generateColorCss({
  hue: 30, // Orange hue
  selector: '.orange',
  contrastColors: [
    { label: 'text' }
  ]
})

// Write css to a .css file
```

Then in your HTML:

```html
<div class="orange" style="--lightness: 60; --chroma: 80; --contrast-text: 60">
  <div style="background: var(--o-color); color: var(--o-color-text)">
    Orange background with readable text
  </div>
</div>
```

## API

### `generateColorCss(options)`

Generates CSS for an OKLCH color with optional contrast colors.

#### Options

- **`hue`** (number, required): Hue angle in degrees (0-360)
- **`selector`** (string, required): CSS selector for the generated styles
- **`contrastColors`** (array, optional): Array of contrast color definitions
  - Each definition has a `label` property (e.g., `{ label: 'text' }`)
- **`prefix`** (string, optional): Prefix for output CSS custom properties (default: `'o'`)

#### Example with Multiple Contrast Colors

```typescript
const css = generateColorCss({
  hue: 30,
  selector: '.theme',
  contrastColors: [
    { label: 'text' },
    { label: 'icon' },
    { label: 'border' }
  ]
})
```

#### Example with Custom Prefix

```typescript
const css = generateColorCss({
  hue: 30,
  selector: '.theme',
  prefix: 'brand',
  contrastColors: [
    { label: 'text' }
  ]
})

// Outputs: --brand-color and --brand-color-text
```

## CSS Variables

### Input Variables

#### Base Color

- **`--lightness`** (0-100): Perceptual lightness of the base color
- **`--chroma`** (0-100): Chroma as percentage of maximum available at this lightness

#### Contrast Colors (per label)

- **`--contrast-{label}`** (-108 to 108): Target APCA contrast level
  - Positive values prefer darker contrast
  - Negative values prefer lighter contrast
  - Defaults to 0 if not set
- **`--allow-polarity-inversion-{label}`** (0 or 1): Allow polarity inversion if preferred polarity is out of gamut
  - `1` = allow inversion (default: 0)
  - `0` = force preferred polarity even if out of gamut

#### Pulse Animation

- **`--pulse-frequency`** (number): Animation duration in seconds (default: 1)
- **`--pulse-lightness-offset`** (0-100): Additive lightness offset during pulse (default: 0)
- **`--pulse-chroma-offset`** (0-100): Additive chroma offset during pulse (default: 0)

#### Polarity Locking

- **`--polarity-from`** (0-100): Override the lightness value used for polarity decision (fallback: `--lightness`)

### Output Variables

- **`--{prefix}-color`**: The gamut-mapped OKLCH base color (default: `--o-color`)
- **`--{prefix}-color-{label}`**: The contrast color for each label (e.g., `--o-color-text`)

## Usage Examples

### Basic Color

```typescript
const css = generateColorCss({
  hue: 200,
  selector: '.blue'
})
```

```html
<div class="blue" style="--lightness: 50; --chroma: 90">
  <div style="background: var(--o-color)">Blue background</div>
</div>
```

### With Contrast Text

```typescript
const css = generateColorCss({
  hue: 200,
  selector: '.blue',
  contrastColors: [{ label: 'text' }]
})
```

```html
<div class="blue" style="
  --lightness: 50;
  --chroma: 90;
  --contrast-text: 60;
  --allow-polarity-inversion-text: 1;
">
  <div style="background: var(--o-color); color: var(--o-color-text)">
    Blue background with 60 Lc contrast text
  </div>
</div>
```

### Multiple Contrast Colors

```typescript
const css = generateColorCss({
  hue: 30,
  selector: '.theme',
  contrastColors: [
    { label: 'text' },
    { label: 'icon' },
    { label: 'border' }
  ]
})
```

```html
<div class="theme" style="
  --lightness: 60;
  --chroma: 80;
  --contrast-text: 60;
  --contrast-icon: 45;
  --contrast-border: 30;
  --allow-polarity-inversion-text: 1;
  --allow-polarity-inversion-icon: 1;
  --allow-polarity-inversion-border: 0;
">
  <div style="
    background: var(--o-color);
    color: var(--o-color-text);
    border: 2px solid var(--o-color-border);
  ">
    <svg style="fill: var(--o-color-icon)">
      <use href="#icon" />
    </svg>
    Themed content with text, icons, and borders
  </div>
</div>
```

### Pulse Animation

Add the `.pulse` class to animate the base color:

```html
<div class="orange pulse" style="
  --lightness: 50;
  --chroma: 80;
  --pulse-frequency: 2;
  --pulse-lightness-offset: 20;
  --pulse-chroma-offset: -30;
  --contrast-text: 60;
  --allow-polarity-inversion-text: 1;
">
  <div style="background: var(--o-color); color: var(--o-color-text)">
    Pulsing background with text that automatically adjusts
  </div>
</div>
```

The contrast colors automatically recalculate as the base color pulses.

### Polarity Locking

Lock the polarity decision to prevent text from flipping during animations:

```html
<div class="orange pulse polarity-fixed" style="
  --lightness: 50;
  --chroma: 80;
  --polarity-from: 50;
  --pulse-lightness-offset: 30;
  --contrast-text: 60;
  --allow-polarity-inversion-text: 1;
">
  <div style="background: var(--o-color); color: var(--o-color-text)">
    Text polarity is locked even as background pulses
  </div>
</div>
```

## How It Works

### Gamut Mapping

Given a hue, the library:

1. Computes the sRGB gamut boundary using color.js
2. Finds the maximum chroma at different lightness levels
3. Generates CSS that maps `--lightness` and `--chroma` to valid sRGB colors

### Contrast Calculation

For each contrast color:

1. Converts base color's OKLCH lightness to CIE Y luminance
2. Uses APCA to solve for foreground luminance needed to achieve target contrast
3. Supports both normal polarity (dark on light) and reverse polarity (light on dark)
4. Automatically selects best polarity or allows fallback if preferred is out of gamut
5. Maps result back to OKLCH and gamut-maps the chroma

### Shared Chroma Percentage

All contrast colors use the same chroma percentage as the base color. This maintains color harmony—adjusting the base color's saturation affects all related colors proportionally.

### Polarity Inversion

When `--allow-polarity-inversion-{label}` is set to `1`:
- If the preferred polarity (based on contrast sign) is out of gamut, tries opposite polarity
- If both polarities are out of gamut, selects whichever achieves higher contrast
- This ensures readable contrast even at extreme lightness/chroma combinations

When set to `0`:
- Forces the preferred polarity even if it goes out of gamut
- Useful when consistent polarity is more important than perfect contrast

## Label Validation

Contrast color labels must:
- Start with a letter (a-z, A-Z)
- Contain only letters, numbers, hyphens, and underscores
- Be unique within the same `contrastColors` array

Valid: `'text'`, `'fill-color'`, `'stroke_2'`  
Invalid: `'1text'`, `'text color'`, `'text!'`

## Migration from v1

If you're upgrading from version 1.x:

### API Changes

**Old API:**
```typescript
generateColorCss({
  hue: 30,
  selector: '.orange',
  contrast: {
    allowPolarityInversion: true,
    selector: '&.contrast'
  }
})
```

**New API:**
```typescript
generateColorCss({
  hue: 30,
  selector: '.orange',
  contrastColors: [
    { label: 'text' }
  ]
})
```

### HTML Changes

**Old HTML:**
```html
<div class="orange" style="--lightness: 60; --chroma: 80">
  <span class="contrast" style="--contrast: 60; --allow-polarity-inversion: 1">
    Text
  </span>
</div>
```

**New HTML:**
```html
<div class="orange" style="
  --lightness: 60;
  --chroma: 80;
  --contrast-text: 60;
  --allow-polarity-inversion-text: 1;
">
  <span style="color: var(--o-color-text)">
    Text
  </span>
</div>
```

### Key Differences

1. **No separate contrast selector** - All variables are on the base selector
2. **Labeled variables** - `--contrast` becomes `--contrast-{label}`
3. **Runtime polarity control** - `allowPolarityInversion` is now a CSS variable per label
4. **Multiple contrast colors** - Can define as many as needed in one declaration

## License

MIT

## Credits

- Uses [APCA (Accessible Perceptual Contrast Algorithm)](https://github.com/Myndex/SAPC-APCA) by Andrew Somers
- Uses [color.js](https://colorjs.io/) by Lea Verou for color space conversions
