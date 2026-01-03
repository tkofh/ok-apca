import type { CalcNode } from './types.ts'

function formatNumber(n: number): string {
	if (Math.abs(n - Math.PI) < 1e-10) {
		return 'pi'
	}
	const formatted = n.toFixed(5)
	return formatted.replace(/\.?0+$/, '') || '0'
}

export class ConstantNode implements CalcNode {
	readonly kind = 'constant'
	readonly value: number

	static is(node: CalcNode): node is ConstantNode {
		return node instanceof ConstantNode
	}

	constructor(value: number) {
		this.value = value
	}

	substitute(_bindings: Record<string, CalcNode>): CalcNode {
		return this
	}

	isConstant(): boolean {
		return true
	}

	evaluateConstant(): number {
		return this.value
	}

	serialize(_declarations: Record<string, string>): string {
		return formatNumber(this.value)
	}

	needsCalcWrap(): boolean {
		return false
	}
}

export class ReferenceNode implements CalcNode {
	readonly kind = 'reference'
	readonly name: string

	constructor(name: string) {
		this.name = name
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		return bindings[this.name] ?? this
	}

	isConstant(): boolean {
		return false
	}

	evaluateConstant(): number {
		throw new Error(`Cannot evaluate non-constant reference: ${this.name}`)
	}

	serialize(_declarations: Record<string, string>): string {
		return `var(--${this.name})`
	}

	needsCalcWrap(): boolean {
		return false
	}
}

abstract class UnaryNode implements CalcNode {
	abstract readonly kind: string
	readonly arg: CalcNode

	constructor(arg: CalcNode) {
		this.arg = arg
	}

	protected abstract compute(x: number): number
	protected abstract format(arg: string): string
	protected abstract create(arg: CalcNode): CalcNode

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const arg = this.arg.substitute(bindings)
		if (ConstantNode.is(arg)) {
			return new ConstantNode(this.compute(arg.value))
		}
		return this.create(arg)
	}

	isConstant(): boolean {
		return this.arg.isConstant()
	}

	evaluateConstant(): number {
		return this.compute(this.arg.evaluateConstant())
	}

	serialize(declarations: Record<string, string>): string {
		return this.format(this.arg.serialize(declarations))
	}

	needsCalcWrap(): boolean {
		return false
	}
}

export class SinNode extends UnaryNode {
	readonly kind = 'sin'
	protected compute = Math.sin
	protected format = (arg: string) => `sin(${arg})`
	protected create = (arg: CalcNode) => new SinNode(arg)
}

export class AbsNode extends UnaryNode {
	readonly kind = 'abs'
	protected compute = Math.abs
	protected format = (arg: string) => `abs(${arg})`
	protected create = (arg: CalcNode) => new AbsNode(arg)
}

export class SignNode extends UnaryNode {
	readonly kind = 'sign'
	protected compute = Math.sign
	protected format = (arg: string) => `sign(${arg})`
	protected create = (arg: CalcNode) => new SignNode(arg)
}

abstract class BinaryNode implements CalcNode {
	abstract readonly kind: string
	readonly left: CalcNode
	readonly right: CalcNode

	constructor(left: CalcNode, right: CalcNode) {
		this.left = left
		this.right = right
	}

	protected abstract compute(a: number, b: number): number
	protected abstract format(left: string, right: string): string
	protected abstract create(left: CalcNode, right: CalcNode): CalcNode

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const left = this.left.substitute(bindings)
		const right = this.right.substitute(bindings)
		if (ConstantNode.is(left) && ConstantNode.is(right)) {
			return new ConstantNode(this.compute(left.value, right.value))
		}
		return this.create(left, right)
	}

	isConstant(): boolean {
		return this.left.isConstant() && this.right.isConstant()
	}

	evaluateConstant(): number {
		return this.compute(this.left.evaluateConstant(), this.right.evaluateConstant())
	}

	serialize(declarations: Record<string, string>): string {
		return this.format(this.left.serialize(declarations), this.right.serialize(declarations))
	}

	// Default: binary operations that are function calls (pow, max, min) don't need calc wrap
	needsCalcWrap(): boolean {
		return false
	}
}

abstract class ArithmeticNode extends BinaryNode {
	override needsCalcWrap(): boolean {
		return true
	}
}

export class AddNode extends ArithmeticNode {
	readonly kind = 'add'
	protected compute = (a: number, b: number) => a + b
	protected format = (left: string, right: string) => `${left} + ${right}`
	protected create = (left: CalcNode, right: CalcNode) => new AddNode(left, right)
}

export class SubtractNode extends ArithmeticNode {
	readonly kind = 'subtract'
	protected compute = (a: number, b: number) => a - b
	protected format = (left: string, right: string) => `${left} - ${right}`
	protected create = (left: CalcNode, right: CalcNode) => new SubtractNode(left, right)
}

function wrapIfNeeded(node: CalcNode, serialized: string): string {
	return node.kind === 'add' || node.kind === 'subtract' ? `(${serialized})` : serialized
}

export class MultiplyNode extends ArithmeticNode {
	readonly kind = 'multiply'
	protected compute = (a: number, b: number) => a * b
	protected create = (left: CalcNode, right: CalcNode) => new MultiplyNode(left, right)

	protected format = (left: string, right: string) => `${left} * ${right}`

	override serialize(declarations: Record<string, string>): string {
		const left = wrapIfNeeded(this.left, this.left.serialize(declarations))
		const right = wrapIfNeeded(this.right, this.right.serialize(declarations))
		return `${left} * ${right}`
	}
}

export class DivideNode extends ArithmeticNode {
	readonly kind = 'divide'
	protected compute = (a: number, b: number) => a / b
	protected create = (left: CalcNode, right: CalcNode) => new DivideNode(left, right)

	protected format = (left: string, right: string) => `${left} / ${right}`

	override serialize(declarations: Record<string, string>): string {
		const left = wrapIfNeeded(this.left, this.left.serialize(declarations))
		const right = wrapIfNeeded(this.right, this.right.serialize(declarations))
		return `${left} / ${right}`
	}
}

export class PowerNode extends BinaryNode {
	readonly kind = 'power'
	protected compute = (a: number, b: number) => a ** b
	protected format = (base: string, exp: string) => `pow(${base}, ${exp})`
	protected create = (left: CalcNode, right: CalcNode) => new PowerNode(left, right)
}

export class MaxNode extends BinaryNode {
	readonly kind = 'max'
	protected compute = Math.max
	protected format = (left: string, right: string) => `max(${left}, ${right})`
	protected create = (left: CalcNode, right: CalcNode) => new MaxNode(left, right)
}

export class MinNode extends BinaryNode {
	readonly kind = 'min'
	protected compute = Math.min
	protected format = (left: string, right: string) => `min(${left}, ${right})`
	protected create = (left: CalcNode, right: CalcNode) => new MinNode(left, right)
}

export class ClampNode implements CalcNode {
	readonly kind = 'clamp'
	readonly minimum: CalcNode
	readonly value: CalcNode
	readonly maximum: CalcNode

	constructor(minimum: CalcNode, value: CalcNode, maximum: CalcNode) {
		this.minimum = minimum
		this.value = value
		this.maximum = maximum
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const minimum = this.minimum.substitute(bindings)
		const value = this.value.substitute(bindings)
		const maximum = this.maximum.substitute(bindings)
		if (ConstantNode.is(minimum) && ConstantNode.is(value) && ConstantNode.is(maximum)) {
			return new ConstantNode(Math.max(minimum.value, Math.min(value.value, maximum.value)))
		}
		return new ClampNode(minimum, value, maximum)
	}

	isConstant(): boolean {
		return this.minimum.isConstant() && this.value.isConstant() && this.maximum.isConstant()
	}

	evaluateConstant(): number {
		const min = this.minimum.evaluateConstant()
		const val = this.value.evaluateConstant()
		const max = this.maximum.evaluateConstant()
		return Math.max(min, Math.min(val, max))
	}

	serialize(declarations: Record<string, string>): string {
		const min = this.minimum.serialize(declarations)
		const val = this.value.serialize(declarations)
		const max = this.maximum.serialize(declarations)
		return `clamp(${min}, ${val}, ${max})`
	}

	needsCalcWrap(): boolean {
		return false
	}
}

export class PropertyNode implements CalcNode {
	readonly kind = 'property'
	readonly name: string
	readonly expr: CalcNode

	constructor(name: string, expr: CalcNode) {
		this.name = name
		this.expr = expr
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		return new PropertyNode(this.name, this.expr.substitute(bindings))
	}

	isConstant(): boolean {
		return this.expr.isConstant()
	}

	evaluateConstant(): number {
		return this.expr.evaluateConstant()
	}

	serialize(declarations: Record<string, string>): string {
		const innerDeclarations: Record<string, string> = {}
		const value = this.expr.serialize(innerDeclarations)

		// Wrap in calc() if the inner expression needs it
		const wrappedValue = this.expr.needsCalcWrap() ? `calc(${value})` : value

		// Merge inner declarations into outer declarations
		for (const [key, val] of Object.entries(innerDeclarations)) {
			const existing = declarations[key]
			if (existing !== undefined && existing !== val) {
				throw new Error(`Property '${key}' defined multiple times with different values`)
			}
			declarations[key] = val
		}

		const existing = declarations[this.name]
		if (existing !== undefined && existing !== wrappedValue) {
			throw new Error(`Property '${this.name}' defined multiple times with different values`)
		}

		declarations[this.name] = wrappedValue
		return `var(${this.name})`
	}

	needsCalcWrap(): boolean {
		return false
	}
}
