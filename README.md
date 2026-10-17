# ok-apca

Generate static CSS that solves [APCA](https://github.com/Myndex/SAPC-APCA) contrast in the cascade. You set a lightness, a chroma, and a contrast target as custom properties. The generated stylesheet returns a gamut-mapped OKLCH color and companion colors that meet the contrast target against it. All computation happens at build time. No JavaScript ships.

```css
.card {
  --lightness: 0.92;
  --chroma: 0.3;
  --contrast-text: 0.75; /* APCA Lc 75 between text and fill */

  background: var(--color-fill);
  color: var(--color-text);
}
```

| Package                        | Description                                                                                                             |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------- |
| [`ok-apca`](packages/ok-apca)  | The library. `defineColors` turns a hue and role configuration into a stylesheet. Published to npm. ESM-only, Node 24+. |
| `playground`                   | A private Nuxt app to look at the generated colors visually. Run it with `pnpm dev`.                                     |

The [package README](packages/ok-apca/README.md) has the quick start, the runtime contract, the API, and the limitations.

## Development

The repo uses pnpm 10 and Turborepo. `pnpm build`, `pnpm test`, and `pnpm typecheck` run across the packages through turbo. `pnpm check` runs biome and writes its fixes, and `pnpm check:report` only reports. The browser tests run in headless Chromium through Playwright.

[CLAUDE.md](CLAUDE.md) documents the architecture and the CSS expression size constraint that shapes it. [RELEASING.md](RELEASING.md) documents the release flow, which uses Changesets and npm trusted publishing.

## License

[MIT](LICENSE)
