/**
 * Shared test harness for browser integration tests.
 */

import Color from 'colorjs.io'
import { defineHue } from '../../src/index.ts'
import type { HueOptions } from '../../src/types.ts'

export type TestHarness = ReturnType<typeof createTestHarness>

/**
 * Creates a test harness for a given hue configuration.
 * Handles CSS injection and element creation/cleanup.
 */
export function createTestHarness(config: HueOptions) {
	const { css } = defineHue(config)
	const output = config.output ?? 'color'

	const styleElement = document.createElement('style')
	styleElement.textContent = css
	document.head.appendChild(styleElement)

	const testElement = document.createElement('div')
	testElement.className = config.selector.replace(/^\./, '')
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
