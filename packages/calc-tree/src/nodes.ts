import type { CalcNode } from './types.ts'

/**
 * Format a number for CSS output
 */
function formatNumber(n: number): string {
	// Check if this is pi
	if (Math.abs(n - Math.PI) < 1e-10) {
		return 'pi'
	}

	// Format with precision of 5
	const formatted = n.toPrecision(5)

	// Remove trailing zeros and unnecessary decimal point
	return formatted.replace(/\.?0+$/, '') || '0'
}

/**
 * Constant numeric value node
 */
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
}

/**
 * Reference to a variable node
 */
export class ReferenceNode implements CalcNode {
	readonly kind = 'reference'
	readonly name: string

	static is(node: CalcNode): node is ReferenceNode {
		return node instanceof ReferenceNode
	}

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
}

/**
 * Addition node
 */
export class AddNode implements CalcNode {
	readonly kind = 'add'
	readonly left: CalcNode
	readonly right: CalcNode

	static is(node: CalcNode): node is AddNode {
		return node instanceof AddNode
	}

	constructor(left: CalcNode, right: CalcNode) {
		this.left = left
		this.right = right
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const left = this.left.substitute(bindings)
		const right = this.right.substitute(bindings)
		if (ConstantNode.is(left) && ConstantNode.is(right)) {
			return new ConstantNode(left.value + right.value)
		}
		return new AddNode(left, right)
	}

	isConstant(): boolean {
		return this.left.isConstant() && this.right.isConstant()
	}

	evaluateConstant(): number {
		return this.left.evaluateConstant() + this.right.evaluateConstant()
	}

	serialize(declarations: Record<string, string>): string {
		const left = this.left.serialize(declarations)
		const right = this.right.serialize(declarations)
		return `${left} + ${right}`
	}
}

/**
 * Subtraction node
 */
export class SubtractNode implements CalcNode {
	readonly kind = 'subtract'
	readonly left: CalcNode
	readonly right: CalcNode

	static is(node: CalcNode): node is SubtractNode {
		return node instanceof SubtractNode
	}

	constructor(left: CalcNode, right: CalcNode) {
		this.left = left
		this.right = right
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const left = this.left.substitute(bindings)
		const right = this.right.substitute(bindings)
		if (ConstantNode.is(left) && ConstantNode.is(right)) {
			return new ConstantNode(left.value - right.value)
		}
		return new SubtractNode(left, right)
	}

	isConstant(): boolean {
		return this.left.isConstant() && this.right.isConstant()
	}

	evaluateConstant(): number {
		return this.left.evaluateConstant() - this.right.evaluateConstant()
	}

	serialize(declarations: Record<string, string>): string {
		const left = this.left.serialize(declarations)
		const right = this.right.serialize(declarations)
		return `${left} - ${right}`
	}
}

/**
 * Check if a node needs parentheses when used as operand to multiply/divide
 */
function needsParensForMultiply(node: CalcNode): boolean {
	return node.kind === 'add' || node.kind === 'subtract'
}

/**
 * Multiplication node
 */
export class MultiplyNode implements CalcNode {
	readonly kind = 'multiply'
	readonly left: CalcNode
	readonly right: CalcNode

	static is(node: CalcNode): node is MultiplyNode {
		return node instanceof MultiplyNode
	}

	constructor(left: CalcNode, right: CalcNode) {
		this.left = left
		this.right = right
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const left = this.left.substitute(bindings)
		const right = this.right.substitute(bindings)
		if (ConstantNode.is(left) && ConstantNode.is(right)) {
			return new ConstantNode(left.value * right.value)
		}
		return new MultiplyNode(left, right)
	}

	isConstant(): boolean {
		return this.left.isConstant() && this.right.isConstant()
	}

	evaluateConstant(): number {
		return this.left.evaluateConstant() * this.right.evaluateConstant()
	}

	serialize(declarations: Record<string, string>): string {
		const leftStr = this.left.serialize(declarations)
		const rightStr = this.right.serialize(declarations)
		const left = needsParensForMultiply(this.left) ? `(${leftStr})` : leftStr
		const right = needsParensForMultiply(this.right) ? `(${rightStr})` : rightStr
		return `${left} * ${right}`
	}
}

/**
 * Division node
 */
export class DivideNode implements CalcNode {
	readonly kind = 'divide'
	readonly left: CalcNode
	readonly right: CalcNode

	static is(node: CalcNode): node is DivideNode {
		return node instanceof DivideNode
	}

	constructor(left: CalcNode, right: CalcNode) {
		this.left = left
		this.right = right
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const left = this.left.substitute(bindings)
		const right = this.right.substitute(bindings)
		if (ConstantNode.is(left) && ConstantNode.is(right)) {
			return new ConstantNode(left.value / right.value)
		}
		return new DivideNode(left, right)
	}

	isConstant(): boolean {
		return this.left.isConstant() && this.right.isConstant()
	}

	evaluateConstant(): number {
		return this.left.evaluateConstant() / this.right.evaluateConstant()
	}

	serialize(declarations: Record<string, string>): string {
		const leftStr = this.left.serialize(declarations)
		const rightStr = this.right.serialize(declarations)
		const left = needsParensForMultiply(this.left) ? `(${leftStr})` : leftStr
		const right = needsParensForMultiply(this.right) ? `(${rightStr})` : rightStr
		return `${left} / ${right}`
	}
}

/**
 * Power node
 */
export class PowerNode implements CalcNode {
	readonly kind = 'power'
	readonly base: CalcNode
	readonly exponent: CalcNode

	static is(node: CalcNode): node is PowerNode {
		return node instanceof PowerNode
	}

	constructor(base: CalcNode, exponent: CalcNode) {
		this.base = base
		this.exponent = exponent
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const base = this.base.substitute(bindings)
		const exponent = this.exponent.substitute(bindings)
		if (ConstantNode.is(base) && ConstantNode.is(exponent)) {
			return new ConstantNode(base.value ** exponent.value)
		}
		return new PowerNode(base, exponent)
	}

	isConstant(): boolean {
		return this.base.isConstant() && this.exponent.isConstant()
	}

	evaluateConstant(): number {
		return this.base.evaluateConstant() ** this.exponent.evaluateConstant()
	}

	serialize(declarations: Record<string, string>): string {
		const base = this.base.serialize(declarations)
		const exp = this.exponent.serialize(declarations)
		return `pow(${base}, ${exp})`
	}
}

/**
 * Sine node
 */
export class SinNode implements CalcNode {
	readonly kind = 'sin'
	readonly arg: CalcNode

	static is(node: CalcNode): node is SinNode {
		return node instanceof SinNode
	}

	constructor(arg: CalcNode) {
		this.arg = arg
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const arg = this.arg.substitute(bindings)
		if (ConstantNode.is(arg)) {
			return new ConstantNode(Math.sin(arg.value))
		}
		return new SinNode(arg)
	}

	isConstant(): boolean {
		return this.arg.isConstant()
	}

	evaluateConstant(): number {
		return Math.sin(this.arg.evaluateConstant())
	}

	serialize(declarations: Record<string, string>): string {
		const arg = this.arg.serialize(declarations)
		return `sin(${arg})`
	}
}

/**
 * Absolute value node
 */
export class AbsNode implements CalcNode {
	readonly kind = 'abs'
	readonly arg: CalcNode

	static is(node: CalcNode): node is AbsNode {
		return node instanceof AbsNode
	}

	constructor(arg: CalcNode) {
		this.arg = arg
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const arg = this.arg.substitute(bindings)
		if (ConstantNode.is(arg)) {
			return new ConstantNode(Math.abs(arg.value))
		}
		return new AbsNode(arg)
	}

	isConstant(): boolean {
		return this.arg.isConstant()
	}

	evaluateConstant(): number {
		return Math.abs(this.arg.evaluateConstant())
	}

	serialize(declarations: Record<string, string>): string {
		const arg = this.arg.serialize(declarations)
		return `abs(${arg})`
	}
}

/**
 * Sign node
 */
export class SignNode implements CalcNode {
	readonly kind = 'sign'
	readonly arg: CalcNode

	static is(node: CalcNode): node is SignNode {
		return node instanceof SignNode
	}

	constructor(arg: CalcNode) {
		this.arg = arg
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const arg = this.arg.substitute(bindings)
		if (ConstantNode.is(arg)) {
			return new ConstantNode(Math.sign(arg.value))
		}
		return new SignNode(arg)
	}

	isConstant(): boolean {
		return this.arg.isConstant()
	}

	evaluateConstant(): number {
		return Math.sign(this.arg.evaluateConstant())
	}

	serialize(declarations: Record<string, string>): string {
		const arg = this.arg.serialize(declarations)
		return `sign(${arg})`
	}
}

/**
 * Maximum node
 */
export class MaxNode implements CalcNode {
	readonly kind = 'max'
	readonly left: CalcNode
	readonly right: CalcNode

	static is(node: CalcNode): node is MaxNode {
		return node instanceof MaxNode
	}

	constructor(left: CalcNode, right: CalcNode) {
		this.left = left
		this.right = right
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const left = this.left.substitute(bindings)
		const right = this.right.substitute(bindings)
		if (ConstantNode.is(left) && ConstantNode.is(right)) {
			return new ConstantNode(Math.max(left.value, right.value))
		}
		return new MaxNode(left, right)
	}

	isConstant(): boolean {
		return this.left.isConstant() && this.right.isConstant()
	}

	evaluateConstant(): number {
		return Math.max(this.left.evaluateConstant(), this.right.evaluateConstant())
	}

	serialize(declarations: Record<string, string>): string {
		const left = this.left.serialize(declarations)
		const right = this.right.serialize(declarations)
		return `max(${left}, ${right})`
	}
}

/**
 * Minimum node
 */
export class MinNode implements CalcNode {
	readonly kind = 'min'
	readonly left: CalcNode
	readonly right: CalcNode

	static is(node: CalcNode): node is MinNode {
		return node instanceof MinNode
	}

	constructor(left: CalcNode, right: CalcNode) {
		this.left = left
		this.right = right
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const left = this.left.substitute(bindings)
		const right = this.right.substitute(bindings)
		if (ConstantNode.is(left) && ConstantNode.is(right)) {
			return new ConstantNode(Math.min(left.value, right.value))
		}
		return new MinNode(left, right)
	}

	isConstant(): boolean {
		return this.left.isConstant() && this.right.isConstant()
	}

	evaluateConstant(): number {
		return Math.min(this.left.evaluateConstant(), this.right.evaluateConstant())
	}

	serialize(declarations: Record<string, string>): string {
		const left = this.left.serialize(declarations)
		const right = this.right.serialize(declarations)
		return `min(${left}, ${right})`
	}
}

/**
 * Clamp node
 */
export class ClampNode implements CalcNode {
	readonly kind = 'clamp'
	readonly minimum: CalcNode
	readonly value: CalcNode
	readonly maximum: CalcNode

	static is(node: CalcNode): node is ClampNode {
		return node instanceof ClampNode
	}

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
}

/**
 * CSS custom property wrapper node
 */
export class PropertyNode implements CalcNode {
	readonly kind = 'property'
	readonly name: string
	readonly expr: CalcNode

	static is(node: CalcNode): node is PropertyNode {
		return node instanceof PropertyNode
	}

	constructor(name: string, expr: CalcNode) {
		this.name = name
		this.expr = expr
	}

	substitute(bindings: Record<string, CalcNode>): CalcNode {
		const expr = this.expr.substitute(bindings)
		return new PropertyNode(this.name, expr)
	}

	isConstant(): boolean {
		return this.expr.isConstant()
	}

	evaluateConstant(): number {
		return this.expr.evaluateConstant()
	}

	serialize(declarations: Record<string, string>): string {
		const value = this.expr.serialize(declarations)

		// Check for conflicts
		const existing = declarations[this.name]
		if (existing !== undefined && existing !== value) {
			throw new Error(`Property '${this.name}' defined multiple times with different values`)
		}

		// Add to declarations
		declarations[this.name] = value

		// Return reference to the property
		return `var(${this.name})`
	}
}
