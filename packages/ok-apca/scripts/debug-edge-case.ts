/**
 * Debug a specific edge case: L=0.02, C=0.15, target=105 at hue 150
 */

import { solveTargetY } from '../src/apca.ts'
import { createColor, findGamutSlice, gamutMap } from '../src/color.ts'
import { measureContrast } from '../src/measure.ts'
import { clamp } from '../src/util.ts'

const hue = 150
const lightness = 0.02
const chroma = 0.15
const targetContrast = 105

const slice = findGamutSlice(hue)
console.log('Gamut slice:', slice)

const baseColor = gamutMap(createColor(hue, chroma, lightness))
console.log('Base color after gamut map:', baseColor)

const L = baseColor.lightness
const Y = L ** 3
console.log(`Base L=${L}, Y=${Y}`)

// Without heuristic boost
console.log('\n--- Without heuristic boost ---')
const clampedContrast = clamp(-108, -targetContrast, 108)
console.log(`Clamped contrast: ${clampedContrast}`)

const targetY = solveTargetY(Y, clampedContrast, true)
console.log(`Target Y: ${targetY}`)

const contrastL = clamp(0, targetY ** (1 / 3), 1)
console.log(`Contrast L: ${contrastL}`)

// Compute chroma at contrast lightness
function computeMaxChroma(L: number) {
	const { apex, curvature } = slice

	if (L <= 0 || L >= 1) {
		return 0
	}
	if (apex.lightness <= 0 || apex.lightness >= 1) {
		return 0
	}

	if (L <= apex.lightness) {
		return (apex.chroma * L) / apex.lightness
	}

	const linearChroma = (apex.chroma * (1 - L)) / (1 - apex.lightness)
	const t = (L - apex.lightness) / (1 - apex.lightness)
	const correction = curvature * t * (1 - t) * apex.chroma

	return linearChroma + correction
}

const maxChromaAtBase = computeMaxChroma(L)
console.log(`Max chroma at base L: ${maxChromaAtBase}`)

// Use gamut-mapped chroma (baseColor.chroma), not requested chroma
const chromaPct = maxChromaAtBase > 0 ? Math.min(1, baseColor.chroma / maxChromaAtBase) : 0
console.log(`Chroma percentage (clamped): ${chromaPct}`)

const maxChromaAtContrast = computeMaxChroma(contrastL)
console.log(`Max chroma at contrast L: ${maxChromaAtContrast}`)

const contrastC = maxChromaAtContrast * chromaPct
console.log(`Contrast chroma: ${contrastC}`)

const contrastColor = createColor(hue, contrastC, contrastL)
console.log('Contrast color:', contrastColor)

const actual = measureContrast(baseColor, contrastColor)
console.log(`Actual contrast: ${actual}`)

// What about with boosted contrast?
console.log('\n--- With boosted contrast (197.3) ---')
const boostedContrast = 197.3
const clampedBoosted = clamp(-108, -boostedContrast, 108)
console.log(`Clamped boosted contrast: ${clampedBoosted}`)

const targetYBoosted = solveTargetY(Y, clampedBoosted, true)
console.log(`Target Y (boosted): ${targetYBoosted}`)

const contrastLBoosted = clamp(0, targetYBoosted ** (1 / 3), 1)
console.log(`Contrast L (boosted): ${contrastLBoosted}`)

const maxChromaAtContrastBoosted = computeMaxChroma(contrastLBoosted)
console.log(`Max chroma at contrast L (boosted): ${maxChromaAtContrastBoosted}`)

const contrastCBoosted = maxChromaAtContrastBoosted * chromaPct
console.log(`Contrast chroma (boosted): ${contrastCBoosted}`)

const contrastColorBoosted = createColor(hue, contrastCBoosted, contrastLBoosted)
console.log('Contrast color (boosted):', contrastColorBoosted)

const actualBoosted = measureContrast(baseColor, contrastColorBoosted)
console.log(`Actual contrast (boosted): ${actualBoosted}`)

// What's the max possible?
console.log('\n--- Max possible ---')
const black = gamutMap(createColor(hue, 0, 0))
const white = gamutMap(createColor(hue, 0, 1))
console.log('Black:', black)
console.log('White:', white)
console.log(`To black: ${measureContrast(baseColor, black)}`)
console.log(`To white: ${measureContrast(baseColor, white)}`)
