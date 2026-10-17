---
"ok-apca": minor
---

Replace the in-repo `@ok-apca/calc-tree` expression library with [`fashionable`](https://www.npmjs.com/package/fashionable). The generated property names, selectors, and computed colors are unchanged. Only the way the stylesheet is assembled differs.

Breaking: rename `selector` to `className` on hue and role entries. `className` is a plain class name without the leading dot. `className: 'brand'` emits `.brand`. Classes are the only selector shape until fashionable can parse selector text. `ColorSystem.hues` and `ColorSystem.roles` now map names to class names.

`defineColors` validates class names the same way it validates role and hue names, and throws on an invalid one.
