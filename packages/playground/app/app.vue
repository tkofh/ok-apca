<script setup lang="ts">
import {
	applyContrast,
	applyContrastPrecise,
	type ContrastMode,
	findGamutBoundary,
	generateColorCss,
} from 'ok-apca'
import type { ComputedRef, Ref } from 'vue'

const hue: Ref<number> = ref(240)
const chroma: Ref<number> = ref(50)
const lightness: Ref<number> = ref(50)
const contrast: Ref<number> = ref(60)
const mode: Ref<ContrastMode> = ref<ContrastMode>('prefer-light')

const contrastModes: ContrastMode[] = [
	'force-light',
	'prefer-light',
	'prefer-dark',
	'force-dark',
]

const generatedCss: ComputedRef<string> = computed(() => {
	return generateColorCss({
		hue: hue.value,
		selector: '.preview',
		contrast: {
			mode: mode.value,
			selector: '&',
		},
	})
})

// Compute error statistics
const errorStats = computed(() => {
	const boundary = findGamutBoundary(hue.value)
	const color = {
		hue: hue.value,
		chroma: chroma.value / 100, // Convert from 0-100 to 0-1
		lightness: lightness.value / 100, // Convert from 0-100 to 0-1
	}

	const cssResult = applyContrast(color, contrast.value, mode.value, boundary)
	const preciseResult = applyContrastPrecise(color, contrast.value, mode.value, boundary)

	// Compute approximate APCA contrast values
	function computeAPCA(Ybg: number, Yfg: number): number {
		const ybg = Ybg ** 3
		const yfg = Yfg ** 3

		if (ybg > yfg) {
			return (1.14 * (ybg ** 0.56 - yfg ** 0.57) - 0.027) * 100
		}
		return (1.14 * (yfg ** 0.62 - ybg ** 0.65) - 0.027) * 100
	}

	const baseL = color.lightness
	const absoluteError = Math.abs(cssResult.lightness - preciseResult.lightness)

	return {
		targetContrast: contrast.value,
		cssLc: computeAPCA(baseL, cssResult.lightness),
		preciseLc: computeAPCA(baseL, preciseResult.lightness),
		errorLc: computeAPCA(baseL, cssResult.lightness) - computeAPCA(baseL, preciseResult.lightness),
		errorL: (absoluteError * 100).toFixed(2),
	}
})

const tag: ReturnType<typeof useStyleTag> = useStyleTag('')

watchEffect(() => {
	if (generatedCss.value !== tag.css.value) {
		tag.css.value = generatedCss.value
	}
})

const previewStyle: ComputedRef<Record<string, number>> = computed(() => ({
	'--lightness': lightness.value,
	'--chroma': chroma.value,
	'--contrast': contrast.value,
}))
</script>

<template>
	<div class="playground">
		<div class="sidebar">
			<div class="controls">
				<label>
					Hue
					<input v-model.number="hue" type="number" min="0" max="360" step="0.1" />
					<input v-model.number="hue" type="range" min="0" max="360" step="0.1" />
				</label>

				<label>
					Chroma
					<input v-model.number="chroma" type="number" min="0" max="40" step="0.1" />
					<input v-model.number="chroma" type="range" min="0" max="40" step="0.1" />
				</label>

				<label>
					Lightness
					<input v-model.number="lightness" type="number" min="0" max="100" step="0.1" />
					<input v-model.number="lightness" type="range" min="0" max="100" step="0.1" />
				</label>

				<label>
					Contrast
					<input v-model.number="contrast" type="number" min="0" max="108" step="0.1" />
					<input v-model.number="contrast" type="range" min="0" max="108" step="0.1" />
				</label>

				<label>
					Mode
					<select v-model="mode">
						<option v-for="m in contrastModes" :key="m" :value="m">
							{{ m }}
						</option>
					</select>
				</label>
			</div>

			<div class="stats">
				<h3>APCA Contrast Stats</h3>

				<div class="stat-group">
					<h4>Target: {{ errorStats.targetContrast }} Lc</h4>
				</div>

				<div class="stat-group">
					<h4>Precise (accurate):</h4>
					<div class="stat-value">{{ errorStats.preciseLc.toFixed(2) }} Lc</div>
				</div>

				<div class="stat-group">
					<h4>CSS (simplified):</h4>
					<div class="stat-value">{{ errorStats.cssLc.toFixed(2) }} Lc</div>
					<div class="stat-error" :class="{ negative: errorStats.errorLc < 0 }">
						{{ errorStats.errorLc >= 0 ? '+' : '' }}{{ errorStats.errorLc.toFixed(2) }} Lc error
					</div>
					<div class="stat-detail">{{ errorStats.errorL }}% L error</div>
				</div>
			</div>
		</div>

		<div class="preview" :style="previewStyle">
			<span class="preview-text">Contrast Text</span>
		</div>
	</div>
</template>

<style>
* {
	box-sizing: border-box;
}

body {
	margin: 0;
	font-family: system-ui, -apple-system, sans-serif;
	background: #1a1a1a;
	color: #f0f0f0;
}

.playground {
	display: grid;
	grid-template-columns: 380px 1fr;
	gap: 2rem;
	padding: 2rem;
	min-height: 100vh;
}

.sidebar {
	display: flex;
	flex-direction: column;
	gap: 2rem;
}

.controls {
	display: flex;
	flex-direction: column;
	gap: 1.5rem;
}

.controls label {
	display: flex;
	flex-direction: column;
	gap: 0.25rem;
	font-size: 0.875rem;
	font-weight: 500;
	color: #a0a0a0;
}

.controls input[type="number"],
.controls select {
	padding: 0.5rem;
	font-size: 1rem;
	background: #2a2a2a;
	border: 1px solid #3a3a3a;
	border-radius: 4px;
	color: #f0f0f0;
}

.controls input[type="range"] {
	margin-top: 0.25rem;
}

.stats {
	background: #2a2a2a;
	border: 1px solid #3a3a3a;
	border-radius: 8px;
	padding: 1.5rem;
}

.stats h3 {
	margin: 0 0 1rem 0;
	font-size: 1rem;
	font-weight: 600;
	color: #f0f0f0;
}

.stats h4 {
	margin: 0 0 0.5rem 0;
	font-size: 0.875rem;
	font-weight: 500;
	color: #a0a0a0;
}

.stat-group {
	margin-bottom: 1.25rem;
	padding-bottom: 1.25rem;
	border-bottom: 1px solid #3a3a3a;
}

.stat-group:last-child {
	margin-bottom: 0;
	padding-bottom: 0;
	border-bottom: none;
}

.stat-value {
	font-size: 1.25rem;
	font-weight: 600;
	color: #60d0ff;
	margin-bottom: 0.25rem;
}

.stat-error {
	font-size: 0.875rem;
	font-weight: 500;
	color: #ff6060;
	margin-bottom: 0.25rem;
}

.stat-error.negative {
	color: #60ff60;
}

.stat-detail {
	font-size: 0.75rem;
	color: #808080;
}

.preview {
	aspect-ratio: 1;
	max-height: calc(100vh - 4rem);
	background: var(--o-color);
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 8px;
	box-shadow: 0 4px 12px rgba(0, 0, 0, 0.3);
}

.preview-text {
	color: var(--o-color-contrast);
	font-size: 2rem;
	font-weight: 600;
}
</style>
