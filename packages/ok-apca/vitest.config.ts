import { playwright } from '@vitest/browser-playwright'
import { defineConfig } from 'vitest/config'

export default defineConfig({
	test: {
		projects: [
			{
				extends: true,
				test: {
					name: 'unit',
					include: ['test/**/*.spec.ts'],
					environment: 'node',
				},
			},
			{
				extends: true,
				test: {
					name: 'browser',
					include: ['test/**/*.browser.ts'],
					browser: {
						enabled: true,
						provider: playwright(),
						instances: [{ browser: 'chromium' }],
						headless: true,
					},
				},
			},
		],
	},
})
