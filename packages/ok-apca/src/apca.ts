import {
	clampNumeric,
	createContrastSolver,
	createNormalPolaritySolver,
	createReversePolaritySolver,
} from './expressions.ts'

interface ApcaSolution {
	readonly targetY: number
	readonly inGamut: boolean
}

/**
 * Solve for normal polarity (darker contrast color).
 * Uses the shared expression tree from expressions.ts.
 */
function solveApcaNormal(Y: number, x: number): ApcaSolution {
	const rawY = createNormalPolaritySolver().toNumber({ yBg: Y, x })

	const targetY = clampNumeric(0, rawY, 1)
	const epsilon = 0.0001
	const inGamut = rawY >= -epsilon && rawY <= 1 + epsilon

	return { targetY, inGamut }
}

/**
 * Solve for reverse polarity (lighter contrast color).
 * Uses the shared expression tree from expressions.ts.
 */
function solveApcaReverse(Y: number, x: number): ApcaSolution {
	const rawY = createReversePolaritySolver().toNumber({ yBg: Y, x })

	const targetY = clampNumeric(0, rawY, 1)
	const epsilon = 0.0001
	const inGamut = rawY >= -epsilon && rawY <= 1 + epsilon

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
	return createContrastSolver().toNumber({
		yBg: Y,
		signedContrast,
		contrastScale: 100,
	})
}

// Keep individual solvers available for testing/debugging
export { solveApcaNormal, solveApcaReverse }
