import { defineConfig } from 'tsdown/config'

export default defineConfig({
	entry: ['src/index.ts'],
	format: ['esm'],
	dts: {
	  sourcemap: true
	},
	clean: true,
	minify: false,
	platform: 'neutral',
	sourcemap: true,
	treeshake: true,
})
