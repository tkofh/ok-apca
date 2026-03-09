import type { CalcExpression } from '@ok-apca/calc-tree'
import * as ct from '@ok-apca/calc-tree'
import { GAMUT_SINE_CURVATURE_EXPONENT } from './constants.ts'

export const lightnessRef = ct.reference('lightness')
export const chromaRef = ct.reference('chroma')

// --- Max chroma (gamut boundary) ---

const apexLRef = ct.reference('apexL')
const apexCRef = ct.reference('apexC')
const curvatureRef = ct.reference('curvature')

const oneMinusApexL = ct.subtract(1, apexLRef)
const gamutLeftHalf = ct.divide(ct.multiply(apexCRef, lightnessRef), apexLRef)
const gamutT = ct.max(0, ct.divide(ct.subtract(lightnessRef, apexLRef), oneMinusApexL))
const linearChroma = ct.divide(ct.multiply(apexCRef, ct.subtract(1, lightnessRef)), oneMinusApexL)
const curvatureCorrection = ct.multiply(
	ct.multiply(
		curvatureRef,
		ct.pow(ct.sin(ct.multiply(gamutT, Math.PI)), GAMUT_SINE_CURVATURE_EXPONENT),
	),
	apexCRef,
)
const gamutRightHalf = ct.add(linearChroma, curvatureCorrection)
const isRightOfApex = ct.max(0, ct.sign(ct.subtract(lightnessRef, apexLRef)))

export const maxChroma: CalcExpression<'lightness' | 'apexL' | 'apexC' | 'curvature'> = ct.lerp(
	gamutLeftHalf,
	gamutRightHalf,
	isRightOfApex,
)
