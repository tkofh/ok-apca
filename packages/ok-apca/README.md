# ok-apca

ok-apca generates static CSS that solves [APCA](https://github.com/Myndex/SAPC-APCA) contrast in the cascade. APCA is the contrast algorithm drafted for WCAG 3. You set a lightness, a chroma, and a contrast target as custom properties. The stylesheet returns an OKLCH color and companion colors that meet that contrast target against it. The browser solves everything again when any input changes. All computation happens at build time. No JavaScript ships.

```css
.card {
  /* inputs */
  --lightness: 0.92;
  --chroma: 0.3;         /* 30% of the most saturated blue that exists at this lightness */
  --contrast-text: 0.75; /* target: APCA Lc 75 between text and fill */
  --text-invertable: 1;  /* let the solver flip text polarity when it has to */

  /* outputs, computed by the generated CSS */
  background: var(--color-fill);
  color: var(--color-text);
}

@media (prefers-color-scheme: dark) {
  .card { --lightness: 0.25; } /* the only change */
}
```

In light mode the text resolves dark. In dark mode the same declaration resolves light, because only the lighter direction has enough headroom left. Both results land within about 1 Lc of the requested 75. Lc is the APCA contrast unit. Hover states, user-picked accents, and an animated `--lightness` work the same way. You declare the contrast relationship once, and it holds in every state that CSS can express.

The `.card` element also carries a role class and sits inside a hue scope. Both classes come from your configuration. See [Quick start](#quick-start).

## Why compile this into CSS?

A runtime `getContrastColor(bg)` gives one answer for one moment. It runs after render, so you either flash the wrong color or do extra work in server rendering. You must also call it again for every state change: hover, theme toggle, container query, each animation frame. That means effects and observers for things the cascade already handles.

Compiling the math into CSS reverses that. The contrast target is a custom property, so anything that can set a custom property can drive it: `:hover`, media queries, inline styles from a color picker, keyframes. The generated CSS registers the inputs with `@property` and `syntax: '<number>'`, so they interpolate. `transition: --lightness 150ms` carries every derived color with it, and the contrast holds at each frame.

You cannot write this by hand with `oklch(from …)` relative color syntax. To meet an APCA target, the stylesheet must invert the APCA power curves and handle both polarity directions. It must also approximate the APCA soft black clamp and stay inside the displayable gamut for the hue. Polarity is the direction of contrast, light text on dark or dark text on light. The gamut is the set of colors a display can show. The gamut boundary of a hue slice is an empirical shape, not a formula, so `calc()` cannot express it. This package samples the boundary at build time, in a few milliseconds per hue, and bakes the result into a few constants. It also emits several kilobytes of `calc()` that you would not want to maintain by hand.

`contrast-color()`, the platform's own answer, resolves to black or white only. That works for a badge. It does not work for "the same blue, 75 Lc apart."

## Quick start

```sh
npm install -D ok-apca
```

ok-apca is an ESM-only Node library that runs at build time. It is a script, not a bundler plugin:

```ts
// scripts/generate-colors.ts
import { writeFileSync } from 'node:fs'
import { defineColors } from 'ok-apca'

const { css } = defineColors({
  hues: [
    { name: 'blue', hue: 250 },
    { name: 'orange', hue: 55 },
  ],
  roles: [
    { name: 'fill' }, // elements with .fill anchor a color…
    { name: 'text' }, // …and get --color-text solved against it
  ],
})

writeFileSync('src/colors.css', css)
```

Each hue name and role name becomes a class. The class names are configurable. Put the hue class on the element or on any ancestor. Put the role class on the element itself:

```html
<link rel="stylesheet" href="colors.css" />

<button class="blue fill">Save</button>
```

```css
button {
  --lightness: 0.45;
  --chroma: 0.8;
  --contrast-text: 0.75;
  --text-invertable: 1;

  background: var(--color-fill);
  color: var(--color-text);
}

button:hover  { --lightness: 0.52; }
button:active { --lightness: 0.38; }
```

Three lightness states, one contrast declaration. The text color solves again for each state. If you swap `blue` for `orange`, everything solves again for the other hue.

## The runtime contract

All inputs inherit, so you can set them on the element or on any ancestor:

- `--lightness`, from `0` to `1`. The OKLCH lightness of the anchor color. The default is `0`, black.
- `--chroma`, from `0` to `1`. The fraction of the maximum chroma available at this lightness and hue. The default is `0`, gray.
- `--contrast-{role}`, from `-1.08` to `1.08`. The target APCA contrast, Lc divided by 100, between the color of `{role}` and the anchor. Positive means lighter than the anchor, negative means darker. The default is `0`, which returns the anchor color itself.
- `--{role}-invertable`, `0` or `1`. With `1`, the solver can flip direction when the requested direction cannot reach the target. The default is `0`.

The output `--{prefix}-{role}` is the solved `oklch()` color for each role. With the default prefix the outputs are `--color-fill`, `--color-text`, and so on. The output inherits, so descendants of a role element can use it. Outside any role scope it resolves to `transparent`.

Three parts of this contract are not obvious.

`--chroma` is a ratio, not an OKLCH chroma. `--chroma: 0.8` means 80% of the most saturated color this hue offers at the current lightness. The library computes the Display P3 gamut boundary for each hue at build time. As `--lightness` sweeps from 0 to 1, the actual chroma follows the shape of the gamut instead of clipping against it. Companion colors reuse the same ratio at their own lightness. This keeps the perceived saturation consistent between a fill and its text.

The contrast scale is APCA Lc divided by 100. APCA scores contrast from 0, invisible, up to about 106 for black on white and -108 for white on black. That is the reason for the input range of -1.08 to 1.08. The APCA guidelines place body text around Lc 75 to 90, larger fluent text around Lc 60, and headlines or UI boundaries around Lc 45. So `--contrast-text: 0.75` requests contrast at body text grade. The sign picks a direction, not a polarity convention. Positive means the companion comes out lighter than the anchor. Negative means darker.

Inversion is opt-in and only fires when needed. With `--text-invertable: 1`, the solver first tries your requested direction. If that direction cannot reach the target because it hits white or black, the solver compares both directions and takes the one with more contrast. When both directions measure below about Lc 8, the solver keeps your requested direction. With `0`, the default, the solver always follows your sign and saturates at white or black.

## How it works

At build time, for each hue, the library samples the Display P3 gamut boundary with [colorjs.io](https://colorjs.io). It fits the boundary with a tent function plus a sine-based curvature term. It also derives polynomial coefficients that convert OKLCH lightness to the luminance that APCA operates on. This collapses all the hue-dependent color science into a few constants, emitted under the hue's selector:

```css
.blue {
  :is(&, & *):is(.fill, .text) {
    --_color-hue: 250;
    --_color-apexL: 0.623;
    --_color-apexC: 0.22734;
    --_color-tentK: -0.02913;
    /* …luminance-correction coefficients… */
  }
}
```

Everything that depends on runtime inputs is `calc()` with modern CSS math: `pow()`, `sin()`, `sign()`, `abs()`, and `clamp()`. That covers the gamut-relative chroma, the APCA solve for each contrast target, polarity selection, and the soft black clamp. The library stages the math through registered `@property` intermediates inside the selector block of each role:

```css
--color-fill: oklch(var(--lightness) calc(var(--_color-fill-mc) * var(--chroma)) var(--_color-hue));
```

This split is also the reason that hues are classes and not a `--hue` variable. The gamut boundary for a hue can only be sampled, not computed in `calc()`, so each hue must be known at build time. Lightness, chroma, and contrast stay dynamic.

The generated CSS is verbose but compresses well, because it is the same math repeated for each role pair. Measured with the default two roles, one hue is about 13 KB raw and 1.4 KB gzipped. Six hues are about 16 KB and 1.8 KB. Each extra hue costs about 0.5 KB. Role pairs add solver blocks: six hues with four roles, with contrast pairs filtered to the fill, are about 36 KB and 2.7 KB gzipped.

## Roles

A role is a named slot in the system: `fill`, `text`, `border`, or whatever your design uses. Each active role gets a selector block, `.{name}` by default. The element that carries a role class becomes the anchor. The anchor's own color comes from `--lightness` and `--chroma`. The color of every other role on that element is solved relative to the anchor.

Any active role can anchor. The generated `.text` block is the mirror image of `.fill`. Put `.text` on an element and set `--contrast-fill` to derive a background from the text color instead. Which role anchors is a choice you make for each element in markup, not a global one.

Two options shape what the library generates:

- `passive: true` marks a contrast-only target. The role appears as an output on the elements of other roles, for example `--color-ring` solved against the fill. It gets no selector block and can never anchor.
- `contrastsWith: [...]` limits which anchors a role appears on. Every solver pair costs CSS, so trim the pairings that you will never use.

```ts
defineColors({
  hues: [{ name: 'blue', hue: 250 }],
  roles: [
    { name: 'fill' },
    { name: 'text', contrastsWith: ['fill'] },        // only ever solved on .fill
    { name: 'ring', passive: true, contrastsWith: ['fill'] }, // focus ring: output only
  ],
})
```

## API

### `defineColors(options): ColorSystem`

- `hues`, `HueEntry | HueEntry[]`: `{ hue, name?, className? }`. `hue` is in degrees and is normalized into `[0, 360)`. `name` defaults to `hue-{angle}`. `className` defaults to `name`.
- `roles`, `RoleEntry | RoleEntry[]`: `{ name, className?, contrastsWith?, passive? }`. `className` defaults to `name`. At least one non-passive role is required.
- `prefix`, `string`: the namespace for output properties, `--{prefix}-{role}`, and for internals. The default is `'color'`.

Class names are plain strings without the leading dot. `className: 'brand-primary'` emits `.brand-primary`. Classes are the only selector shape for now. Richer selectors will come when fashionable can parse selector text.

Returns `{ css, hues, roles }`. `css` is the stylesheet string. `hues` and `roles` map names to their class names, which helps when you build pickers or docs from the same configuration. The function throws early on an invalid or duplicate name, or an invalid class name. It also throws on a `contrastsWith` reference to an unknown role, or a configuration with no active role.

### `measureContrast(background, foreground, options?): number`

### `computeContrastColor(color, contrast, invert?): Color`

These functions run the same math as the CSS, in TypeScript. Use them for build-time assertions, tests, or static fallbacks that you compute ahead of time. Colors are plain `{ lightness, chroma, hue }` objects in absolute OKLCH coordinates, not the 0 to 1 chroma ratio. `computeContrastColor` clamps its input to the P3 boundary before it solves.

```ts
import { computeContrastColor, measureContrast } from 'ok-apca'

const fill = { lightness: 0.25, chroma: 0.08, hue: 250 }
const text = computeContrastColor(fill, 0.75) // lighter, like --contrast-text: 0.75
measureContrast(fill, text)                   // ≈ -0.75
```

The sign conventions differ, so read them with care. `computeContrastColor` takes the CSS input convention: positive means the result is lighter than the anchor. `measureContrast` reports standard APCA polarity: positive means dark text on a light background, negative means light text on a dark background. Black on white measures `1.0604`, and white on black measures `-1.0788`. So a positive request that yields lighter text measures negative, as in the example above. `measureContrast` uses exact APCA math by default. Pass `{ approximate: true }` to use the same approximations as the generated CSS.

## Browser requirements

The generated CSS depends on `@property`, `oklch()`, CSS nesting with `:is()`, and the CSS math functions `pow()`, `sin()`, `sign()`, `abs()`, and `clamp()` with the `pi` constant. All of these are Baseline. Every evergreen engine shipped them by mid-2024, and `@property` in Firefox 128 was the last gate. The library provides no fallback path for older browsers. If you need one, gate the stylesheet yourself.

## Limitations

- APCA is not WCAG 2. APCA is the contrast method developed for the draft WCAG 3, and its scores do not map one to one onto WCAG 2 ratios. If a contract holds you to WCAG 2.x AA, make sure that a WCAG 2 checker agrees.
- The CSS math is a close approximation, not exact APCA. The soft black clamp and the conversion from OKLCH to luminance use closed-form approximations that keep the expressions small. The browser tests in this repository hold the CSS to the TypeScript reference, and spot checks land within about 1 Lc of the target. Use `measureContrast` when you need exact reference numbers.
- Hues are compile-time. An arbitrary runtime `--hue` is the one thing this architecture cannot do.
- Input names are global. `--lightness`, `--chroma`, `--contrast-{role}`, and `--{role}-invertable` are not namespaced by `prefix`. One set of inputs serves each element tree, shared across systems that reuse role names.
- The gamut boundary is a fit. It is very close across all hues, but not a mathematical guarantee at every lightness.
- Inspecting role elements shows walls of math. DevTools expands every `var()` when it displays computed expressions. This is harmless.

## License

[MIT](./LICENSE)
