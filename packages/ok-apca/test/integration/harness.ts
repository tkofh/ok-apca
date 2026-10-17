/**
 * Shared test harness for browser integration tests.
 */

import Color from 'colorjs.io'
import { type ColorSetOptions, defineColors } from '../../src/index.ts'
import { toArray } from '../../src/util.ts'

export type TestHarness = ReturnType<typeof createTestHarness>

interface TestHarnessConfig {
	/** Options for defineColors. Roles and hues will be auto-populated if not provided. */
	options: Omit<ColorSetOptions, 'hues' | 'roles'> & {
		hues?: ColorSetOptions['hues']
		roles?: ColorSetOptions['roles']
	}
	/** The hue angle to use for the test element. @default 180 */
	hue?: number
}

/**
 * Creates a test harness for a given color system configuration.
 * Handles CSS injection and element creation/cleanup.
 *
 * By default, creates a single active "fill" role with a "text" contrast target.
 * The test element gets the hue class and the first active role class.
 */
export function createTestHarness(config: TestHarnessConfig) {
	const hue = config.hue ?? 180
	const name = config.options.prefix ?? 'color'

	// Default roles: a single "fill" role (which defaults its class to "fill")
	// If the caller provided roles, use those
	const roles = toArray(config.options.roles ?? [{ name: 'fill' }])

	// Derive the hue class from the first active role's class name.
	const firstActiveRole = roles.find((r) => !r.passive)
	const roleClass =
		(firstActiveRole && !firstActiveRole.passive && firstActiveRole.className) ||
		firstActiveRole?.name ||
		'fill'
	const hueClass = `${roleClass}--hue`

	const { css } = defineColors({
		...config.options,
		roles,
		hues: config.options.hues ?? [{ name: 'test', hue, className: hueClass }],
	})

	const styleElement = document.createElement('style')
	styleElement.textContent = css
	document.head.appendChild(styleElement)

	const testElement = document.createElement('div')
	// Apply both role class and hue class to the same element
	testElement.className = `${roleClass} ${hueClass}`
	testElement.style.width = '100px'
	testElement.style.height = '100px'
	document.body.appendChild(testElement)

	const getColor = (roleName?: string) => {
		const prop = roleName ? `--${name}-${roleName}` : `--${name}-${firstActiveRole?.name ?? 'fill'}`
		const colorStr = getComputedStyle(testElement).getPropertyValue(prop).trim()
		return new Color(colorStr)
	}

	const setVar = (varName: string, value: string | number) => {
		testElement.style.setProperty(`--${varName}`, String(value))
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
export function cleanupAll(selector = '.fill') {
	for (const el of Array.from(document.querySelectorAll(selector))) {
		el.remove()
	}
	for (const el of Array.from(document.querySelectorAll('style'))) {
		el.remove()
	}
}
