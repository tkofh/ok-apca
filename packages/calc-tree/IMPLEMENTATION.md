# Calc Tree Implementation Guide

## Internal Representation

### Node Class Hierarchy

Each node type is implemented as a class that implements the `CalcNode` interface:

```typescript
// Base interface that all node classes implement
interface CalcNode {
  readonly kind: string;

  substitute(bindings: Record<string, CalcNode>): CalcNode;
  isConstant(): boolean;
  evaluateConstant(): number;
  serialize(declarations: Record<string, string>): string;
}

// Example node classes
class ConstantNode implements CalcNode {
  readonly kind = "constant";

  constructor(public readonly value: number) {}

  substitute(bindings: Record<string, CalcNode>): CalcNode {
    return this;
  }

  isConstant(): boolean {
    return true;
  }

  evaluateConstant(): number {
    return this.value;
  }

  serialize(declarations: Record<string, string>): string {
    return formatNumber(this.value);
  }
}

class ReferenceNode implements CalcNode {
  readonly kind = "reference";

  constructor(public readonly name: string) {}

  substitute(bindings: Record<string, CalcNode>): CalcNode {
    return bindings[this.name] ?? this;
  }

  isConstant(): boolean {
    return false;
  }

  evaluateConstant(): number {
    throw new Error("Cannot evaluate non-constant reference");
  }

  serialize(declarations: Record<string, string>): string {
    return `var(--${this.name})`;
  }
}

class AddNode implements CalcNode {
  readonly kind = "add";

  constructor(
    public readonly left: CalcNode,
    public readonly right: CalcNode,
  ) {}

  substitute(bindings: Record<string, CalcNode>): CalcNode {
    const left = this.left.substitute(bindings);
    const right = this.right.substitute(bindings);
    return simplifyAdd(left, right);
  }

  isConstant(): boolean {
    return this.left.isConstant() && this.right.isConstant();
  }

  evaluateConstant(): number {
    return this.left.evaluateConstant() + this.right.evaluateConstant();
  }

  serialize(declarations: Record<string, string>): string {
    const left = this.left.serialize(declarations);
    const right = this.right.serialize(declarations);
    return `${left} + ${right}`;
  }
}

// Similar classes for other operations:
// SubtractNode, MultiplyNode, DivideNode, PowerNode
// SinNode, AbsNode, SignNode, MaxNode, MinNode, ClampNode
// PropertyNode
```

### CalcExpression Class

The public `CalcExpression` class wraps a node and tracks references:

```typescript
export class CalcExpression<Refs extends string> {
  #node: CalcNode;
  #refs: Set<string>;

  private constructor(node: CalcNode, refs: Set<string>) {
    this.#node = node;
    this.#refs = refs;
  }

  // Public API methods...
}
```

The `CalcExpression` class:

- Uses native JavaScript private fields `#node` and `#refs`
- Wraps an immutable node tree
- Tracks required references in a `Set<string>`
- The generic `Refs` type parameter is purely for compile-time type safety (union of string literals)
- At runtime, `#refs` contains the actual reference names

## Type System Details

### Generic Parameter

The generic `Refs extends string` is a **union of string literals**, not a record:

```typescript
// Correct
CalcExpression<"x" | "y">;
CalcExpression<"lightness" | "chroma">;
CalcExpression<never>; // no references
```

### Type Operations

```typescript
// Adding references: union
type A = "x";
type B = "y";
type Combined = A | B; // 'x' | 'y'

// Removing references: Exclude
type Refs = "x" | "y" | "z";
type Without = Exclude<Refs, "x">; // 'y' | 'z'

// Binding that adds new refs
type Original = "x" | "y";
type BoundRefs = "z";
type Result = Exclude<Original, "x"> | BoundRefs; // 'y' | 'z'
```

## Simplification Strategy

### Goal: Optimal CSS Output

The primary goal is to produce optimal, simplified CSS output. This means:

- Constant folding: `2 + 3` → `5`
- Identity elimination: `x + 0` → `x`, `x * 1` → `x`
- Zero propagation: `x * 0` → `0`

### When to Simplify

Simplification can be performed at different stages:

1. **Eager** - during construction (`add()`, `multiply()`, etc.) or binding
2. **Lazy** - during evaluation/serialization traversal

Both approaches can produce optimal CSS. Choose based on implementation clarity:

- Eager: Apply rules when building/modifying trees
- Lazy: Apply rules during evaluation/serialization traversal

The key is that optimizations happen _somewhere_ before CSS generation, not that we repeatedly traverse the tree looking for optimization opportunities.

### Constant Folding

When both operands are constants, evaluate immediately:

```typescript
// add(constant(2), constant(3)) => constant(5)
// multiply(constant(4), constant(5)) => constant(20)
```

This can be done during construction or evaluation:

```typescript
function simplifyAdd(left: CalcNode, right: CalcNode): CalcNode {
  // Constant folding
  if (left instanceof ConstantNode && right instanceof ConstantNode) {
    return new ConstantNode(left.value + right.value);
  }

  // Identity: x + 0 = x
  if (right instanceof ConstantNode && right.value === 0) {
    return left;
  }
  if (left instanceof ConstantNode && left.value === 0) {
    return right;
  }

  return new AddNode(left, right);
}
```

### When to Simplify

If simplification is performed eagerly:

- Apply during operation constructors (`add()`, `multiply()`, etc.)
- Apply during `bind()` after substitution

If simplification is performed lazily:

- Apply during evaluation before checking if constant
- May produce larger CSS output but simpler implementation

Choose the approach that keeps the implementation clearest.

## Node Class Implementations

### Complete Node Classes

Each operation is implemented as its own class:

```typescript
class ConstantNode implements CalcNode {
  readonly kind = "constant";

  constructor(public readonly value: number) {}

  substitute(bindings: Record<string, CalcNode>): CalcNode {
    return this;
  }

  isConstant(): boolean {
    return true;
  }

  evaluateConstant(): number {
    return this.value;
  }

  serialize(declarations: Record<string, string>): string {
    return formatNumber(this.value);
  }
}

class ReferenceNode implements CalcNode {
  readonly kind = "reference";

  constructor(public readonly name: string) {}

  substitute(bindings: Record<string, CalcNode>): CalcNode {
    return bindings[this.name] ?? this;
  }

  isConstant(): boolean {
    return false;
  }

  evaluateConstant(): number {
    throw new Error("Cannot evaluate non-constant reference");
  }

  serialize(declarations: Record<string, string>): string {
    return `var(--${this.name})`;
  }
}

class AddNode implements CalcNode {
  readonly kind = "add";

  constructor(
    public readonly left: CalcNode,
  public readonly right: CalcNode,
  ) {}

  substitute(bindings: Record<string, CalcNode>): CalcNode {
```

    const left = this.left.substitute(bindings);
    const right = this.right.substitute(bindings);
    return simplifyAdd(left, right);

}

isConstant(): boolean {
return this.left.isConstant() && this.right.isConstant();
}

evaluateConstant(): number {
return this.left.evaluateConstant() + this.right.evaluateConstant();
}

serialize(declarations: Record<string, string>): string {
const left = this.left.serialize(declarations);
const right = this.right.serialize(declarations);
return `${left} + ${right}`;
}
}

class SubtractNode implements CalcNode {
readonly kind = "subtract";

constructor(
public readonly left: CalcNode,
public readonly right: CalcNode,
) {}

substitute(bindings: Record<string, CalcNode>): CalcNode {
const left = this.left.substitute(bindings);
const right = this.right.substitute(bindings);
return simplifySubtract(left, right);
}

isConstant(): boolean {
return this.left.isConstant() && this.right.isConstant();
}

evaluateConstant(): number {
return this.left.evaluateConstant() - this.right.evaluateConstant();
}

serialize(declarations: Record<string, string>): string {
const left = this.left.serialize(declarations);
const right = this.right.serialize(declarations);
return `${left} - ${right}`;
}
}

class MultiplyNode implements CalcNode {
readonly kind = "multiply";

constructor(
public readonly left: CalcNode,
public readonly right: CalcNode,
) {}

substitute(bindings: Record<string, CalcNode>): CalcNode {
const left = this.left.substitute(bindings);
const right = this.right.substitute(bindings);
return simplifyMultiply(left, right);
}

isConstant(): boolean {
return this.left.isConstant() && this.right.isConstant();
}

evaluateConstant(): number {
return this.left.evaluateConstant() \* this.right.evaluateConstant();
}

serialize(declarations: Record<string, string>): string {
// Wrap operands if they are lower precedence (add/subtract)
const left = this.needsParens(this.left)
? `(${this.left.serialize(declarations)})`
: this.left.serialize(declarations);
const right = this.needsParens(this.right)
? `(${this.right.serialize(declarations)})`
: this.right.serialize(declarations);
return `${left} * ${right}`;
}

private needsParens(node: CalcNode): boolean {
return node.kind === "add" || node.kind === "subtract";
}
}

class DivideNode implements CalcNode {
readonly kind = "divide";

constructor(
public readonly left: CalcNode,
public readonly right: CalcNode,
) {}

substitute(bindings: Record<string, CalcNode>): CalcNode {
const left = this.left.substitute(bindings);
const right = this.right.substitute(bindings);
return simplifyDivide(left, right);
}

isConstant(): boolean {
return this.left.isConstant() && this.right.isConstant();
}

evaluateConstant(): number {
return this.left.evaluateConstant() / this.right.evaluateConstant();
}

serialize(declarations: Record<string, string>): string {
const left = this.needsParens(this.left)
? `(${this.left.serialize(declarations)})`
: this.left.serialize(declarations);
const right = this.needsParens(this.right)
? `(${this.right.serialize(declarations)})`
: this.right.serialize(declarations);
return `${left} / ${right}`;
}

private needsParens(node: CalcNode): boolean {
return node.kind === "add" || node.kind === "subtract";
}
}

class PowerNode implements CalcNode {
readonly kind = "power";

constructor(
public readonly base: CalcNode,
public readonly exponent: CalcNode,
) {}

substitute(bindings: Record<string, CalcNode>): CalcNode {
const base = this.base.substitute(bindings);
const exponent = this.exponent.substitute(bindings);
return simplifyPower(base, exponent);
}

isConstant(): boolean {
return this.base.isConstant() && this.exponent.isConstant();
}

evaluateConstant(): number {
return Math.pow(this.base.evaluateConstant(), this.exponent.evaluateConstant());
}

serialize(declarations: Record<string, string>): string {
const base = this.base.serialize(declarations);
const exp = this.exponent.serialize(declarations);
return `pow(${base}, ${exp})`;
}
}

class SinNode implements CalcNode {
readonly kind = "sin";

constructor(public readonly arg: CalcNode) {}

substitute(bindings: Record<string, CalcNode>): CalcNode {
const arg = this.arg.substitute(bindings);
return simplifySin(arg);
}

isConstant(): boolean {
return this.arg.isConstant();
}

evaluateConstant(): number {
return Math.sin(this.arg.evaluateConstant());
}

serialize(declarations: Record<string, string>): string {
const arg = this.arg.serialize(declarations);
return `sin(${arg})`;
}
}

class AbsNode implements CalcNode {
readonly kind = "abs";

constructor(public readonly arg: CalcNode) {}

substitute(bindings: Record<string, CalcNode>): CalcNode {
const arg = this.arg.substitute(bindings);
return simplifyAbs(arg);
}

isConstant(): boolean {
return this.arg.isConstant();
}

evaluateConstant(): number {
return Math.abs(this.arg.evaluateConstant());
}

serialize(declarations: Record<string, string>): string {
const arg = this.arg.serialize(declarations);
return `abs(${arg})`;
}
}

class SignNode implements CalcNode {
readonly kind = "sign";

constructor(public readonly arg: CalcNode) {}

substitute(bindings: Record<string, CalcNode>): CalcNode {
const arg = this.arg.substitute(bindings);
return simplifySign(arg);
}

isConstant(): boolean {
return this.arg.isConstant();
}

evaluateConstant(): number {
return Math.sign(this.arg.evaluateConstant());
}

serialize(declarations: Record<string, string>): string {
const arg = this.arg.serialize(declarations);
return `sign(${arg})`;
}
}

class MaxNode implements CalcNode {
readonly kind = "max";

constructor(
public readonly left: CalcNode,
public readonly right: CalcNode,
) {}

substitute(bindings: Record<string, CalcNode>): CalcNode {
const left = this.left.substitute(bindings);
const right = this.right.substitute(bindings);
return simplifyMax(left, right);
}

isConstant(): boolean {
return this.left.isConstant() && this.right.isConstant();
}

evaluateConstant(): number {
return Math.max(this.left.evaluateConstant(), this.right.evaluateConstant());
}

serialize(declarations: Record<string, string>): string {
const left = this.left.serialize(declarations);
const right = this.right.serialize(declarations);
return `max(${left}, ${right})`;
}
}

class MinNode implements CalcNode {
readonly kind = "min";

constructor(
public readonly left: CalcNode,
public readonly right: CalcNode,
) {}

substitute(bindings: Record<string, CalcNode>): CalcNode {
const left = this.left.substitute(bindings);
const right = this.right.substitute(bindings);
return simplifyMin(left, right);
}

isConstant(): boolean {
return this.left.isConstant() && this.right.isConstant();
}

evaluateConstant(): number {
return Math.min(this.left.evaluateConstant(), this.right.evaluateConstant());
}

serialize(declarations: Record<string, string>): string {
const left = this.left.serialize(declarations);
const right = this.right.serialize(declarations);
return `min(${left}, ${right})`;
}
}

class ClampNode implements CalcNode {
readonly kind = "clamp";

constructor(
public readonly minimum: CalcNode,
public readonly value: CalcNode,
public readonly maximum: CalcNode,
) {}

substitute(bindings: Record<string, CalcNode>): CalcNode {
const minimum = this.minimum.substitute(bindings);
const value = this.value.substitute(bindings);
const maximum = this.maximum.substitute(bindings);
return simplifyClamp(minimum, value, maximum);
}

isConstant(): boolean {
return this.minimum.isConstant() && this.value.isConstant() && this.maximum.isConstant();
}

evaluateConstant(): number {
const min = this.minimum.evaluateConstant();
const val = this.value.evaluateConstant();
const max = this.maximum.evaluateConstant();
return Math.max(min, Math.min(val, max));
}

serialize(declarations: Record<string, string>): string {
const min = this.minimum.serialize(declarations);
const val = this.value.serialize(declarations);
const max = this.maximum.serialize(declarations);
return `clamp(${min}, ${val}, ${max})`;
}
}

class PropertyNode implements CalcNode {
readonly kind = "property";

constructor(
public readonly name: string,
public readonly expr: CalcNode,
) {}

substitute(bindings: Record<string, CalcNode>): CalcNode {
const expr = this.expr.substitute(bindings);
return new PropertyNode(this.name, expr);
}

isConstant(): boolean {
return this.expr.isConstant();
}

evaluateConstant(): number {
return this.expr.evaluateConstant();
}

serialize(declarations: Record<string, string>): string {
// Serialize the inner expression
const value = this.expr.serialize(declarations);

    // Check for conflicts
    if (this.name in declarations && declarations[this.name] !== value) {
      throw new Error(
        `Property '${this.name}' defined multiple times with different values`,
      );
    }

    // Add to declarations
    declarations[this.name] = value;

    // Return reference to the property
    return `var(${this.name})`;

}
}

````

### Benefits

- Each operation is self-contained in its own class
- Logic is colocated with the data it operates on
- Easy to add new operations - just create a new class
- Type safety with `instanceof` checks
- Clear ownership of behavior

## Evaluation Algorithm

### Result Types

```typescript
export type EvaluationResult =
  | { type: "number"; value: number; css: CSSResult }
  | { type: "expression"; css: CSSResult };

export type CSSResult = {
  expression: string;
  declarations: Record<string, string>;
};
````

### Evaluation Flow

```typescript
function evaluate(
  node: CalcNode,
  bindings: Record<string, CalcExpression<never>>,
): EvaluationResult {
  // Extract nodes from bound expressions
  const nodeBindings: Record<string, CalcNode> = {};
  for (const key in bindings) {
    nodeBindings[key] = bindings[key].#node;
  }

  // Substitute all bound references (with optimization during traversal)
  const substituted = node.substitute(nodeBindings);

  // Check if result is fully constant
  if (substituted.isConstant()) {
    const value = substituted.evaluateConstant();
    const declarations: Record<string, string> = {};
    const expression = substituted.serialize(declarations);
    return { type: "number", value, css: { expression, declarations } };
  }

  // Has unbound references
  const declarations: Record<string, string> = {};
  const expression = substituted.serialize(declarations);
  return { type: "expression", css: { expression, declarations } };
}
```

Each node class implements the interface methods. For example:

```typescript
// ReferenceNode checks bindings
substitute(bindings: Record<string, CalcNode>): CalcNode {
  if (this.name in bindings) {
    return bindings[this.name];
  }
  return this;
}

// ConstantNode doesn't change
substitute(bindings: Record<string, CalcNode>): CalcNode {
  return this;
}

// AddNode recursively substitutes children
substitute(bindings: Record<string, CalcNode>): CalcNode {
  const left = this.left.substitute(bindings);
  const right = this.right.substitute(bindings);
  return simplifyAdd(left, right);
}
```

## Serialization Algorithm

### Number Formatting

```typescript
function formatNumber(n: number): string {
  // Check if this is pi
  if (Math.abs(n - Math.PI) < 1e-10) {
    return "pi";
  }

  // Format with precision of 5
  const formatted = n.toPrecision(5);

  // Remove trailing zeros and unnecessary decimal point
  return formatted.replace(/\.?0+$/, "") || "0";
}

// Examples:
// 1.5000 => "1.5"
// 2.0000 => "2"
// 0.33333 => "0.33333"
// Math.PI => "pi"
```

### CSS Serialization

The top-level serialization delegates to the polymorphic node methods:

```typescript
function serializeToCss(node: CalcNode): CSSResult {
  const declarations: Record<string, string> = {};
  const expression = node.serialize(declarations);

  return { expression, declarations };
}
```

### Parenthesization Strategy

Each node's `serialize` method returns its result **without wrapping in parentheses**. Parent nodes are responsible for wrapping their children's results when necessary to maintain correct operator precedence.

The strategy:

- **Constants and references**: Never need parentheses
- **Addition and subtraction**: Return unwrapped `a + b` or `a - b`
- **Multiplication and division**: Wrap their operands only if the operand is add/subtract
- **Function calls** (sin, pow, max, min, clamp, etc.): Arguments don't need wrapping since the function call syntax provides grouping

This produces **minimal** parenthesization:

```typescript
// sin(x + 1) - AddNode returns "x + 1", SinNode wraps as "sin(x + 1)"
sin(add(x, one));
// Result: "sin(var(--x) + 1)"

// (a + b) * c - AddNode returns "a + b", MultiplyNode wraps left operand
multiply(add(a, b), c);
// Result: "(var(--a) + var(--b)) * var(--c)"

// a + b + c - Inner AddNode returns "a + b", outer returns "a + b + c"
add(add(a, b), c);
// Result: "var(--a) + var(--b) + var(--c)"

// (a * b) + c - MultiplyNode returns "a * b", AddNode doesn't wrap
add(multiply(a, b), c);
// Result: "var(--a) * var(--b) + var(--c)"
```

The `MultiplyNode` and `DivideNode` classes include a helper method to determine when parentheses are needed:

```typescript
class MultiplyNode implements CalcNode {
  // ... other methods ...

  serialize(declarations: Record<string, string>): string {
    const left = this.needsParens(this.left)
      ? `(${this.left.serialize(declarations)})`
      : this.left.serialize(declarations);
    const right = this.needsParens(this.right)
      ? `(${this.right.serialize(declarations)})`
      : this.right.serialize(declarations);
    return `${left} * ${right}`;
  }

  private needsParens(node: CalcNode): boolean {
    return node.kind === "add" || node.kind === "subtract";
  }
}
```

## Property Wrapping Implementation

### As Property Method

```typescript
class CalcExpression<Refs extends string> {
  asProperty(name: string): CalcExpression<Refs> {
    // Wrap the current node in a property node
    const propertyNode = new PropertyNode(name, this.#node);

    // References remain unchanged
    return new CalcExpression(propertyNode, new Set(this.#refs));
  }
}
```

### Property Declaration Collection

When serializing, the `PropertyNode` class adds to the declarations record and checks for conflicts:

```typescript
class PropertyNode implements CalcNode {
  // ...

  serialize(declarations: Record<string, string>): string {
    const value = this.expr.serialize(declarations);

    if (this.name in declarations && declarations[this.name] !== value) {
      throw new Error(
        `Property '${this.name}' defined multiple times with different values`,
      );
    }

    declarations[this.name] = value;
    return `var(${this.name})`;
  }
}
```

## Binding Implementation

### Single-Argument Bind

```typescript
class CalcExpression<Refs extends string> {
  bind<K extends Refs, R extends string>(
    key: K,
    expr: CalcExpression<R>,
  ): CalcExpression<Exclude<Refs, K> | R> {
    // Substitute the reference in the tree
    const nodeBindings: Record<string, CalcNode> = { [key]: expr.#node };
    const newNode = this.#node.substitute(nodeBindings);

    // Update reference set
    const newRefs = new Set(this.#refs);
    newRefs.delete(key);

    // Add references from the bound expression
    for (const ref of expr.#refs) {
      newRefs.add(ref);
    }

    return new CalcExpression(newNode, newRefs) as CalcExpression<
      Exclude<Refs, K> | R
    >;
  }
}
```

### Reference Merging Example

```typescript
const exprA = add(reference("x"), reference("y"));
// refs: Set(['x', 'y'])

const exprB = multiply(reference("z"), constant(2));
// refs: Set(['z'])

const combined = exprA.bind("x", exprB);
// After binding:
// - Remove 'x' from refs
// - Add all refs from exprB ('z')
// - Keep 'y'
// refs: Set(['y', 'z'])
```

## Constructor Implementation

### Basic Constructors

```typescript
export function constant(value: number): CalcExpression<never> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Constant value must be a finite number");
  }

  const node = new ConstantNode(value);
  return new CalcExpression(node, new Set());
}

export function reference<Name extends string>(
  name: Name,
): CalcExpression<Name> {
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("Reference name must be a non-empty string");
  }

  const node = new ReferenceNode(name);
  return new CalcExpression(node, new Set([name]));
}
```

### Operation Constructors

```typescript
export function add<A extends string, B extends string>(
  left: CalcExpression<A>,
  right: CalcExpression<B>,
): CalcExpression<A | B> {
  // Optionally apply simplification here
  const node = simplifyAdd(left.#node, right.#node);
  const refs = new Set([...left.#refs, ...right.#refs]);
  return new CalcExpression(node, refs) as CalcExpression<A | B>;
}

export function multiply<A extends string, B extends string>(
  left: CalcExpression<A>,
  right: CalcExpression<B>,
): CalcExpression<A | B> {
  const node = simplifyMultiply(left.#node, right.#node);
  const refs = new Set([...left.#refs, ...right.#refs]);
  return new CalcExpression(node, refs) as CalcExpression<A | B>;
}

// Similar for subtract, divide, power, sin, abs, sign
```

### Binary Operations (max, min)

```typescript
export function max<A extends string, B extends string>(
  left: CalcExpression<A>,
  right: CalcExpression<B>,
): CalcExpression<A | B> {
  const node = simplifyMax(left.#node, right.#node);
  const refs = new Set([...left.#refs, ...right.#refs]);
  return new CalcExpression(node, refs) as CalcExpression<A | B>;
}

export function min<A extends string, B extends string>(
  left: CalcExpression<A>,
  right: CalcExpression<B>,
): CalcExpression<A | B> {
  const node = simplifyMin(left.#node, right.#node);
  const refs = new Set([...left.#refs, ...right.#refs]);
  return new CalcExpression(node, refs) as CalcExpression<A | B>;
}
```

## Simplification Helpers

Each operation can have a corresponding simplification function:

```typescript
function simplifyAdd(left: CalcNode, right: CalcNode): CalcNode {
  // Constant folding
  if (left instanceof ConstantNode && right instanceof ConstantNode) {
    return new ConstantNode(left.value + right.value);
  }

  // Identity: x + 0 = x
  if (right instanceof ConstantNode && right.value === 0) {
    return left;
  }
  if (left instanceof ConstantNode && left.value === 0) {
    return right;
  }

  return new AddNode(left, right);
}

function simplifyMultiply(left: CalcNode, right: CalcNode): CalcNode {
  // Constant folding
  if (left instanceof ConstantNode && right instanceof ConstantNode) {
    return new ConstantNode(left.value * right.value);
  }

  // Zero: x * 0 = 0
  if (
    (left instanceof ConstantNode && left.value === 0) ||
    (right instanceof ConstantNode && right.value === 0)
  ) {
    return new ConstantNode(0);
  }

  // Identity: x * 1 = x
  if (right instanceof ConstantNode && right.value === 1) {
    return left;
  }
  if (left instanceof ConstantNode && left.value === 1) {
    return right;
  }

  return new MultiplyNode(left, right);
}

// Similar functions for other operations
```

## Test Strategy

### 1. Construction Tests

```typescript
describe("construction", () => {
  it("creates constants", () => {
    const expr = constant(42);
    // Verify it has no references (checking internal state)
  });

  it("creates references", () => {
    const expr = reference("x");
    // Verify it has one reference 'x'
  });

  it("merges references from operations", () => {
    const expr = add(reference("x"), reference("y"));
    // Verify it has both 'x' and 'y'
  });

  it("deduplicates references", () => {
    const x = reference("x");
    const expr = add(x, x);
    // Verify it only has 'x' once
  });

  it("creates pi constant", () => {
    const expr = constant(Math.PI);
    const result = expr.evaluate({});
    expect(result.type).toBe("number");
    if (result.type === "number") {
      expect(result.value).toBeCloseTo(Math.PI);
    }
  });
});
```

### 2. Simplification Tests

```typescript
describe("simplification", () => {
  it("folds constant addition", () => {
    const expr = add(constant(2), constant(3));
    const result = expr.evaluate({});
    expect(result.type).toBe("number");
    if (result.type === "number") {
      expect(result.value).toBe(5);
    }
  });

  it("simplifies nested constants", () => {
    const expr = add(
      multiply(constant(2), constant(3)),
      add(constant(4), constant(5)),
    );
    const result = expr.evaluate({});
    if (result.type === "number") {
      expect(result.value).toBe(15); // (2*3) + (4+5) = 6 + 9 = 15
    }
  });

  it("produces simplified CSS output", () => {
    const expr = add(multiply(constant(2), constant(3)), reference("x"));
    const result = expr.evaluate({ x: reference("x") });
    const css = result.css;

    // Should simplify 2*3 to 6
    expect(css.expression).toContain("6");
    expect(css.expression).not.toContain("2 *");
  });
});
```

### 3. Evaluation Tests

```typescript
describe("evaluation", () => {
  it("evaluates constants to numbers", () => {
    const expr = constant(42);
    const result = expr.evaluate({});

    expect(result.type).toBe("number");
    if (result.type === "number") {
      expect(result.value).toBe(42);
    }
  });

  it("evaluates with all bindings constant", () => {
    const expr = add(reference("x"), constant(5));
    const result = expr.evaluate({ x: constant(10) });

    expect(result.type).toBe("number");
    if (result.type === "number") {
      expect(result.value).toBe(15);
    }
  });

  it("returns expression for non-constant bindings", () => {
    const expr = add(reference("x"), constant(5));
    const result = expr.evaluate({ x: reference("runtime") });

    expect(result.type).toBe("expression");
  });

  it("evaluates complex expressions", () => {
    // f(x, y) = (x^2 + y^2)^0.5
    const expr = power(
      add(
        power(reference("x"), constant(2)),
        power(reference("y"), constant(2)),
      ),
      constant(0.5),
    );
    const result = expr.evaluate({
      x: constant(3),
      y: constant(4),
    });

    expect(result.type).toBe("number");
    if (result.type === "number") {
      expect(result.value).toBeCloseTo(5);
    }
  });

  it("both result types have css property", () => {
    const expr = add(reference("x"), constant(5));

    const numResult = expr.evaluate({ x: constant(10) });
    expect(numResult).toHaveProperty("css");
    expect(numResult.css).toHaveProperty("expression");
    expect(numResult.css).toHaveProperty("declarations");

    const exprResult = expr.evaluate({ x: reference("runtime") });
    expect(exprResult).toHaveProperty("css");
    expect(exprResult.css).toHaveProperty("expression");
    expect(exprResult.css).toHaveProperty("declarations");
  });
});
```

### 4. Serialization Tests

```typescript
describe("serialization", () => {
  it("serializes constants", () => {
    const result = constant(42).evaluate({});
    const css = result.css;

    expect(css.expression).toBe("42");
    expect(css.declarations).toEqual({});
  });

  it("serializes pi constant", () => {
    const result = constant(Math.PI).evaluate({});
    const css = result.css;

    expect(css.expression).toBe("pi");
  });

  it("formats numbers without trailing zeros", () => {
    const result1 = constant(1.5).evaluate({});
    expect(result1.css.expression).toBe("1.5");

    const result2 = constant(2.0).evaluate({});
    expect(result2.css.expression).toBe("2");
  });

  it("serializes references", () => {
    const expr = reference("x");
    const result = expr.evaluate({ x: reference("x") });
    const css = result.css;

    expect(css.expression).toBe("var(--x)");
  });

  it("serializes operations", () => {
    const expr = add(reference("x"), constant(5));
    const result = expr.evaluate({ x: reference("runtime") });
    const css = result.css;

    expect(css.expression).toBe("var(--runtime) + 5");
  });

  it("uses proper CSS function names", () => {
    const pow = power(reference("x"), constant(2)).evaluate({
      x: reference("x"),
    });
    expect(pow.css.expression).toBe("pow(var(--x), 2)");

    const sine = sin(reference("x")).evaluate({ x: reference("x") });
    expect(sine.css.expression).toBe("sin(var(--x))");
  });

  it("uses minimal parenthesization", () => {
    // Function arguments don't need extra parens
    const expr1 = sin(add(reference("x"), constant(1)));
    const result1 = expr1.evaluate({ x: reference("x") });
    expect(result1.css.expression).toBe("sin(var(--x) + 1)");

    // Multiplication operands need parens if they're add/subtract
    const expr2 = multiply(add(reference("a"), reference("b")), reference("c"));
    const result2 = expr2.evaluate({
      a: reference("a"),
      b: reference("b"),
      c: reference("c"),
    });
    expect(result2.css.expression).toBe("(var(--a) + var(--b)) * var(--c)");

    // But multiply doesn't need parens when used in add
    const expr3 = add(multiply(reference("a"), reference("b")), reference("c"));
    const result3 = expr3.evaluate({
      a: reference("a"),
      b: reference("b"),
      c: reference("c"),
    });
    expect(result3.css.expression).toBe("var(--a) * var(--b) + var(--c)");
  });
});
```

### 5. Binding Tests

```typescript
describe("binding", () => {
  it("removes bound reference from type", () => {
    const expr = add(reference("x"), reference("y"));
    const bound = expr.bind("x", constant(5));

    // Type check: bound should require only 'y'
    const result = bound.evaluate({ y: constant(10) });
    expect(result.type).toBe("number");
  });

  it("binds to constants", () => {
    const expr = multiply(constant(2), reference("x"));
    const bound = expr.bind("x", constant(3));

    const result = bound.evaluate({});
    if (result.type === "number") {
      expect(result.value).toBe(6);
    }
  });

  it("binds to other expressions", () => {
    const expr = add(reference("x"), constant(5));
    const yExpr = multiply(reference("y"), constant(2));
    const bound = expr.bind("x", yExpr);

    // Now requires 'y' instead of 'x'
    const result = bound.evaluate({ y: constant(3) });
    if (result.type === "number") {
      expect(result.value).toBe(11); // (y * 2) + 5 = (3 * 2) + 5 = 11
    }
  });

  it("can bind multiple references by chaining", () => {
    const expr = add(reference("x"), reference("y"));
    const bound = expr.bind("x", constant(10)).bind("y", constant(20));

    const result = bound.evaluate({});
    if (result.type === "number") {
      expect(result.value).toBe(30);
    }
  });

  it("merges references when binding to expressions", () => {
    const expr = add(reference("a"), reference("b"));
    const withE = expr.bind("a", reference("e"));

    // Now requires: b, e (a removed, e added)
    const result = withE.evaluate({ b: constant(5), e: constant(10) });
    if (result.type === "number") {
      expect(result.value).toBe(15);
    }
  });
});
```

### 6. Property Wrapping Tests

```typescript
describe("property wrapping", () => {
  it("wraps expression as property", () => {
    const expr = multiply(reference("x"), constant(2));
    const wrapped = expr.asProperty("--doubled");

    // Can still evaluate normally
    const result = wrapped.evaluate({ x: constant(5) });
    if (result.type === "number") {
      expect(result.value).toBe(10);
    }
  });

  it("includes property declaration in CSS output", () => {
    const expr = multiply(reference("x"), constant(2)).asProperty("--doubled");

    const result = expr.evaluate({ x: reference("runtime") });
    const css = result.css;

    expect(css.expression).toBe("var(--doubled)");
    expect(css.declarations).toHaveProperty("--doubled");
    expect(css.declarations["--doubled"]).toBe("var(--runtime) * 2");
  });

  it("handles nested properties", () => {
    const inner = multiply(reference("x"), constant(2)).asProperty("--doubled");

    const outer = add(inner, constant(5)).asProperty("--result");

    const result = outer.evaluate({ x: reference("runtime") });
    const css = result.css;

    expect(css.expression).toBe("var(--result)");
    expect(css.declarations).toHaveProperty("--doubled");
    expect(css.declarations).toHaveProperty("--result");
    expect(css.declarations["--doubled"]).toBe("var(--runtime) * 2");
    expect(css.declarations["--result"]).toBe("var(--doubled) + 5");
  });

  it("throws on property name conflicts", () => {
    const prop1 = reference("x").asProperty("--value");
    const prop2 = reference("y").asProperty("--value");
    const expr = add(prop1, prop2);

    expect(() => {
      expr.evaluate({ x: reference("a"), y: reference("b") });
    }).toThrow(/property.*--value.*multiple times/i);
  });

  it("allows same property with same value", () => {
    const shared = reference("x").asProperty("--shared");
    const expr = add(shared, shared);

    const result = expr.evaluate({ x: reference("runtime") });
    const css = result.css;

    expect(css.expression).toBe("var(--shared) + var(--shared)");
    expect(css.declarations["--shared"]).toBe("var(--runtime)");
  });
});
```

### 7. Integration Tests

```typescript
describe("integration", () => {
  it("builds and evaluates a quadratic formula", () => {
    // f(x) = ax^2 + bx + c
    const quadratic = (a: number, b: number, c: number) =>
      add(
        add(
          multiply(constant(a), power(reference("x"), constant(2))),
          multiply(constant(b), reference("x")),
        ),
        constant(c),
      );

    const f = quadratic(1, -3, 2);

    const r0 = f.evaluate({ x: constant(0) });
    if (r0.type === "number") expect(r0.value).toBe(2);

    const r1 = f.evaluate({ x: constant(1) });
    if (r1.type === "number") expect(r1.value).toBe(0);

    const r2 = f.evaluate({ x: constant(2) });
    if (r2.type === "number") expect(r2.value).toBe(0);
  });

  it("generates CSS with complex nested properties", () => {
    const xSquared = power(reference("x"), constant(2)).asProperty(
      "--x-squared",
    );

    const ySquared = power(reference("y"), constant(2)).asProperty(
      "--y-squared",
    );

    const distance = power(add(xSquared, ySquared), constant(0.5)).asProperty(
      "--distance",
    );

    const result = distance.evaluate({
      x: reference("x"),
      y: reference("y"),
    });

    const css = result.css;
    expect(css.expression).toBe("var(--distance)");
    expect(Object.keys(css.declarations)).toHaveLength(3);
    expect(css.declarations).toHaveProperty("--x-squared");
    expect(css.declarations).toHaveProperty("--y-squared");
    expect(css.declarations).toHaveProperty("--distance");
  });
});
```

## Error Handling

### Type-Level Errors

Most errors are caught at compile time through TypeScript:

```typescript
const expr = add(reference("x"), reference("y"));

// ✗ Compile error: missing 'y'
expr.evaluate({ x: constant(5) });

// ✗ Compile error: wrong reference name
expr.evaluate({ x: constant(5), z: constant(10) });
```

### Runtime Validation

Minimal runtime checks for invalid inputs:

```typescript
function constant(value: number): CalcExpression<never> {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    throw new TypeError("Constant value must be a finite number");
  }
  // ...
}

function reference(name: string): CalcExpression<any> {
  if (typeof name !== "string" || name.length === 0) {
    throw new TypeError("Reference name must be a non-empty string");
  }
  // ...
}
```

### Property Conflicts

Check during serialization when adding to declarations record:

```typescript
class PropertyNode implements CalcNode {
  serialize(declarations: Record<string, string>): string {
    const value = this.expr.serialize(declarations);

    if (this.name in declarations && declarations[this.name] !== value) {
      throw new Error(
        `Property '${this.name}' defined multiple times with different values`,
      );
    }

    declarations[this.name] = value;
    return `var(${this.name})`;
  }
}
```

## Implementation Notes

### Non-Critical Performance Context

This code runs in controlled, non-performance-critical contexts (build time, configuration). Focus on clarity and correctness over micro-optimizations.

### Private Fields

Use native JavaScript `#field` syntax for private state, except for `private constructor`.

### Simplification and CSS Quality

Simplification must happen to ensure optimal CSS output. The timing (eager vs lazy) is flexible, but the result must be optimized CSS. Apply simplification rules:

- During construction/binding (eager), OR
- During evaluation/serialization traversal (lazy)

Both can produce optimal CSS - choose based on code clarity.

### Class-Based Node Implementation

All nodes are implemented as classes that implement the `CalcNode` interface:

- Operation logic is colocated with the data it operates on
- Each node class handles its own behavior
- Adding new operations is self-contained - just create a new class
- More maintainable as operations grow
- Type safety with `instanceof` checks
- Clear ownership of behavior through encapsulation
