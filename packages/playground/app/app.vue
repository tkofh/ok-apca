<script setup lang="ts">
import { generateColorCss } from 'ok-apca'

const hue = ref(240)
const chroma = ref(50)
const lightness = ref(50)
const contrast = ref(60)
const allowPolarityInversion = ref(true)
const polarityFixed = ref(false)
const polarityFrom = ref(50)

const generatedCss = computed(() => {
	return generateColorCss({
		hue: hue.value,
		selector: '.preview',
		contrast: {
			allowPolarityInversion: allowPolarityInversion.value,
			selector: '&',
		},
	})
})

const tag = useStyleTag('')

watchEffect(() => {
	if (generatedCss.value !== tag.css.value) {
		tag.css.value = generatedCss.value
	}
})

const previewStyle = computed(() => ({
	'--lightness': lightness.value,
	'--chroma': chroma.value,
	'--contrast': contrast.value,
	'--allow-polarity-inversion': allowPolarityInversion.value ? 1 : 0,
	'--polarity-from': polarityFrom.value,
}))

const previewClass = computed(() => ({
	preview: true,
	'polarity-fixed': polarityFixed.value,
}))

// Sync polarityFrom with lightness when not fixed
watch(lightness, (newLightness) => {
	if (!polarityFixed.value) {
		polarityFrom.value = newLightness
	}
})
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
					Chroma (% of max)
					<input v-model.number="chroma" type="number" min="0" max="100" step="0.1" />
					<input v-model.number="chroma" type="range" min="0" max="100" step="0.1" />
					<span class="hint">Percentage of maximum chroma available at current lightness</span>
				</label>

				<label>
					Lightness
					<input v-model.number="lightness" type="number" min="0" max="100" step="0.1" />
					<input v-model.number="lightness" type="range" min="0" max="100" step="0.1" />
				</label>

				<label>
					Contrast (signed)
					<input v-model.number="contrast" type="number" min="-108" max="108" step="0.1" />
					<input v-model.number="contrast" type="range" min="-108" max="108" step="0.1" />
					<span class="hint">Positive = light text, Negative = dark text</span>
				</label>

				<label>
					<input v-model="allowPolarityInversion" type="checkbox" />
					Allow Polarity Inversion
					<span class="hint">Fallback to opposite polarity if preferred is out of gamut</span>
				</label>

				<label>
					<input v-model="polarityFixed" type="checkbox" />
					Fix Polarity
					<span class="hint">Lock polarity decision to --polarity-from (for animations)</span>
				</label>

				<label v-if="polarityFixed">
					Polarity From
					<input v-model.number="polarityFrom" type="number" min="0" max="100" step="0.1" />
					<input v-model.number="polarityFrom" type="range" min="0" max="100" step="0.1" />
					<span class="hint">Lightness value used for polarity decision</span>
				</label>
			</div>


		</div>

		<div :class="previewClass" :style="previewStyle">
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

.controls label:has(input[type="checkbox"]) {
	flex-direction: row;
	align-items: center;
	gap: 0.5rem;
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

.controls input[type="checkbox"] {
	width: 1.25rem;
	height: 1.25rem;
	cursor: pointer;
	accent-color: #4a9eff;
}

.controls .hint {
	font-size: 0.75rem;
	color: #707070;
	font-weight: 400;
	margin-top: 0.125rem;
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
