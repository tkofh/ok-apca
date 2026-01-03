import {
	createContrastSolver,
	createNormalPolaritySolver,
	createReversePolaritySolver,
} from './expressions.ts'
import { clamp } from './util.ts'

interface ApcaSolution {
	readonly targetY: number
	readonly inGamut: boolean
}

/**
 * Solve for normal polarity (darker contrast color).
 * Uses the shared expression tree from expressions.ts.
 */
function solveApcaNormal(Y: number, x: number): ApcaSolution {
	const result = createNormalPolaritySolver().evaluate({
		yBg: Y,
		x,
	})

	if (result.type !== 'number') {
		throw new Error('Expected numeric result from constant expression')
	}

	const targetY = clamp(0, result.value, 1)
	const epsilon = 0.0001
	const inGamut = result.value >= -epsilon && result.value <= 1 + epsilon

	return { targetY, inGamut }
}

/**
 * Solve for reverse polarity (lighter contrast color).
 * Uses the shared expression tree from expressions.ts.
 */
function solveApcaReverse(Y: number, x: number): ApcaSolution {
	const result = createReversePolaritySolver().evaluate({
		yBg: Y,
		x,
	})

	if (result.type !== 'number') {
		throw new Error('Expected numeric result from constant expression')
	}

	const targetY = clamp(0, result.value, 1)
	const epsilon = 0.0001
	const inGamut = result.value >= -epsilon && result.value <= 1 + epsilon

	return { targetY, inGamut }
}

/**
 * Solve for target Y given signed contrast value.
 * Positive contrast = lighter text, negative = darker text.
 * The result is clamped to the gamut boundary [0, 1].
 *
 * Uses the shared expression tree from expressions.ts to ensure parity
 * with CSS generation.
 */
export function solveTargetY(Y: number, signedContrast: number): number {
	// Use the combined solver expression
	const result = createContrastSolver().evaluate({
		yBg: Y,
		signedContrast,
		contrastScale: 100,
	})

	if (result.type !== 'number') {
		throw new Error('Expected numeric result from constant expression')
	}

	return result.value
}

// Keep individual solvers available for testing/debugging
export { solveApcaNormal, solveApcaReverse }
