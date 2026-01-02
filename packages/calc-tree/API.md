# Calc Tree API Design

## Overview

A TypeScript library for building, evaluating, and serializing mathematical expressions that can be executed as JavaScript or rendered as CSS `calc()` expressions.

## Core Concept

Expressions are immutable tree structures representing mathematical operations. Each expression:

- Can be **evaluated** to a JavaScript number (when all references are bound)
- Can be **serialized** to CSS (always possible, even with unbound references)
- Carries **type information** about which references it requires
- Supports **partial evaluation** for optimization
- Can be **wrapped** as a CSS custom property for reuse

## Type System

### CalcExpression Type

The core `CalcExpression<Refs>` type is generic over a union of string literal reference names:

```typescript
type CalcExpression<Refs extends string = never>
```

- `Refs` is a union of string literals representing required reference names
- An expression with no required references has `Refs = never`
- When an expression binds references, they are removed from the union
- When binding to an expression with references, those are added to the union

### Example Type Flow

```typescript
// CalcExpression requiring 'x' and 'y'
const expr1: CalcExpression<"x" | "y">;

// Bind 'x' to a constant - now only requires 'y'
const expr2: CalcExpression<"y"> = expr1.bind("x", constant(5));

// Bind 'y' to another expression requiring 'z' - now requires 'z'
const expr3: CalcExpression<"z"> = expr2.bind("y", reference("z"));

// Bind 'z' to a constant - now requires nothing
const expr4: CalcExpression<never> = expr3.bind("z", constant(10));

// Can now evaluate to a number
const result: number = expr4.evaluate({});
```

## Construction API

### Constants

```typescript
function constant(value: number): CalcExpression<never>;
```

Creates an expression representing a constant numeric value.

```typescript
const five = constant(5);
const pi = constant(Math.PI); // Will serialize to "pi" in CSS
```

### References

```typescript
function reference<Name extends string>(name: Name): CalcExpression<Name>;
```

Creates an expression representing a variable that must be provided at evaluation time.

```typescript
const x = reference("x");
// Type: CalcExpression<'x'>

const lightness = reference("lightness");
// Type: CalcExpression<'lightness'>
```

### Operations

All operations preserve and merge the reference types of their inputs:

```typescript
function add<A extends string, B extends string>(
  left: CalcExpression<A>,
  right: CalcExpression<B>,
): CalcExpression<A | B>;

function subtract<A extends string, B extends string>(
  left: CalcExpression<A>,
  right: CalcExpression<B>,
): CalcExpression<A | B>;

function multiply<A extends string, B extends string>(
  left: CalcExpression<A>,
  right: CalcExpression<B>,
): CalcExpression<A | B>;

function divide<A extends string, B extends string>(
  left: CalcExpression<A>,
  right: CalcExpression<B>,
): CalcExpression<A | B>;

function power<A extends string, B extends string>(
  base: CalcExpression<A>,
  exponent: CalcExpression<B>,
): CalcExpression<A | B>;

function sin<Refs extends string>(
  arg: CalcExpression<Refs>,
): CalcExpression<Refs>;

function abs<Refs extends string>(
  arg: CalcExpression<Refs>,
): CalcExpression<Refs>;

function sign<Refs extends string>(
  arg: CalcExpression<Refs>,
): CalcExpression<Refs>;

function max<A extends string, B extends string>(
  left: CalcExpression<A>,
  right: CalcExpression<B>,
): CalcExpression<A | B>;

function min<A extends string, B extends string>(
  left: CalcExpression<A>,
  right: CalcExpression<B>,
): CalcExpression<A | B>;

function clamp<A extends string, B extends string, C extends string>(
  minimum: CalcExpression<A>,
  value: CalcExpression<B>,
  maximum: CalcExpression<C>,
): CalcExpression<A | B | C>;
```

### Example Construction

```typescript
import { constant, reference, add, multiply, power } from "@ok-apca/calc-tree";

// f(x) = 2x + 3
const linear = add(multiply(constant(2), reference("x")), constant(3));
// Type: CalcExpression<'x'>

// f(x, y) = x^2 + y^2
const sumOfSquares = add(
  power(reference("x"), constant(2)),
  power(reference("y"), constant(2)),
);
// Type: CalcExpression<'x' | 'y'>
```

## Evaluation API

### Result Types

Evaluation returns a discriminated union:

```typescript
type EvaluationResult =
  | { type: "number"; value: number; css: CSSResult }
  | { type: "expression"; css: CSSResult };

type CSSResult = {
  expression: string;
  declarations: Record<string, string>;
};
```

Both result types include a `css` property (or getter) containing a `CSSResult`. The `CSSResult` contains:

- `expression`: The CSS value to use (either a number or calc expression)
- `declarations`: CSS custom property declarations that must be applied to the same element (property name → value)

### Evaluate Method

```typescript
class CalcExpression<Refs extends string> {
  evaluate(bindings: Record<Refs, CalcExpression<never>>): EvaluationResult;
}
```

When **all** references are bound with constant expressions, evaluation attempts to compute a number. If successful, returns `{ type: 'number', value, css }`. If any reference remains unbound after substitution, returns `{ type: 'expression', css }`.

```typescript
const expr = add(reference("x"), constant(5));

// All references bound with constants - returns number
const result1 = expr.evaluate({ x: constant(10) });
// => { type: 'number', value: 15, css: { expression: '15', declarations: {} } }

// Reference bound to a non-constant expression - returns expression
const result2 = expr.evaluate({ x: reference("runtime") });
// => { type: 'expression', css: { expression: '(var(--runtime) + 5)', declarations: {} } }

// Both results can produce CSS
result1.css.expression; // '15'
result2.css.expression; // '(var(--runtime) + 5)'
```

### Type-Safe Evaluation

TypeScript ensures you provide all required references:

```typescript
const expr = add(reference("x"), reference("y"));
// Type: CalcExpression<'x' | 'y'>

// ✓ Type-safe - all references provided
expr.evaluate({ x: constant(5), y: constant(10) });

// ✗ Type error - missing 'y'
expr.evaluate({ x: constant(5) });

// ✗ Type error - wrong reference name
expr.evaluate({ x: constant(5), z: constant(10) });
```

## Binding API

### Bind Method

```typescript
class CalcExpression<Refs extends string> {
  bind<K extends Refs, R extends string>(
    key: K,
    expr: CalcExpression<R>,
  ): CalcExpression<Exclude<Refs, K> | R>;
}
```

Binds a single reference to an expression, returning a new expression with that reference removed and any references from the bound expression added.

```typescript
const expr = add(multiply(reference("a"), reference("x")), reference("b"));
// Type: CalcExpression<'a' | 'x' | 'b'>

// Bind 'a' to a constant
const step1 = expr.bind("a", constant(2));
// Type: CalcExpression<'x' | 'b'>

// Bind 'b' to another expression with reference 'y'
const step2 = step1.bind("b", add(reference("y"), constant(1)));
// Type: CalcExpression<'x' | 'y'>

// Bind multiple by chaining
const step3 = expr.bind("a", constant(2)).bind("b", constant(3));
// Type: CalcExpression<'x'>
```

### Partial Evaluation

Binding triggers partial evaluation - if a sub-expression becomes fully constant, it's evaluated and replaced with a constant:

```typescript
const expr = add(
  multiply(constant(2), reference("x")),
  multiply(constant(3), constant(4)),
);

// The (3 * 4) is fully known, evaluates to 12
// Simplified internally to: (2 * x) + 12
```

## CSS Custom Property Wrapping

### As Property Method

```typescript
class CalcExpression<Refs extends string> {
  asProperty(name: string): CalcExpression<Refs>;
}
```

Wraps an expression as a CSS custom property declaration. The type signature is unchanged, but the CSS serialization will include a declaration for that property:

```typescript
const baseExpr = add(reference("x"), reference("y"));
// Type: CalcExpression<'x' | 'y'>

const wrapped = baseExpr.asProperty("--sum");
// Type: CalcExpression<'x' | 'y'> (unchanged)

// When serialized to CSS:
const result = wrapped.evaluate({
  x: reference("runtime-x"),
  y: reference("runtime-y"),
});

result.css;
// => {
//   expression: 'var(--sum)',
//   declarations: {
//     '--sum': '(var(--runtime-x) + var(--runtime-y))'
//   }
// }
```

### Nested Property Wrapping

Properties can reference other properties, building up a declarations object:

```typescript
const inner = multiply(reference("x"), constant(2)).asProperty("--doubled");

const outer = add(inner, constant(5)).asProperty("--result");

const result = outer.evaluate({ x: reference("runtime") });

result.css;
// => {
//   expression: 'var(--result)',
//   declarations: {
//     '--doubled': '(var(--runtime) * 2)',
//     '--result': '(var(--doubled) + 5)'
//   }
// }
```

### Property Name Conflicts

If an evaluation tries to declare the same property name twice with different values, an error is thrown:

```typescript
const prop1 = reference("x").asProperty("--value");
const prop2 = reference("y").asProperty("--value");
const expr = add(prop1, prop2);

// Throws error: property '--value' defined multiple times
expr.evaluate({ x: reference("a"), y: reference("b") });
```

## CSS Serialization

### Formatting Rules

- **Constants**: Formatted with minimal precision, trailing zeros removed
  - `1.5` → `"1.5"`
  - `2.0` → `"2"`
  - `Math.PI` → `"pi"`
- **References**: Serialized as `var(--name)` by default
- **Operations**: Binary operations parenthesized only when necessary based on context
- **Functions**: Use CSS syntax: `pow()`, `sin()`, `abs()`, `sign()`, `max()`, `min()`, `clamp()`

### Parenthesization

Operations manage their own parenthesization based on context. For example, an `add()` expression passed to `sin()` doesn't need extra parentheses because the function call provides them:

```typescript
sin(add(reference("x"), constant(1)));
// CSS: "sin(var(--x) + 1)"
// Not: "sin((var(--x) + 1))"
```

However, binary operations add parentheses to their operands to ensure correct precedence:

```typescript
add(multiply(reference("a"), reference("b")), reference("c"));
// CSS: "((var(--a) * var(--b)) + var(--c))"
```

## Advanced Usage Examples

### Building Reusable Formula Functions

```typescript
function quadratic(a: number, b: number, c: number) {
  return <Refs extends string>(
    x: CalcExpression<Refs>,
  ): CalcExpression<Refs> => {
    return add(
      add(
        multiply(constant(a), power(x, constant(2))),
        multiply(constant(b), x),
      ),
      constant(c),
    );
  };
}

const f = quadratic(1, -3, 2);
const expr = f(reference("t"));
// Type: CalcExpression<'t'>

const result = expr.evaluate({ t: constant(2) });
// => { type: 'number', value: 0, css: ... }  // 1(2²) - 3(2) + 2 = 0
```

### Composing Expressions with Different References

```typescript
const radius = add(
  power(reference("x"), constant(2)),
  power(reference("y"), constant(2)),
);
// Type: CalcExpression<'x' | 'y'>

const normalized = divide(radius, reference("scale"));
// Type: CalcExpression<'x' | 'y' | 'scale'>

// Bind scale at build time
const fixedScale = normalized.bind("scale", constant(100));
// Type: CalcExpression<'x' | 'y'>

// Evaluate with runtime x, y
const result = fixedScale.evaluate({
  x: reference("runtime-x"),
  y: reference("runtime-y"),
});

result.css;
// => {
//   expression: '((pow(var(--runtime-x), 2) + pow(var(--runtime-y), 2)) / 100)',
//   declarations: {}
// }
```

### Using Property Wrapping for Reuse

```typescript
// Complex sub-expression used multiple times
const maxChroma = /* ... complex calculation ... */
  .asProperty("--max-chroma");

// Reference the property instead of duplicating the calculation
const clampedChroma = clamp(
  constant(0),
  reference("chroma"),
  maxChroma, // This will use var(--max-chroma) in CSS
);

const result = clampedChroma.evaluate({
  chroma: reference("input-chroma"),
  /* other refs needed by maxChroma */
});

result.css;
// => {
//   expression: 'clamp(0, var(--input-chroma), var(--max-chroma))',
//   declarations: {
//     '--max-chroma': '/* complex calculation */'
//   }
// }
```

### Optimizing with Partial Evaluation

```typescript
// Complex expression with some known values
const expr = add(
  multiply(reference("dynamic"), add(constant(2), constant(3))),
  multiply(constant(4), constant(5)),
);

// Automatic simplification during construction evaluates:
// - (2 + 3) => 5
// - (4 * 5) => 20
// Result: (dynamic * 5) + 20

const result = expr.evaluate({ dynamic: reference("runtime") });

result.css;
// => { expression: '((var(--runtime) * 5) + 20)', declarations: {} }
// Not: '((var(--runtime) * (2 + 3)) + (4 * 5))'
```

## Implementation Notes

### Immutability

All expressions are immutable. Operations return new expressions without modifying inputs.

### Automatic Simplification

The implementation may perform automatic simplification during construction or evaluation:

- Constant folding: `add(constant(2), constant(3))` → `constant(5)`
- Identity elimination: `add(expr, constant(0))` → `expr` (if beneficial)
- Zero multiplication: `multiply(expr, constant(0))` → `constant(0)` (if beneficial)

Simplification rules are applied to reduce complexity, but are not required to be exhaustive.

### Pi Detection

When a constant value equals `Math.PI` (within floating-point precision), it serializes as `"pi"` in CSS rather than a numeric approximation.

### Private Fields

Implementation uses native JavaScript private class syntax `#field` for private state, with the exception of `private constructor`.

## Package Structure

```
@ok-apca/calc-tree/
├── src/
│   ├── types.ts           # Core CalcExpression type and Result types
│   ├── constructors.ts    # constant(), reference(), operations
│   ├── expression.ts      # CalcExpression class implementation
│   ├── evaluate.ts        # Evaluation logic
│   ├── serialize.ts       # CSS serialization
│   └── index.ts           # Public API exports
├── test/
│   ├── construction.spec.ts
│   ├── evaluation.spec.ts
│   ├── serialization.spec.ts
│   ├── binding.spec.ts
│   └── properties.spec.ts
├── package.json
├── tsconfig.json
└── README.md
```

## Future Considerations

- **Variadic operations**: Extend `max()` and `min()` to accept more than two arguments
- **Optimization passes**: More aggressive simplification strategies
- **Custom formatters**: Allow control over number precision and CSS output style
