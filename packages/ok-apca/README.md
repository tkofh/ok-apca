# ok-apca

Generate static CSS that solves [APCA](https://github.com/Myndex/SAPC-APCA) contrast in the cascade. You set a lightness, a chroma, and a contrast target as custom properties. The stylesheet hands back an OKLCH color plus companion colors that hit that contrast target against it. The browser re-solves everything whenever any input changes. All computation happens at build time — no JavaScript ships.

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

In light mode the text resolves dark. In dark mode the same declaration resolves light, because the solver sees that "lighter" is the only direction with enough headroom left. Both land within about 1 Lc of the requested 75. Hover states, user-picked accents, an animated `--lightness` — same deal: you declare the contrast relationship once and it holds in every state CSS can express.

(The `.card` element also carries a role class and sits inside a hue scope — two classes that come from your config. See [Quick start](#quick-start).)

## Why compile this into CSS?

A runtime `getContrastColor(bg)` gives you one answer for one moment. It runs after render, so you either flash the wrong color or do SSR gymnastics. And you have to re-invoke it for every state change — hover, theme toggle, container query, each animation frame — which means effects and observers for things the cascade already handles declaratively.

Compiling the math into CSS inverts that. The contrast target is a custom property, so anything that can set a custom property can drive it: `:hover`, media queries, inline styles from a color picker, keyframes. The generated CSS registers the inputs via `@property` with `syntax: '<number>'`, so they interpolate — `transition: --lightness 150ms` carries every derived color along with it, contrast intact at each frame.

You can't realistically hand-write this with `oklch(from …)` relative color syntax. Hitting an APCA target means inverting APCA's power curves, handling both polarity directions, approximating its soft black clamp, and staying inside the displayable gamut for your hue. That last part isn't expressible in `calc()` — the gamut boundary of a hue slice is an empirical shape, not a formula. So this package samples it at build time (a few milliseconds per hue) and bakes the result into a handful of constants, plus several kilobytes of `calc()` you would not want to maintain by hand.

And `contrast-color()`, the platform's own answer, resolves to black or white only. Fine for a badge; useless for "the same blue, 75 Lc apart."

## Quick start

```sh
npm install -D ok-apca
```

It's an ESM-only Node library, meant to run at build time — a script, not a bundler plugin:

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

Each hue name and role name becomes a class (selectors are configurable). Put the hue class on the element or any ancestor, the role class on the element itself:

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

Three lightness states, one contrast declaration; the text color re-solves for each. Swap `blue` for `orange` and everything re-solves for the other hue.

## The runtime contract

Inputs. All of them inherit, so you can set them on the element or any ancestor:

- `--lightness` (`0`–`1`): OKLCH lightness of the anchor color. Defaults to `0` (black).
- `--chroma` (`0`–`1`): fraction of the maximum chroma available at this lightness and hue. Defaults to `0` (gray).
- `--contrast-{role}` (`-1.08`–`1.08`): target APCA contrast (Lc ÷ 100) between `{role}`'s color and the anchor. Positive = lighter than the anchor, negative = darker. Defaults to `0`, which yields the anchor color itself.
- `--{role}-invertable` (`0` or `1`): `1` lets the solver flip direction when the requested one can't reach the target. Defaults to `0`.

Outputs. `--{prefix}-{role}` is the solved `oklch()` color for each role (`--color-fill`, `--color-text`, … with the default prefix). It inherits, so descendants of a role element can use it. It resolves to `transparent` outside any role scope.

Three things here are non-obvious:

**`--chroma` is a ratio, not an OKLCH chroma.** `--chroma: 0.8` means "80% of the most saturated color this hue offers at the current lightness." The library computes the Display P3 gamut boundary per hue at build time, so as `--lightness` sweeps from 0 to 1 the actual chroma follows the gamut's shape instead of clipping against it. Companion colors reuse the same ratio at their own lightness, which keeps perceived saturation consistent between, say, a fill and its text.

**The contrast scale is APCA Lc ÷ 100.** APCA scores contrast from 0 (invisible) up to about 106 for black-on-white and −108 for white-on-black — hence the ±1.08 input range. APCA's guidelines place body text around Lc 75–90, larger fluent text around Lc 60, and headlines/UI boundaries around Lc 45. So `--contrast-text: 0.75` requests body-text-grade contrast. The sign picks a direction, not a polarity convention: positive means the companion comes out lighter than the anchor, negative darker.

**Inversion is opt-in and only fires when needed.** With `--text-invertable: 1`, the solver first tries your requested direction. Only when that direction can't reach the target — it would slam into white or black — does it compare both directions and take the one that achieves more contrast. When both directions measure below ~Lc 8, it keeps your requested direction. With `0` (the default) it always follows your sign, saturating at white or black.

## How it works

At build time, for each hue, the library samples the Display P3 gamut boundary (via [colorjs.io](https://colorjs.io)) and fits it with a tent function plus a sine-based curvature term, and derives polynomial coefficients for converting OKLCH lightness to the luminance APCA operates on. That collapses all the hue-dependent color science into a few constants, emitted under the hue's selector:

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

The library expresses everything that depends on runtime inputs — the gamut-relative chroma, the APCA solve for each contrast target, polarity selection, the soft black clamp — as `calc()` with modern CSS math (`pow()`, `sin()`, `sign()`, `abs()`, `clamp()`), staged through registered `@property` intermediates inside each role's selector block:

```css
--color-fill: oklch(var(--lightness) calc(var(--_color-fill-mc) * var(--chroma)) var(--_color-hue));
```

This split is also why hues are classes rather than a `--hue` variable: the gamut boundary for a hue can only be sampled, not computed in `calc()`, so each hue you want must be known at build time. Lightness, chroma, and contrast stay fully dynamic.

Generated CSS is verbose but compresses well, since it's the same math repeated per role pair. Measured with the default two roles: one hue ≈ 13 KB raw / 1.4 KB gzipped; six hues ≈ 16 KB / 1.8 KB. Extra hues are cheap (~0.5 KB each); it's role *pairs* that add solver blocks — six hues with four roles (contrast pairs filtered to the fill) ≈ 36 KB / 2.7 KB gzipped.

## Roles

A **role** is a named slot in the system: `fill`, `text`, `border`, whatever your design speaks. Each active role gets a selector block (default `.{name}`). The element carrying a role class becomes the *anchor*: its own color comes from `--lightness`/`--chroma`, and every other role's color on that element is solved relative to it.

Any active role can anchor. The generated `.text` block is the mirror image of `.fill`: put `.text` on an element and set `--contrast-fill` to derive a background from the text color instead. Which role anchors is a per-element choice made in markup, not a global one.

Two options shape what gets generated:

- **`passive: true`** — the role is a contrast-only target: it appears as an output on other roles' elements (e.g. `--color-ring` solved against the fill) but gets no selector block and can never anchor.
- **`contrastsWith: [...]`** — limits which anchors a role appears on. Every solver pair costs CSS, so trim pairings you'll never use.

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

- `hues` (`HueEntry | HueEntry[]`): `{ hue, name?, selector? }`. `hue` is degrees, normalized into `[0, 360)`. `name` defaults to `hue-{angle}`, `selector` to `.{name}`.
- `roles` (`RoleEntry | RoleEntry[]`): `{ name, selector?, contrastsWith?, passive? }`. `selector` defaults to `.{name}`. At least one non-passive role is required.
- `prefix` (`string`): namespace for output properties (`--{prefix}-{role}`) and internals. Defaults to `'color'`.

Returns `{ css, hues, roles }`: `css` is the stylesheet string. `hues` and `roles` map names to their selectors, handy for building pickers or docs from the same config. Throws early on invalid or duplicate names, `contrastsWith` references to unknown roles, or a config with no active role.

### `measureContrast(background, foreground, options?): number`

### `computeContrastColor(color, contrast, invert?): Color`

The same math the CSS runs, as TypeScript — for build-time assertions, tests, or precomputing static fallbacks. Colors are plain `{ lightness, chroma, hue }` objects in absolute OKLCH coordinates (not the 0–1 chroma ratio). `computeContrastColor` clamps its input to the P3 boundary before solving.

```ts
import { computeContrastColor, measureContrast } from 'ok-apca'

const fill = { lightness: 0.25, chroma: 0.08, hue: 250 }
const text = computeContrastColor(fill, 0.75) // lighter, like --contrast-text: 0.75
measureContrast(fill, text)                   // ≈ -0.75
```

Mind the sign conventions, because they differ. `computeContrastColor` takes the CSS input convention: positive = result lighter than the anchor. `measureContrast` reports standard APCA polarity: positive = dark text on a light background, negative = light on dark (black-on-white measures `1.0604`, white-on-black `-1.0788`). So a positive request that yields lighter text *measures* negative, as above. `measureContrast` uses exact APCA math by default; pass `{ approximate: true }` to use the same approximations as the generated CSS.

## Browser requirements

The generated CSS depends on `@property`, `oklch()`, CSS nesting with `:is()`, and CSS math functions (`pow()`, `sin()`, `sign()`, `abs()`, `clamp()`, the `pi` constant). All of these are Baseline: every evergreen engine has shipped them since mid-2024, `@property` in Firefox 128 being the last gate. The library provides no fallback path for older browsers — gate it yourself if you need one.

## Limitations, honestly

- **APCA is not WCAG 2.** It's the contrast method developed for the draft WCAG 3, and its scores don't map 1:1 onto WCAG 2 ratios. If you're contractually held to WCAG 2.x AA, verify with a WCAG 2 checker separately.
- **The CSS math is a close approximation, not exact APCA.** The soft black clamp and the OKLCH→luminance conversion use closed-form approximations chosen to keep expressions small; the repo's browser tests hold the CSS to the TypeScript reference, and spot checks land within about 1 Lc of the target. Use `measureContrast` when you need exact reference numbers.
- **Hues are compile-time.** An arbitrary runtime `--hue` is exactly the thing this architecture cannot do.
- **Input names are global.** `--lightness`, `--chroma`, `--contrast-{role}`, and `--{role}-invertable` are not namespaced by `prefix` — one set of knobs per element tree, shared across systems that reuse role names.
- **The gamut boundary is a fit.** Very close across all hues, but not a mathematical guarantee at every lightness.
- **Inspecting role elements shows walls of math.** DevTools expands every `var()` when displaying computed expressions. Harmless, not pretty.
