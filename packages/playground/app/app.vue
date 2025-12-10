<script setup lang="ts">
import { type ContrastMode, generateColorCss } from 'ok-apca'
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
		<div class="controls">
			<label>
				Hue: {{ hue }}
				<input v-model.number="hue" type="range" min="0" max="360" />
			</label>

			<label>
				Chroma: {{ chroma }}
				<input v-model.number="chroma" type="range" min="0" max="100" />
			</label>

			<label>
				Lightness: {{ lightness }}
				<input v-model.number="lightness" type="range" min="0" max="100" />
			</label>

			<label>
				Contrast: {{ contrast }}
				<input v-model.number="contrast" type="range" min="0" max="108" />
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

		<div class="preview" :style="previewStyle">
			<span class="preview-text">Contrast Text</span>
		</div>
	</div>
</template>

<style>
.playground {
	display: grid;
	grid-template-columns: 300px 1fr;
	gap: 2rem;
	padding: 2rem;
	min-height: 100vh;
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
}

.controls select {
	padding: 0.5rem;
	font-size: 1rem;
}

.preview {
	aspect-ratio: 1;
	max-height: calc(100vh - 4rem);
	background: var(--o-color);
	display: flex;
	align-items: center;
	justify-content: center;
	border-radius: 8px;
}

.preview-text {
	color: var(--o-color-contrast);
	font-size: 2rem;
	font-weight: 600;
}
</style>
