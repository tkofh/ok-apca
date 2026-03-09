import type { CalcExpression } from '@ok-apca/calc-tree'
import * as ct from '@ok-apca/calc-tree'
import { GAMUT_SINE_CURVATURE_EXPONENT } from './constants.ts'

// --- Max chroma (gamut boundary) ---

const oneMinusApexL = ct.subtract(1, 'apexL')
const gamutLeftHalf = ct.divide(ct.multiply('apexC', 'lightness'), 'apexL')
const gamutT = ct.max(0, ct.divide(ct.subtract('lightness', 'apexL'), oneMinusApexL))
const linearChroma = ct.divide(ct.multiply('apexC', ct.subtract(1, 'lightness')), oneMinusApexL)
const curvatureCorrection = ct.multiply(
	ct.multiply(
		'curvature',
		ct.pow(ct.sin(ct.multiply(gamutT, Math.PI)), GAMUT_SINE_CURVATURE_EXPONENT),
	),
	'apexC',
)
const gamutRightHalf = ct.add(linearChroma, curvatureCorrection)
const isRightOfApex = ct.max(0, ct.sign(ct.subtract('lightness', 'apexL')))

export const maxChroma: CalcExpression<'lightness' | 'apexL' | 'apexC' | 'curvature'> = ct.lerp(
	gamutLeftHalf,
	gamutRightHalf,
	isRightOfApex,
)
