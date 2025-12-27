/**
 * Shared type definitions for ok-apca.
 */

interface ContrastColorDefinition {
	readonly label: string
}

export interface ColorGeneratorOptions {
	readonly hue: number
	readonly selector: string
	readonly contrastColors?: readonly ContrastColorDefinition[]
	readonly prefix?: string
}

export interface GamutBoundary {
	readonly lMax: number
	readonly cPeak: number
}

export function validateLabel(label: string): void {
	const labelRegex = /^[a-z][a-z0-9_-]*$/i
	if (!labelRegex.test(label)) {
		throw new Error(
			`Invalid contrast color label '${label}'. Labels must start with a letter and contain only letters, numbers, hyphens, and underscores.`,
		)
	}
}

export function validateUniqueLabels(labels: readonly string[]): void {
	const seen = new Set<string>()
	for (const label of labels) {
		if (seen.has(label)) {
			throw new Error(
				`Duplicate contrast color label '${label}'. Each contrast color must have a unique label.`,
			)
		}
		seen.add(label)
	}
}
