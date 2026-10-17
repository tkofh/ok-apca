---
"ok-apca": minor
---

Replace the in-repo `@ok-apca/calc-tree` expression library with [`fashionable`](https://www.npmjs.com/package/fashionable). The generated property names, selectors, and computed colors are unchanged; only how the stylesheet is assembled differs.

**Breaking:** the `selector` option on hue and role entries is now `className`, a plain class name written without the leading dot (`className: 'brand'` emits `.brand`). Classes are the only selector shape until fashionable can parse selector text. `ColorSystem.hues` and `ColorSystem.roles` map names to class names accordingly.

Class names are validated like role and hue names; an invalid one throws from `defineColors`.
