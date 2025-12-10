/**
 * Regression correction for APCA contrast calculations.
 *
 * This module uses polynomial regression to improve the accuracy of CSS-generated
 * contrast colors by correcting for the simplified math used in CSS.
 */

import { Matrix, solve } from 'ml-matrix'
import { gamutMap } from './color.ts'
import { applyContrast } from './contrast.ts'
import { findGamutBoundary } from './gamut.ts'
import type { ContrastMode, GamutBoundary } from './types.ts'
import { measureContrast } from './measure.ts'

/**
 * A single data point capturing the error between target and actual contrast.
 */
export interface ErrorDataPoint {
	/** Base color lightness (0-1) */
	readonly baseL: number
	/** Base color chroma (0-0.4) */
	readonly baseC: number
	/** Target contrast value (0-108) */
	readonly targetContrast: number
	/** Resulting contrast color lightness from CSS implementation */
	readonly contrastColorL: number
	/** Actual verified contrast using precise APCA */
	readonly actualContrast: number
	/** Error: actualContrast - targetContrast */
	readonly error: number
}

/**
 * Options for controlling sampling density.
 */
export interface SamplingOptions {
	/** Number of lightness values to sample (default: 21) */
	readonly lightnessSteps?: number
	/** Number of chroma values to sample (default: 5) */
	readonly chromaSteps?: number
	/** Number of contrast values to sample (default: 20) */
	readonly contrastSteps?: number
}

/**
 * Sample the error landscape for a given hue and contrast mode.
 *
 * Generates a dense grid of test cases and computes the error between
 * the target contrast and the actual verified contrast.
 *
 * @param hue - The hue to sample (0-360)
 * @param mode - The contrast mode to test
 * @param options - Sampling density options
 * @returns Array of error data points
 */
export function sampleErrorData(
	hue: number,
	mode: ContrastMode,
	options: SamplingOptions = {},
): ErrorDataPoint[] {
	const lightnessSteps = options.lightnessSteps ?? 21
	const chromaSteps = options.chromaSteps ?? 5
	const contrastSteps = options.contrastSteps ?? 20

	const boundary = findGamutBoundary(hue)
	const results: ErrorDataPoint[] = []

	// Sample lightness from 0 to 1
	for (let lIdx = 0; lIdx < lightnessSteps; lIdx++) {
		const lightness = lIdx / (lightnessSteps - 1)

		// Sample chroma from 0 to 0.4
		for (let cIdx = 0; cIdx < chromaSteps; cIdx++) {
			const chroma = (cIdx / (chromaSteps - 1)) * 0.4

			// Sample contrast from 10 to 105
			for (let contIdx = 0; contIdx < contrastSteps; contIdx++) {
				const targetContrast = 10 + (contIdx / (contrastSteps - 1)) * 95

				// Create base color and apply gamut mapping
				const baseColor = gamutMap({ hue, chroma, lightness })

				// Apply CSS-matching contrast solver
				const contrastColor = applyContrast(
					{ hue, chroma, lightness },
					targetContrast,
					mode,
				)

				// Verify actual contrast using precise APCA
				const actualContrast = measureContrast(baseColor, contrastColor)

				// Compute error (use absolute value of actualContrast for comparison)
				const error = Math.abs(actualContrast) - targetContrast

				results.push({
					baseL: baseColor.lightness,
					baseC: baseColor.chroma,
					targetContrast,
					contrastColorL: contrastColor.lightness,
					actualContrast: Math.abs(actualContrast),
					error,
				})
			}
		}
	}

	return results
}

/**
 * Compute statistics on error data.
 */
export interface ErrorStats {
	readonly mae: number
	readonly rmse: number
	readonly worstCase: number
	readonly median: number
	readonly count: number
}

/**
 * Compute error statistics from a dataset.
 */
export function computeErrorStats(data: ErrorDataPoint[]): ErrorStats {
	const errors = data.map((d) => Math.abs(d.error))
	const squaredErrors = errors.map((e) => e * e)

	const mae = errors.reduce((a, b) => a + b, 0) / errors.length
	const rmse = Math.sqrt(squaredErrors.reduce((a, b) => a + b, 0) / errors.length)
	const worstCase = Math.max(...errors)

	const sorted = [...errors].sort((a, b) => a - b)
	const median = sorted[Math.floor(sorted.length / 2)] ?? 0

	return {
		mae,
		rmse,
		worstCase,
		median,
		count: data.length,
	}
}

/**
 * Split data into train and test sets.
 */
export function splitData<T>(data: T[], trainRatio = 0.8): { train: T[]; test: T[] } {
	// Shuffle data first
	const shuffled = [...data].sort(() => Math.random() - 0.5)

	const trainSize = Math.floor(data.length * trainRatio)
	return {
		train: shuffled.slice(0, trainSize),
		test: shuffled.slice(trainSize),
	}
}

/**
 * Add power terms for a given degree.
 */
function addPowerTerms(
	varNames: string[],
	vars: Record<string, number>,
	power: number,
	names: string[],
	values: number[],
): void {
	for (const name of varNames) {
		names.push(`${name}^${power}`)
		values.push((vars[name] as number) ** power)
	}
}

/**
 * Add interaction terms (var_i^p * var_j).
 */
function addInteractionTerms(
	varNames: string[],
	vars: Record<string, number>,
	power: number,
	names: string[],
	values: number[],
): void {
	for (let i = 0; i < varNames.length; i++) {
		for (let j = 0; j < varNames.length; j++) {
			if (i !== j) {
				const nameI = varNames[i] as string
				const nameJ = varNames[j] as string
				names.push(`${nameI}^${power}*${nameJ}`)
				values.push((vars[nameI] as number) ** power * (vars[nameJ] as number))
			}
		}
	}
}

/**
 * Generate polynomial features from input variables.
 *
 * @param vars - Object mapping variable names to values
 * @param degree - Maximum polynomial degree
 * @returns Feature names and values
 */
export function generatePolynomialFeatures(
	vars: Record<string, number>,
	degree: number,
): { names: string[]; values: number[] } {
	const names: string[] = ['1'] // Intercept
	const values: number[] = [1]
	const varNames = Object.keys(vars)

	// Linear terms
	addPowerTerms(varNames, vars, 1, names, values)

	// Quadratic and higher degrees
	if (degree >= 2) {
		addPowerTerms(varNames, vars, 2, names, values)
		// Pairwise interactions for degree 2
		for (let i = 0; i < varNames.length; i++) {
			for (let j = i + 1; j < varNames.length; j++) {
				const nameI = varNames[i] as string
				const nameJ = varNames[j] as string
				names.push(`${nameI}*${nameJ}`)
				values.push((vars[nameI] as number) * (vars[nameJ] as number))
			}
		}
	}

	if (degree >= 3) {
		addPowerTerms(varNames, vars, 3, names, values)
		addInteractionTerms(varNames, vars, 2, names, values)
	}

	if (degree >= 4) {
		addPowerTerms(varNames, vars, 4, names, values)
		addInteractionTerms(varNames, vars, 3, names, values)
	}

	if (degree >= 5) {
		addPowerTerms(varNames, vars, 5, names, values)
	}

	return { names, values }
}

/**
 * Fit a polynomial regression model using least squares.
 *
 * @param X - Feature matrix (rows = samples, cols = features)
 * @param y - Target vector
 * @returns Coefficient vector
 */
export function fitPolynomialRegression(X: Matrix, y: Matrix): number[] {
	// Solve: X^T * X * β = X^T * y using normal equations
	const XT_X = X.transpose().mmul(X)
	const XTY = X.transpose().mmul(y)

	// Use the solve function from ml-matrix for least squares
	const beta = solve(XT_X, XTY) as Matrix

	return beta.to1DArray()
}

/**
 * Evaluate a polynomial with given coefficients and feature values.
 */
export function evaluatePolynomial(coefficients: number[], features: number[]): number {
	if (coefficients.length !== features.length) {
		throw new Error(
			`Coefficient count (${coefficients.length}) must match feature count (${features.length})`,
		)
	}

	return coefficients.reduce((sum, coef, i) => sum + coef * (features[i] ?? 0), 0)
}

/**
 * Numerically solve for the lightness value that produces the target contrast.
 *
 * Uses binary search to find the L value where measureContrast(base, contrast) ≈ targetContrast.
 *
 * @param hue - The hue
 * @param baseL - Base color lightness
 * @param baseC - Base color chroma
 * @param targetContrast - Desired absolute contrast value
 * @param boundary - Gamut boundary
 * @param tolerance - Acceptable error in Lc (default: 0.1)
 * @returns The lightness value that produces the target contrast
 */
export function solveForCorrectL(
	hue: number,
	baseL: number,
	baseC: number,
	targetContrast: number,
	boundary: GamutBoundary,
	tolerance = 0.1,
): number {
	const baseColor = gamutMap({ hue, chroma: baseC, lightness: baseL })

	// Binary search for the correct L
	let low = 0
	let high = 1
	let bestL = 0.5
	let bestError = Number.POSITIVE_INFINITY

	for (let iter = 0; iter < 50; iter++) {
		const mid = (low + high) / 2
		const contrastColor = gamutMap({ hue, chroma: baseC, lightness: mid })
		const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))
		const error = Math.abs(actualContrast - targetContrast)

		if (error < bestError) {
			bestError = error
			bestL = mid
		}

		if (error < tolerance) {
			return mid
		}

		// Adjust search bounds based on whether we're too high or too low
		if (actualContrast < targetContrast) {
			// Need more contrast - move further from base
			if (mid > baseL) {
				low = mid
			} else {
				high = mid
			}
		} else if (actualContrast > targetContrast) {
			// Need less contrast - move closer to base
			if (mid > baseL) {
				high = mid
			} else {
				low = mid
			}
		}
	}

	return bestL
}

/**
 * Regression coefficients for a fitted model.
 */
export interface RegressionCoefficients {
	/** Correction approach used */
	readonly approach: 'input' | 'output'
	/** Polynomial degree */
	readonly degree: number
	/** Feature names (for documentation) */
	readonly featureNames: string[]
	/** Regression coefficients */
	readonly coefficients: number[]
	/** Mean absolute error on test set */
	readonly mae: number
	/** Worst-case error on test set */
	readonly worstCase: number
	/** Root mean squared error on test set */
	readonly rmse: number
}

/**
 * Fit an input correction model (Option A).
 *
 * Adjusts the target contrast before it enters the APCA solver.
 * Target: contrast_adjusted = f(contrast, baseL, baseC)
 *
 * @param trainData - Training data
 * @param testData - Test data for validation
 * @param degree - Polynomial degree (1-3 recommended)
 * @param boundary - Gamut boundary for the hue
 * @param mode - Contrast mode
 * @returns Regression coefficients and validation metrics
 */
export function fitInputCorrection(
	trainData: ErrorDataPoint[],
	testData: ErrorDataPoint[],
	degree: number,
	boundary: GamutBoundary,
	mode: ContrastMode,
): RegressionCoefficients {
	// Build feature matrix: polynomial features of (contrast, baseL, baseC)
	const featureRows: number[][] = []
	const targets: number[] = []

	let featureNames: string[] = []

	for (const point of trainData) {
		const vars = {
			contrast: point.targetContrast,
			baseL: point.baseL,
			baseC: point.baseC,
		}

		const { names, values } = generatePolynomialFeatures(vars, degree)

		if (featureNames.length === 0) {
			featureNames = names
		}

		featureRows.push(values)

		// Target is the adjusted contrast that would produce the desired actualContrast
		// We want: CSS(contrast_adjusted) = targetContrast
		// So: contrast_adjusted = targetContrast - error
		// (This is an approximation; ideally we'd invert the CSS function)
		targets.push(point.targetContrast - point.error)
	}

	const X = new Matrix(featureRows)
	const y = Matrix.columnVector(targets)

	const coefficients = fitPolynomialRegression(X, y)

	// Validate on test set
	const testErrors: number[] = []

	for (const point of testData) {
		const vars = {
			contrast: point.targetContrast,
			baseL: point.baseL,
			baseC: point.baseC,
		}

		const { values } = generatePolynomialFeatures(vars, degree)
		const adjustedContrast = evaluatePolynomial(coefficients, values)

		// Re-run CSS solver with adjusted contrast
		const baseColor = gamutMap({ hue: 0, chroma: point.baseC, lightness: point.baseL })
		const contrastColor = applyContrast(
			{ hue: 0, chroma: point.baseC, lightness: point.baseL },
			adjustedContrast,
			mode,
		)
		const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

		const error = Math.abs(actualContrast - point.targetContrast)
		testErrors.push(error)
	}

	const mae = testErrors.reduce((a, b) => a + b, 0) / testErrors.length
	const rmse = Math.sqrt(testErrors.reduce((a, b) => a + b * b, 0) / testErrors.length)
	const worstCase = Math.max(...testErrors)

	return {
		approach: 'input',
		degree,
		featureNames,
		coefficients,
		mae,
		worstCase,
		rmse,
	}
}

/**
 * Apply input correction to adjust target contrast.
 */
export function applyInputCorrection(
	targetContrast: number,
	baseL: number,
	baseC: number,
	model: RegressionCoefficients,
): number {
	if (model.approach !== 'input') {
		throw new Error('Model approach must be "input"')
	}

	const vars = {
		contrast: targetContrast,
		baseL,
		baseC,
	}

	const { values } = generatePolynomialFeatures(vars, model.degree)
	return evaluatePolynomial(model.coefficients, values)
}

/**
 * Fit an output correction model (Option B).
 *
 * Adjusts the resulting lightness after the APCA solver runs.
 * Target: contrastL_corrected = f(contrastL_raw, targetContrast, baseL, baseC)
 *
 * @param trainData - Training data
 * @param testData - Test data for validation
 * @param degree - Polynomial degree (2-5 recommended)
 * @param boundary - Gamut boundary for the hue
 * @param mode - Contrast mode
 * @param hue - The hue being fitted
 * @returns Regression coefficients and validation metrics
 */
export function fitOutputCorrection(
	trainData: ErrorDataPoint[],
	testData: ErrorDataPoint[],
	degree: number,
	boundary: GamutBoundary,
	_mode: ContrastMode,
	hue: number,
): RegressionCoefficients {
	// Build feature matrix: polynomial features of (contrastL, targetContrast, baseL, baseC)
	const featureRows: number[][] = []
	const targets: number[] = []

	let featureNames: string[] = []

	console.log(`  Computing correct L values for ${trainData.length} training samples...`)

	for (const point of trainData) {
		const vars = {
			contrastL: point.contrastColorL,
			targetContrast: point.targetContrast,
			baseL: point.baseL,
			baseC: point.baseC,
		}

		const { names, values } = generatePolynomialFeatures(vars, degree)

		if (featureNames.length === 0) {
			featureNames = names
		}

		featureRows.push(values)

		// Numerically solve for the CORRECT L that would produce targetContrast
		const correctL = solveForCorrectL(hue, point.baseL, point.baseC, point.targetContrast, boundary)

		targets.push(correctL)
	}

	const X = new Matrix(featureRows)
	const y = Matrix.columnVector(targets)

	const coefficients = fitPolynomialRegression(X, y)

	// Validate on test set
	const testErrors: number[] = []

	for (const point of testData) {
		const vars = {
			contrastL: point.contrastColorL,
			targetContrast: point.targetContrast,
			baseL: point.baseL,
			baseC: point.baseC,
		}

		const { values } = generatePolynomialFeatures(vars, degree)
		const correctedL = evaluatePolynomial(coefficients, values)

		// Verify actual contrast with corrected lightness
		const baseColor = gamutMap({ hue: 0, chroma: point.baseC, lightness: point.baseL })
		const contrastColor = gamutMap({ hue: 0, chroma: point.baseC, lightness: correctedL })
		const actualContrast = Math.abs(measureContrast(baseColor, contrastColor))

		const error = Math.abs(actualContrast - point.targetContrast)
		testErrors.push(error)
	}

	const mae = testErrors.reduce((a, b) => a + b, 0) / testErrors.length
	const rmse = Math.sqrt(testErrors.reduce((a, b) => a + b * b, 0) / testErrors.length)
	const worstCase = Math.max(...testErrors)

	return {
		approach: 'output',
		degree,
		featureNames,
		coefficients,
		mae,
		worstCase,
		rmse,
	}
}

/**
 * Apply output correction to adjust contrast color lightness.
 */
export function applyOutputCorrection(
	contrastL: number,
	targetContrast: number,
	baseL: number,
	baseC: number,
	model: RegressionCoefficients,
): number {
	if (model.approach !== 'output') {
		throw new Error('Model approach must be "output"')
	}

	const vars = {
		contrastL,
		targetContrast,
		baseL,
		baseC,
	}

	const { values } = generatePolynomialFeatures(vars, model.degree)
	return evaluatePolynomial(model.coefficients, values)
}
