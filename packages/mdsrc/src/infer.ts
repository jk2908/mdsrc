import type { Schema } from './types.js'
import { isRecord } from './utils.js'
import { parseKey, parseSchemaValue } from './validate.js'

/**
 * Wrap an element type as an array type, parenthesising unions so
 * `string | number` becomes `(string | number)[]`.
 */
export function wrapArray(element: string) {
	return element.includes(' | ') ? `(${element})[]` : `${element}[]`
}

/**
 * Infer the element type of a value found in frontmatter.
 *
 * Types are kept conservative: objects become `Record<string, unknown>` rather
 * than guessed shapes, and nested arrays are inferred recursively.
 */
function inferType(value: unknown): string {
	if (value === null) return 'null'

	switch (typeof value) {
		case 'string':
			return 'string'
		case 'number':
			return 'number'
		case 'boolean':
			return 'boolean'
		case 'bigint':
			return 'bigint'
		case 'undefined':
			return 'undefined'
		case 'object': {
			if (!Array.isArray(value)) return 'Record<string, unknown>'

			const elements = new Set(value.map(inferType))
			const element = elements.size ? [...elements].toSorted().join(' | ') : 'unknown'

			return wrapArray(element)
		}
		default:
			return 'unknown'
	}
}

/**
 * Collect observed element types for every bare `array` in a schema.
 *
 * Returns a map of schema path (`tags`, `metadata.links`) to the union of the
 * element types found across `items`. Paths with no observed arrays are absent,
 * so codegen falls back to `unknown[]`.
 */
export function inferArrayTypes(schema: Schema, items: unknown[]) {
	const observed = new Map<string, Set<string>>()

	collect(schema, '', items, observed)

	const inferred = new Map<string, string>()

	for (const [path, types] of observed) {
		if (!types.size) continue

		inferred.set(path, [...types].toSorted().join(' | '))
	}

	return inferred
}

function collect(
	schema: Schema,
	prefix: string,
	items: unknown[],
	observed: Map<string, Set<string>>,
) {
	for (const [rawKey, value] of Object.entries(schema)) {
		const { key } = parseKey(rawKey)
		const path = prefix ? `${prefix}.${key}` : key

		if (typeof value === 'string') {
			if (!hasBareArray(value)) continue

			const types = new Set<string>()

			for (const item of items) {
				if (!isRecord(item)) continue

				const field = item[key]

				if (!Array.isArray(field)) continue

				for (const element of field) types.add(inferType(element))
			}

			if (types.size) observed.set(path, types)

			continue
		}

		const nested = items
			.map(item => (isRecord(item) ? item[key] : undefined))
			.filter(isRecord)

		collect(value, path, nested, observed)
	}
}

/**
 * Whether a schema value includes an array with no declared element type.
 */
function hasBareArray(value: string) {
	return parseSchemaValue(value).types.some(
		type => type.type === 'array' && !type.element.length,
	)
}
