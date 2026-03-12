/**
 * Shared test harness for browser integration tests.
 */

import Color from 'colorjs.io'
import { type DefineColorsOptions, defineColors } from '../../src/index.ts'

export type TestHarness = ReturnType<typeof createTestHarness>

interface TestHarnessConfig {
	/** Options for defineColors. baseSelector and hues will be auto-populated if not provided. */
	options: Omit<DefineColorsOptions, 'baseSelector' | 'hues'> & {
		baseSelector?: string
		hues?: DefineColorsOptions['hues']
	}
	/** The hue angle to use for the test element. @default 180 */
	hue?: number
}

/**
 * Creates a test harness for a given color system configuration.
 * Handles CSS injection and element creation/cleanup.
 */
export function createTestHarness(config: TestHarnessConfig) {
	const hue = config.hue ?? 180
	const baseSelector = config.options.baseSelector ?? '.test-element'
	const hueSelector = `${baseSelector}--hue`
	const output = config.options.output ?? 'color'

	const { css } = defineColors({
		...config.options,
		baseSelector,
		hues: config.options.hues ?? [{ name: 'test', hue, selector: hueSelector }],
	})

	const styleElement = document.createElement('style')
	styleElement.textContent = css
	document.head.appendChild(styleElement)

	const testElement = document.createElement('div')
	// Apply both base and hue class to the same element
	const baseClass = baseSelector.replace(/^\./, '')
	const hueClass = hueSelector.replace(/^\./, '')
	testElement.className = `${baseClass} ${hueClass}`
	testElement.style.width = '100px'
	testElement.style.height = '100px'
	document.body.appendChild(testElement)

	const getColor = (suffix?: string) => {
		const prop = suffix ? `--${output}-${suffix}` : `--${output}`
		const colorStr = getComputedStyle(testElement).getPropertyValue(prop).trim()
		return new Color(colorStr)
	}

	const setVar = (name: string, value: string | number) => {
		testElement.style.setProperty(`--${name}`, String(value))
	}

	const cleanup = () => {
		styleElement.remove()
		testElement.remove()
	}

	return { testElement, getColor, setVar, cleanup, css }
}

/**
 * Removes all test elements and styles from the document.
 */
export function cleanupAll(selector = '.test-element') {
	for (const el of Array.from(document.querySelectorAll(selector))) {
		el.remove()
	}
	for (const el of Array.from(document.querySelectorAll('style'))) {
		el.remove()
	}
}
