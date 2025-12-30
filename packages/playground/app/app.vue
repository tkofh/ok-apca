<script setup lang="ts">
import { generateColorCss } from 'ok-apca'

const route = useRoute()
const router = useRouter()

const state = reactive({
	hue: 240,
	chroma: 50,
	lightness: 50,
	contrast: 60,
	allowPolarityInversion: true,
})

// Apply query string values
for (const key of ['hue', 'chroma', 'lightness', 'contrast'] as const) {
	if (typeof route.query[key] === 'string') {
	const num = Number.parseFloat(route.query[key])
		if (!Number.isNaN(num)) {
			state[key] = num
		}
	}
}
if (typeof route.query.allowPolarityInversion === 'string') {
	state.allowPolarityInversion = route.query.allowPolarityInversion === 'true' || route.query.allowPolarityInversion === '1'
}

// Clear query string after reading initial values
onMounted(() => {
	if (Object.keys(route.query).length > 0) {
		router.replace({ query: {} })
	}
})

const generatedCss = computed(() => {
	return generateColorCss({
		hue: state.hue,
		selector: '.preview',
		contrastColors: [{ label: 'text' }],
	})
})

useHead({
  style: [
    {
      id: 'preview-css',
      innerHTML: generatedCss,
    }
  ]
})

const previewStyle = computed(() => ({
	'--lightness': state.lightness,
	'--chroma': state.chroma,
	'--contrast-text': state.contrast,
	'--allow-polarity-inversion-text': state.allowPolarityInversion ? 1 : 0,
}))
</script>

<template>
	<div class="playground">
		<div class="sidebar">
			<div class="controls">
				<label>
					Hue
					<input v-model.number="state.hue" type="number" min="0" max="360" step="0.1" />
					<input v-model.number="state.hue" type="range" min="0" max="360" step="0.1" />
				</label>

				<label>
					Chroma (% of max)
					<input v-model.number="state.chroma" type="number" min="0" max="100" step="0.1" />
					<input v-model.number="state.chroma" type="range" min="0" max="100" step="0.1" />
					<span class="hint">Percentage of maximum chroma available at current lightness</span>
				</label>

				<label>
					Lightness
					<input v-model.number="state.lightness" type="number" min="0" max="100" step="0.1" />
					<input v-model.number="state.lightness" type="range" min="0" max="100" step="0.1" />
				</label>

				<label>
					Contrast (signed)
					<input v-model.number="state.contrast" type="number" min="-108" max="108" step="0.1" />
					<input v-model.number="state.contrast" type="range" min="-108" max="108" step="0.1" />
					<span class="hint">Positive = light text, Negative = dark text</span>
				</label>

				<label>
					<input v-model="state.allowPolarityInversion" type="checkbox" />
					Allow Polarity Inversion
					<span class="hint">Fallback to opposite polarity if preferred is out of gamut</span>
				</label>
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
	align-items: start;
}

.sidebar {
	display: flex;
	flex-direction: column;
	gap: 2rem;
	max-height: calc(100vh - 4rem);
	overflow-y: auto;
	overflow-x: hidden;
	padding-right: 0.5rem;
}

.sidebar::-webkit-scrollbar {
	width: 8px;
}

.sidebar::-webkit-scrollbar-track {
	background: #2a2a2a;
	border-radius: 4px;
}

.sidebar::-webkit-scrollbar-thumb {
	background: #4a4a4a;
	border-radius: 4px;
}

.sidebar::-webkit-scrollbar-thumb:hover {
	background: #5a5a5a;
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
	position: sticky;
	top: 2rem;
}

.preview-text {
	color: var(--o-color-text);
	font-size: 2rem;
	font-weight: 600;
}
</style>
