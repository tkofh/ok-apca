import type { ExpressionNode, PropertyRule } from './types.ts'

export function formatNumber(n: number): string {
	if (Math.abs(n - Math.PI) < 1e-10) {
		return 'pi'
	}
	const formatted = n.toFixed(5)
	return formatted.replace(/\.?0+$/, '') || '0'
}

export class ConstantNode implements ExpressionNode {
	readonly kind = 'constant'
	readonly value: number

	static is(node: ExpressionNode): node is ConstantNode {
		return node instanceof ConstantNode
	}

	constructor(value: number) {
		this.value = value
	}

	substitute(_bindings: Record<string, ExpressionNode>): ExpressionNode {
		return this
	}

	isConstant(): boolean {
		return true
	}

	evaluateConstant(): number {
		return this.value
	}

	serialize(
		_declarations: Record<string, string>,
		_properties?: Record<string, PropertyRule>,
	): string {
		return formatNumber(this.value)
	}

	needsCalcWrap(): boolean {
		return false
	}
}

export class ReferenceNode implements ExpressionNode {
	readonly kind = 'reference'
	readonly name: string

	constructor(name: string) {
		this.name = name
	}

	substitute(bindings: Record<string, ExpressionNode>): ExpressionNode {
		return bindings[this.name] ?? this
	}

	isConstant(): boolean {
		return false
	}

	evaluateConstant(): number {
		throw new Error(`Cannot evaluate non-constant reference: ${this.name}`)
	}

	serialize(
		_declarations: Record<string, string>,
		_properties?: Record<string, PropertyRule>,
	): string {
		return `var(--${this.name})`
	}

	needsCalcWrap(): boolean {
		return false
	}
}

abstract class UnaryNode implements ExpressionNode {
	abstract readonly kind: string
	readonly arg: ExpressionNode

	constructor(arg: ExpressionNode) {
		this.arg = arg
	}

	protected abstract compute(x: number): number
	protected abstract format(arg: string): string
	protected abstract create(arg: ExpressionNode): ExpressionNode

	substitute(bindings: Record<string, ExpressionNode>): ExpressionNode {
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

	serialize(
		declarations: Record<string, string>,
		properties?: Record<string, PropertyRule>,
	): string {
		return this.format(this.arg.serialize(declarations, properties))
	}

	needsCalcWrap(): boolean {
		return false
	}
}

export class SinNode extends UnaryNode {
	readonly kind = 'sin'
	protected compute = Math.sin
	protected format = (arg: string) => `sin(${arg})`
	protected create = (arg: ExpressionNode) => new SinNode(arg)
}

export class AbsNode extends UnaryNode {
	readonly kind = 'abs'
	protected compute = Math.abs
	protected format = (arg: string) => `abs(${arg})`
	protected create = (arg: ExpressionNode) => new AbsNode(arg)
}

export class SignNode extends UnaryNode {
	readonly kind = 'sign'
	protected compute = Math.sign
	protected format = (arg: string) => `sign(${arg})`
	protected create = (arg: ExpressionNode) => new SignNode(arg)
}

abstract class NaryNode implements ExpressionNode {
	abstract readonly kind: string
	readonly children: ExpressionNode[]

	constructor(children: ExpressionNode[]) {
		this.children = children
	}

	protected abstract computeReduce(a: number, b: number): number
	protected abstract readonly identity: number
	protected abstract formatChildren(serialized: string[]): string
	protected abstract create(children: ExpressionNode[]): ExpressionNode

	substitute(bindings: Record<string, ExpressionNode>): ExpressionNode {
		const children = this.children.map((c) => c.substitute(bindings))
		if (children.every((c) => ConstantNode.is(c))) {
			return new ConstantNode(
				(children as ConstantNode[]).map((c) => c.value).reduce((a, b) => this.computeReduce(a, b)),
			)
		}
		return this.create(children)
	}

	isConstant(): boolean {
		return this.children.every((c) => c.isConstant())
	}

	evaluateConstant(): number {
		return this.children.map((c) => c.evaluateConstant()).reduce((a, b) => this.computeReduce(a, b))
	}

	serialize(
		declarations: Record<string, string>,
		properties?: Record<string, PropertyRule>,
	): string {
		return this.formatChildren(this.children.map((c) => c.serialize(declarations, properties)))
	}

	needsCalcWrap(): boolean {
		return false
	}
}

abstract class BinaryNode implements ExpressionNode {
	abstract readonly kind: string
	readonly left: ExpressionNode
	readonly right: ExpressionNode

	constructor(left: ExpressionNode, right: ExpressionNode) {
		this.left = left
		this.right = right
	}

	protected abstract compute(a: number, b: number): number
	protected abstract format(left: string, right: string): string
	protected abstract create(left: ExpressionNode, right: ExpressionNode): ExpressionNode

	substitute(bindings: Record<string, ExpressionNode>): ExpressionNode {
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

	serialize(
		declarations: Record<string, string>,
		properties?: Record<string, PropertyRule>,
	): string {
		return this.format(
			this.left.serialize(declarations, properties),
			this.right.serialize(declarations, properties),
		)
	}

	needsCalcWrap(): boolean {
		return false
	}
}

abstract class ArithmeticNode extends BinaryNode {
	override needsCalcWrap(): boolean {
		return true
	}
}

function hasNegativeCoefficient(node: ExpressionNode): boolean {
	if (ConstantNode.is(node) && node.value < 0) {
		return true
	}
	if (node.kind === 'multiply' || node.kind === 'divide') {
		const left = (node as MultiplyNode | DivideNode).left
		return ConstantNode.is(left) && left.value < 0
	}
	return false
}

function serializeNegated(
	node: ExpressionNode,
	declarations: Record<string, string>,
	properties?: Record<string, PropertyRule>,
): string {
	if (ConstantNode.is(node)) {
		return formatNumber(-node.value)
	}
	const binary = node as MultiplyNode | DivideNode
	const negatedLeft = new ConstantNode(-(binary.left as ConstantNode).value)
	const negated =
		binary.kind === 'multiply'
			? new MultiplyNode(negatedLeft, binary.right)
			: new DivideNode(negatedLeft, binary.right)
	return negated.serialize(declarations, properties)
}

export class AddNode extends NaryNode {
	readonly kind = 'add'
	protected computeReduce = (a: number, b: number) => a + b
	protected readonly identity = 0
	protected formatChildren = (serialized: string[]) => serialized.join(' + ')
	protected create = (children: ExpressionNode[]) => new AddNode(children)

	override serialize(
		declarations: Record<string, string>,
		properties?: Record<string, PropertyRule>,
	): string {
		const parts: string[] = []
		for (const [index, child] of this.children.entries()) {
			if (index === 0) {
				parts.push(child.serialize(declarations, properties))
			} else if (hasNegativeCoefficient(child)) {
				parts.push(` - ${serializeNegated(child, declarations, properties)}`)
			} else {
				parts.push(` + ${child.serialize(declarations, properties)}`)
			}
		}
		return parts.join('')
	}

	override needsCalcWrap(): boolean {
		return true
	}
}

export class SubtractNode extends ArithmeticNode {
	readonly kind = 'subtract'
	protected compute = (a: number, b: number) => a - b
	protected format = (left: string, right: string) => `${left} - ${right}`
	protected create = (left: ExpressionNode, right: ExpressionNode) => new SubtractNode(left, right)

	override serialize(
		declarations: Record<string, string>,
		properties?: Record<string, PropertyRule>,
	): string {
		const left = this.left.serialize(declarations, properties)
		if (hasNegativeCoefficient(this.right)) {
			return `${left} + ${serializeNegated(this.right, declarations, properties)}`
		}
		return `${left} - ${this.right.serialize(declarations, properties)}`
	}
}

function wrapIfNeeded(node: ExpressionNode, serialized: string): string {
	return node.kind === 'add' || node.kind === 'subtract' ? `(${serialized})` : serialized
}

export class MultiplyNode extends ArithmeticNode {
	readonly kind = 'multiply'
	protected compute = (a: number, b: number) => a * b
	protected create = (left: ExpressionNode, right: ExpressionNode) => new MultiplyNode(left, right)

	protected format = (left: string, right: string) => `${left} * ${right}`

	override serialize(
		declarations: Record<string, string>,
		properties?: Record<string, PropertyRule>,
	): string {
		const left = wrapIfNeeded(this.left, this.left.serialize(declarations, properties))
		const right = wrapIfNeeded(this.right, this.right.serialize(declarations, properties))
		return `${left} * ${right}`
	}
}

export class DivideNode extends ArithmeticNode {
	readonly kind = 'divide'
	protected compute = (a: number, b: number) => a / b
	protected create = (left: ExpressionNode, right: ExpressionNode) => new DivideNode(left, right)

	protected format = (left: string, right: string) => `${left} / ${right}`

	override serialize(
		declarations: Record<string, string>,
		properties?: Record<string, PropertyRule>,
	): string {
		const left = wrapIfNeeded(this.left, this.left.serialize(declarations, properties))
		const right = wrapIfNeeded(this.right, this.right.serialize(declarations, properties))
		return `${left} / ${right}`
	}
}

export class PowNode extends BinaryNode {
	readonly kind = 'pow'
	protected compute = (a: number, b: number) => a ** b
	protected format = (base: string, exp: string) => `pow(${base}, ${exp})`
	protected create = (left: ExpressionNode, right: ExpressionNode) => new PowNode(left, right)
}

export class SignedPowNode extends BinaryNode {
	readonly kind = 'signedPow'
	protected compute = (a: number, b: number) => Math.abs(a) ** b * Math.sign(a)
	protected format = (base: string, exp: string) => `pow(abs(${base}), ${exp}) * sign(${base})`
	protected create = (left: ExpressionNode, right: ExpressionNode) => new SignedPowNode(left, right)

	override serialize(
		declarations: Record<string, string>,
		properties?: Record<string, PropertyRule>,
	): string {
		const base = this.left.serialize(declarations, properties)
		const exp = this.right.serialize(declarations, properties)
		return `pow(abs(${base}), ${exp}) * sign(${base})`
	}

	override needsCalcWrap(): boolean {
		return true
	}
}

export class MaxNode extends NaryNode {
	readonly kind = 'max'
	protected computeReduce = Math.max
	protected readonly identity = -Number.POSITIVE_INFINITY
	protected formatChildren = (serialized: string[]) => `max(${serialized.join(', ')})`
	protected create = (children: ExpressionNode[]) => new MaxNode(children)
}

export class MinNode extends NaryNode {
	readonly kind = 'min'
	protected computeReduce = Math.min
	protected readonly identity = Number.POSITIVE_INFINITY
	protected formatChildren = (serialized: string[]) => `min(${serialized.join(', ')})`
	protected create = (children: ExpressionNode[]) => new MinNode(children)
}

export class ClampNode implements ExpressionNode {
	readonly kind = 'clamp'
	readonly minimum: ExpressionNode
	readonly value: ExpressionNode
	readonly maximum: ExpressionNode

	constructor(minimum: ExpressionNode, value: ExpressionNode, maximum: ExpressionNode) {
		this.minimum = minimum
		this.value = value
		this.maximum = maximum
	}

	substitute(bindings: Record<string, ExpressionNode>): ExpressionNode {
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

	serialize(
		declarations: Record<string, string>,
		properties?: Record<string, PropertyRule>,
	): string {
		const min = this.minimum.serialize(declarations, properties)
		const val = this.value.serialize(declarations, properties)
		const max = this.maximum.serialize(declarations, properties)
		return `clamp(${min}, ${val}, ${max})`
	}

	needsCalcWrap(): boolean {
		return false
	}
}

export class OklchNode implements ExpressionNode {
	readonly kind = 'oklch'
	readonly lightness: ExpressionNode
	readonly chroma: ExpressionNode
	readonly hue: ExpressionNode

	constructor(lightness: ExpressionNode, chroma: ExpressionNode, hue: ExpressionNode) {
		this.lightness = lightness
		this.chroma = chroma
		this.hue = hue
	}

	substitute(bindings: Record<string, ExpressionNode>): ExpressionNode {
		return new OklchNode(
			this.lightness.substitute(bindings),
			this.chroma.substitute(bindings),
			this.hue.substitute(bindings),
		)
	}

	isConstant(): boolean {
		return this.lightness.isConstant() && this.chroma.isConstant() && this.hue.isConstant()
	}

	evaluateConstant(): number {
		throw new Error('Cannot evaluate oklch color as a number')
	}

	serialize(
		declarations: Record<string, string>,
		properties?: Record<string, PropertyRule>,
	): string {
		const l = this.lightness.serialize(declarations, properties)
		const c = this.chroma.serialize(declarations, properties)
		const h = this.hue.serialize(declarations, properties)

		// Wrap in calc() if needed
		const lExpr = this.lightness.needsCalcWrap() ? `calc(${l})` : l
		const cExpr = this.chroma.needsCalcWrap() ? `calc(${c})` : c
		const hExpr = this.hue.needsCalcWrap() ? `calc(${h})` : h

		return `oklch(${lExpr} ${cExpr} ${hExpr})`
	}

	needsCalcWrap(): boolean {
		return false
	}
}

function mergeDeclaration(declarations: Record<string, string>, name: string, value: string): void {
	const existing = declarations[name]
	if (existing !== undefined && existing !== value) {
		throw new Error(`Property '${name}' defined multiple times with different values`)
	}
	declarations[name] = value
}

export class PropertyNode implements ExpressionNode {
	readonly kind = 'property'
	readonly name: string
	readonly expr: ExpressionNode | null
	readonly syntax: '<number>' | '<color>'
	readonly inherits: boolean

	constructor(
		name: string,
		expr: ExpressionNode | null,
		syntax: '<number>' | '<color>',
		inherits: boolean,
	) {
		this.name = `--${name}`
		this.expr = expr
		this.syntax = syntax
		this.inherits = inherits
	}

	substitute(bindings: Record<string, ExpressionNode>): ExpressionNode {
		if (!this.expr) {
			// Input-only property: acts like a reference
			const refName = this.name.slice(2)
			const replacement = bindings[refName]
			if (replacement) {
				return replacement
			}
			return this
		}
		return new PropertyNode(
			this.name.slice(2),
			this.expr.substitute(bindings),
			this.syntax,
			this.inherits,
		)
	}

	isConstant(): boolean {
		return this.expr ? this.expr.isConstant() : false
	}

	evaluateConstant(): number {
		if (!this.expr) {
			throw new Error(`Cannot evaluate input property: ${this.name}`)
		}
		return this.expr.evaluateConstant()
	}

	serialize(
		declarations: Record<string, string>,
		properties?: Record<string, PropertyRule>,
	): string {
		// Register @property rule
		if (properties) {
			const existing = properties[this.name]
			if (existing && (existing.syntax !== this.syntax || existing.inherits !== this.inherits)) {
				throw new Error(`Property '${this.name}' defined multiple times with different rules`)
			}
			properties[this.name] = {
				syntax: this.syntax,
				inherits: this.inherits,
				initialValue: this.syntax === '<color>' ? 'transparent' : '0',
			}
		}

		if (this.expr) {
			const innerDeclarations: Record<string, string> = {}
			const value = this.expr.serialize(innerDeclarations, properties)
			const wrappedValue = this.expr.needsCalcWrap() ? `calc(${value})` : value

			for (const [key, val] of Object.entries(innerDeclarations)) {
				mergeDeclaration(declarations, key, val)
			}
			mergeDeclaration(declarations, this.name, wrappedValue)
		}

		return `var(${this.name})`
	}

	needsCalcWrap(): boolean {
		return false
	}
}
