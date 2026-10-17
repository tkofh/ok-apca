# ok-apca

## 0.3.0

### Minor Changes

- 7b33a42: Replace the in-repo `@ok-apca/calc-tree` expression library with [`fashionable`](https://www.npmjs.com/package/fashionable). The generated property names, selectors, and computed colors are unchanged. Only the way the stylesheet is assembled differs.
  
  Breaking: rename `selector` to `className` on hue and role entries. `className` is a plain class name without the leading dot. `className: 'brand'` emits `.brand`. Classes are the only selector shape until fashionable can parse selector text. `ColorSystem.hues` and `ColorSystem.roles` now map names to class names.
  
  `defineColors` validates class names the same way it validates role and hue names, and throws on an invalid one.

## 0.2.0

### Minor Changes

- 074a013: refactor options and css output to center Color Sets

### Patch Changes

- Updated dependencies [074a013]
  - @ok-apca/calc-tree@0.2.0

## 0.1.0

### Minor Changes

- 3144b19: initial release

### Patch Changes

- Updated dependencies [3144b19]
  - @ok-apca/calc-tree@0.1.0
