import type { CalcExpression } from '@ok-apca/calc-tree'
import * as ct from '@ok-apca/calc-tree'
import {
	APCA_BG_EXP_NORMAL,
	APCA_BG_EXP_REVERSE,
	APCA_NORMAL_INV_EXP,
	APCA_OFFSET,
	APCA_REVERSE_INV_EXP,
	APCA_SCALE,
	APCA_SMOOTH_POWER,
	APCA_SMOOTH_THRESHOLD,
	APCA_SMOOTH_THRESHOLD_OFFSET,
	GAMUT_SINE_CURVATURE_EXPONENT,
} from './constants.ts'
import type { GamutSlice } from './types.ts'

export function createMaxChromaExpr(slice: GamutSlice): CalcExpression<'lightness'> {
	const L = ct.reference('lightness')
	const apexL = slice.apex.lightness
	const apexC = slice.apex.chroma
	const curv = slice.curvature
	const oneMinusApexL = 1 - apexL

	const leftHalf = ct.divide(ct.multiply(apexC, L), apexL)

	const t = ct.max(0, ct.divide(ct.subtract(L, apexL), oneMinusApexL))
	const linearChroma = ct.divide(ct.multiply(apexC, ct.subtract(1, L)), oneMinusApexL)
	const correction = ct.multiply(
		ct.multiply(curv, ct.power(ct.sin(ct.multiply(t, Math.PI)), GAMUT_SINE_CURVATURE_EXPONENT)),
		apexC,
	)
	const rightHalf = ct.add(linearChroma, correction)

	const isRight = ct.max(0, ct.sign(ct.subtract(L, apexL)))
	return ct.add(ct.multiply(ct.subtract(1, isRight), leftHalf), ct.multiply(isRight, rightHalf))
}

function createYMinNormal(): CalcExpression<'yBg'> {
	const term = ct.subtract(
		ct.power(ct.reference('yBg'), APCA_BG_EXP_NORMAL),
		APCA_SMOOTH_THRESHOLD_OFFSET,
	)
	return ct.multiply(ct.power(ct.abs(term), APCA_NORMAL_INV_EXP), ct.sign(term))
}

function createYMinReverse(): CalcExpression<'yBg'> {
	const term = ct.add(
		ct.power(ct.reference('yBg'), APCA_BG_EXP_REVERSE),
		APCA_SMOOTH_THRESHOLD_OFFSET,
	)
	return ct.power(term, APCA_REVERSE_INV_EXP)
}

export function createNormalPolaritySolver(): CalcExpression<'yBg' | 'x'> {
	const yBg = ct.reference('yBg')
	const x = ct.reference('x')

	const term = ct.subtract(
		ct.power(yBg, APCA_BG_EXP_NORMAL),
		ct.divide(ct.add(x, APCA_OFFSET), APCA_SCALE),
	)
	const directSolution = ct.multiply(ct.power(ct.abs(term), APCA_NORMAL_INV_EXP), ct.sign(term))

	const t = ct.min(ct.divide(x, APCA_SMOOTH_THRESHOLD), 1)
	const blend = ct.power(ct.sin(ct.multiply(t, Math.PI / 2)), APCA_SMOOTH_POWER)
	const smoothSolution = ct.add(yBg, ct.multiply(ct.subtract(createYMinNormal(), yBg), blend))

	const aboveThreshold = ct.max(0, ct.sign(ct.subtract(x, APCA_SMOOTH_THRESHOLD)))
	return ct.add(
		ct.multiply(aboveThreshold, directSolution),
		ct.multiply(ct.subtract(1, aboveThreshold), smoothSolution),
	)
}

export function createReversePolaritySolver(): CalcExpression<'yBg' | 'x'> {
	const yBg = ct.reference('yBg')
	const x = ct.reference('x')

	const term = ct.add(
		ct.power(yBg, APCA_BG_EXP_REVERSE),
		ct.divide(ct.add(x, APCA_OFFSET), APCA_SCALE),
	)
	const directSolution = ct.power(term, APCA_REVERSE_INV_EXP)

	const t = ct.min(ct.divide(x, APCA_SMOOTH_THRESHOLD), 1)
	const blend = ct.power(ct.sin(ct.multiply(t, Math.PI / 2)), APCA_SMOOTH_POWER)
	const smoothSolution = ct.add(yBg, ct.multiply(ct.subtract(createYMinReverse(), yBg), blend))

	const aboveThreshold = ct.max(0, ct.sign(ct.subtract(x, APCA_SMOOTH_THRESHOLD)))
	return ct.add(
		ct.multiply(aboveThreshold, directSolution),
		ct.multiply(ct.subtract(1, aboveThreshold), smoothSolution),
	)
}

export function createContrastSolver(): CalcExpression<'yBg' | 'signedContrast' | 'contrastScale'> {
	const signedContrast = ct.reference('signedContrast')
	const yBg = ct.reference('yBg')
	const x = ct.divide(ct.abs(signedContrast), ct.reference('contrastScale'))

	const normalExpr = createNormalPolaritySolver().bind('x', x)
	const reverseExpr = createReversePolaritySolver().bind('x', x)

	const signVal = ct.sign(signedContrast)
	const preferLight = ct.max(0, signVal)
	const preferDark = ct.max(0, ct.multiply(-1, signVal))
	const isZero = ct.subtract(1, ct.max(preferLight, preferDark))

	return ct.clamp(
		0,
		ct.add(
			ct.add(ct.multiply(preferLight, reverseExpr), ct.multiply(preferDark, normalExpr)),
			ct.multiply(isZero, yBg),
		),
		1,
	)
}

export function createYFromLightness(): CalcExpression<'lightness'> {
	return ct.power(ct.reference('lightness'), 3)
}

export function createLightnessFromY() {
	return ct.power(ct.reference('y'), 1 / 3)
}

export function clamp(minimum: number, value: number, maximum: number): number {
	return ct.clamp(minimum, value, maximum).toNumber()
}
