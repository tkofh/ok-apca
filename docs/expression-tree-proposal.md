# Expression Tree Architecture for JS/CSS Parity

## Problem Statement

The current architecture has two separate implementations of the same mathematical formulas:

1. **TypeScript functions** (`color.ts`, `apca.ts`, `contrast.ts`) - evaluated at runtime in JS
2. **CSS generation** (`generator.ts`) - string templates that produce CSS `calc()` expressions

While we've centralized constants, the formulas themselves are still duplicated. If someone changes the max chroma calculation in `color.ts` but forgets to update `generator.ts`, the JS and CSS will produce different results.

## Proposed Solution: Expression Trees

Define formulas once as expression trees that can be:

- **Evaluated** as JavaScript (for tooling/build-time calculations)
- **Serialized** as CSS `calc()` expressions (for generated stylesheets)

Since all our formulas use only operations available in CSS (`+`, `-`, `*`, `/`, `pow`, `sin`, `abs`, `sign`, `max`, `min`, `clamp`, `pi`), there's a 1:1 mapping between JS evaluation and CSS serialization.

### Core Expression Types

```typescript
// expr.ts

type Expr =
  | { type: "const"; value: number }
  | { type: "var"; name: string }
  | { type: "add"; left: Expr; right: Expr }
  | { type: "sub"; left: Expr; right: Expr }
  | { type: "mul"; left: Expr; right: Expr }
  | { type: "div"; left: Expr; right: Expr }
  | { type: "pow"; base: Expr; exp: Expr }
  | { type: "sin"; arg: Expr }
  | { type: "abs"; arg: Expr }
  | { type: "sign"; arg: Expr }
  | { type: "max"; args: Expr[] }
  | { type: "min"; args: Expr[] }
  | { type: "clamp"; min: Expr; val: Expr; max: Expr }
  | { type: "pi" };

// Builder functions
const num = (value: number): Expr => ({ type: "const", value });
const ref = (name: string): Expr => ({ type: "var", name });
const add = (left: Expr, right: Expr): Expr => ({ type: "add", left, right });
const sub = (left: Expr, right: Expr): Expr => ({ type: "sub", left, right });
const mul = (left: Expr, right: Expr): Expr => ({ type: "mul", left, right });
const div = (left: Expr, right: Expr): Expr => ({ type: "div", left, right });
const pow = (base: Expr, exp: Expr): Expr => ({ type: "pow", base, exp });
const sin = (arg: Expr): Expr => ({ type: "sin", arg });
const abs = (arg: Expr): Expr => ({ type: "abs", arg });
const sign = (arg: Expr): Expr => ({ type: "sign", arg });
const max = (...args: Expr[]): Expr => ({ type: "max", args });
const min = (...args: Expr[]): Expr => ({ type: "min", args });
const clamp = (lo: Expr, val: Expr, hi: Expr): Expr => ({
  type: "clamp",
  min: lo,
  val,
  max: hi,
});
const pi: Expr = { type: "pi" };
```

### Evaluation (JS)

```typescript
type Bindings = Record<string, number>;

function evaluate(expr: Expr, bindings: Bindings): number {
  switch (expr.type) {
    case "const":
      return expr.value;
    case "var":
      return bindings[expr.name];
    case "add":
      return evaluate(expr.left, bindings) + evaluate(expr.right, bindings);
    case "sub":
      return evaluate(expr.left, bindings) - evaluate(expr.right, bindings);
    case "mul":
      return evaluate(expr.left, bindings) * evaluate(expr.right, bindings);
    case "div":
      return evaluate(expr.left, bindings) / evaluate(expr.right, bindings);
    case "pow":
      return Math.pow(
        evaluate(expr.base, bindings),
        evaluate(expr.exp, bindings),
      );
    case "sin":
      return Math.sin(evaluate(expr.arg, bindings));
    case "abs":
      return Math.abs(evaluate(expr.arg, bindings));
    case "sign":
      return Math.sign(evaluate(expr.arg, bindings));
    case "max":
      return Math.max(...expr.args.map((a) => evaluate(a, bindings)));
    case "min":
      return Math.min(...expr.args.map((a) => evaluate(a, bindings)));
    case "clamp":
      return Math.max(
        evaluate(expr.min, bindings),
        Math.min(evaluate(expr.max, bindings), evaluate(expr.val, bindings)),
      );
    case "pi":
      return Math.PI;
  }
}
```

### Serialization (CSS)

```typescript
type CssVars = Record<string, string>;

function toCss(expr: Expr, vars: CssVars): string {
  const n = (v: number) => v.toFixed(5).replace(/\.?0+$/, "") || "0";

  switch (expr.type) {
    case "const":
      return n(expr.value);
    case "var":
      return vars[expr.name] ?? `var(--${expr.name})`;
    case "add":
      return `(${toCss(expr.left, vars)} + ${toCss(expr.right, vars)})`;
    case "sub":
      return `(${toCss(expr.left, vars)} - ${toCss(expr.right, vars)})`;
    case "mul":
      return `(${toCss(expr.left, vars)} * ${toCss(expr.right, vars)})`;
    case "div":
      return `(${toCss(expr.left, vars)} / ${toCss(expr.right, vars)})`;
    case "pow":
      return `pow(${toCss(expr.base, vars)}, ${toCss(expr.exp, vars)})`;
    case "sin":
      return `sin(${toCss(expr.arg, vars)})`;
    case "abs":
      return `abs(${toCss(expr.arg, vars)})`;
    case "sign":
      return `sign(${toCss(expr.arg, vars)})`;
    case "max":
      return `max(${expr.args.map((a) => toCss(a, vars)).join(", ")})`;
    case "min":
      return `min(${expr.args.map((a) => toCss(a, vars)).join(", ")})`;
    case "clamp":
      return `clamp(${toCss(expr.min, vars)}, ${toCss(expr.val, vars)}, ${toCss(expr.max, vars)})`;
    case "pi":
      return "pi";
  }
}
```

### Defining Formulas Once

```typescript
// formulas.ts

import { GAMUT_SINE_CURVATURE_EXPONENT } from "./constants.ts";

/**
 * Maximum chroma at a given lightness using the tent function.
 */
function maxChromaExpr(
  apex: { lightness: number; chroma: number },
  curvature: number,
): Expr {
  const L = ref("lightness");
  const apexL = num(apex.lightness);
  const apexC = num(apex.chroma);

  // Left half: linear from origin to apex
  const leftSlope = num(apex.chroma / apex.lightness);
  const leftHalf = mul(leftSlope, L);

  // Right half: linear + sine correction
  const rightSlope = num(apex.chroma / (1 - apex.lightness));
  const t = max(num(0), div(sub(L, apexL), num(1 - apex.lightness)));
  const linearPart = mul(rightSlope, sub(num(1), L));
  const sinePart = mul(
    num(curvature * apex.chroma),
    pow(sin(mul(t, pi)), num(GAMUT_SINE_CURVATURE_EXPONENT)),
  );
  const rightHalf = add(linearPart, sinePart);

  // Branch: (1 - isRight) * left + isRight * right
  const isRight = max(num(0), sign(sub(L, apexL)));
  return add(mul(sub(num(1), isRight), leftHalf), mul(isRight, rightHalf));
}
```

### Usage

```typescript
// color.ts - JS evaluation

export function getMaxChroma(lightness: number, hue: number): number {
  const slice = findGamutSlice(hue);
  const expr = maxChromaExpr(slice.apex, slice.curvature);
  return evaluate(expr, { lightness });
}
```

```typescript
// generator.ts - CSS generation

function cssMaxChroma(lightnessVar: string, slice: GamutSlice): string {
  const expr = maxChromaExpr(slice.apex, slice.curvature);
  return toCss(expr, { lightness: lightnessVar });
}
```

## Partial Evaluation

When some variables are known at build time, we can substitute them and simplify the expression before serialization.

```typescript
function partialEval(expr: Expr, known: Record<string, number>): Expr {
  switch (expr.type) {
    case "const":
      return expr;

    case "var":
      return expr.name in known ? num(known[expr.name]) : expr;

    case "add": {
      const left = partialEval(expr.left, known);
      const right = partialEval(expr.right, known);
      if (left.type === "const" && right.type === "const") {
        return num(left.value + right.value);
      }
      if (left.type === "const" && left.value === 0) return right;
      if (right.type === "const" && right.value === 0) return left;
      return add(left, right);
    }

    // ... similar for other operations

    case "pi":
      return num(Math.PI);
  }
}
```

### Example: Fixed Lightness

```typescript
const expr = maxChromaExpr(slice.apex, slice.curvature);

// Fully dynamic - lightness is a CSS variable
toCss(expr, { lightness: "var(--_lum-norm)" });
// => complex calc() expression

// Fixed lightness - substitute and simplify
const simplified = partialEval(expr, { lightness: 0.5 });
toCss(simplified, {});
// => "0.25" (just a number, no calc needed)
```

This enables future API options like:

```typescript
defineHue({
  hue: 240,
  selector: ".blue",
  fixed: { lightness: 50 }, // generates simpler CSS
});
```

## Benefits

1. **Structural parity**: Formula defined once, impossible for JS and CSS to drift
2. **Type safety**: Invalid expressions caught at compile time
3. **Testability**: Test the formula once, both outputs are guaranteed correct
4. **Partial evaluation**: Pre-compute what's known, simplify CSS output
5. **Inspectable**: Expression trees can be logged, visualized, or transformed

## Implementation Plan

### Phase 1: Core Infrastructure

- Define `Expr` type and builder functions
- Implement `evaluate()` and `toCss()`
- Add unit tests

### Phase 2: Migrate Gamut Mapping

- Define `maxChromaExpr()`
- Update `color.ts` and `generator.ts` to use it
- Verify parity tests pass

### Phase 3: Migrate APCA

- Define APCA formula expressions
- Update `apca.ts`, `contrast.ts`, and `generator.ts`
- Verify parity tests pass

### Phase 4: Partial Evaluation

- Implement `partialEval()`
- Add `fixed` option to API
- Add tests for simplified output
