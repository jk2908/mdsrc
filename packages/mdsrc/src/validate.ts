import {
	MODIFIER_NAMES,
	SCALAR_NAMES,
	type Entries,
	type Issue,
	type Result,
	type Schema,
} from './types.js'
import { deep, isRecord } from './utils.js'

/**
 * Check one entry against the declared schema and coerce what can be coerced
 * leave missing optional keys alone instead of treating them as errors
 * normalise dates to ISO strings for output.
 */
export function validate(input: Entries, schema: Schema) {
	// keep valid values separate so bad fields never sneak into output
	const validated: Entries = {}
	// collect every problem so one pass can report the lot
	const issues: Issue[] = []

	// bail out early if the frontmatter is not even an object
	if (typeof input !== 'object' || input === null) {
		issues.push({ message: 'Input must be an object', code: 'INVALID_INPUT' })
		return { issues } satisfies Result<Entries>
	}

	const schemaKeys = new Set(Object.keys(schema).map(k => parseKey(k).key))

	// bail out early on unknown keys
	for (const key in input) {
		if (!schemaKeys.has(key)) {
			issues.push({ message: `Unknown key: ${key}`, code: 'UNKNOWN_KEY' })
		}
	}

	// bail
	if (issues.length) return { issues } satisfies Result<Entries>

	function walk(key: string, schemaValue: Schema.Value, data: unknown) {
		const { optional, key: parsedKey } = parseKey(key)

		if (data === undefined) {
			if (!optional) {
				issues.push({
					message: `Missing required key: ${parsedKey}`,
					code: 'MISSING_REQUIRED',
				})
			}

			return
		}

		// check primitives
		if (typeof schemaValue === 'string') {
			const { types, modifiers } = parseSchemaValue(schemaValue)

			for (const spec of types) {
				const type = spec.type

				if (type === 'string') {
					if (typeof data !== 'string') {
						if (types.length === 1) {
							issues.push({
								message: `Key ${parsedKey} must be a string`,
								code: 'INVALID_TYPE',
							})
							return
						}

						continue
					}

					if (modifiers.min) {
						const min = Number(modifiers.min)

						if (Number.isNaN(min)) {
							issues.push({
								message: `Key ${parsedKey} contains a bad modifier (${modifiers.min}) that could not be converted to type (number)`,
								code: 'BAD_MODIFIER',
							})

							return
						}

						if (data.length < min) {
							if (types.length === 1) {
								issues.push({
									message: `Key ${parsedKey} must be greater than or equal to minimum length (${min})`,
									code: 'INVALID_LENGTH',
								})

								return
							}

							continue
						}
					}

					if (modifiers.max) {
						const max = Number(modifiers.max)

						if (Number.isNaN(max)) {
							issues.push({
								message: `Key ${parsedKey} contains a bad modifier (${modifiers.max}) that could not be converted to type (number)`,
								code: 'BAD_MODIFIER',
							})

							return
						}

						if (data.length > max) {
							if (types.length === 1) {
								issues.push({
									message: `Key ${parsedKey} must be less than or equal to maximum length (${max})`,
									code: 'INVALID_LENGTH',
								})

								return
							}

							continue
						}
					}

					deep(validated, parsedKey, data)
					return
				} else if (type === 'number') {
					let num = data

					if (typeof data === 'string' && !Number.isNaN(Number(data))) {
						num = Number(data)
					}

					if (typeof num !== 'number' || Number.isNaN(num)) {
						if (types.length === 1) {
							issues.push({
								message: `Key ${parsedKey} must be a number`,
								code: 'INVALID_TYPE',
							})
							return
						}

						continue
					}

					if (modifiers.min) {
						const min = Number(modifiers.min)

						if (Number.isNaN(min)) {
							issues.push({
								message: `Key ${parsedKey} contains a bad modifier (${modifiers.min}) that could not be converted to type (number)`,
								code: 'BAD_MODIFIER',
							})

							return
						}

						if (num < min) {
							if (types.length === 1) {
								issues.push({
									message: `Key ${parsedKey} must be greater than or equal to minimum size (${min})`,
									code: 'INVALID_SIZE',
								})

								return
							}

							continue
						}
					}

					if (modifiers.max) {
						const max = Number(modifiers.max)

						if (Number.isNaN(max)) {
							issues.push({
								message: `Key ${parsedKey} contains a bad modifier (${modifiers.max}) that could not be converted to type (number)`,
								code: 'BAD_MODIFIER',
							})

							return
						}

						if (num > max) {
							if (types.length === 1) {
								issues.push({
									message: `Key ${parsedKey} must be less than or equal to maximum size (${max})`,
									code: 'INVALID_SIZE',
								})

								return
							}

							continue
						}
					}

					deep(validated, parsedKey, num)
					return
				} else if (type === 'boolean') {
					let bool = data

					if (typeof data === 'string') {
						if (data.toLowerCase() === 'true') {
							bool = true
						} else if (data.toLowerCase() === 'false') {
							bool = false
						}
					}

					if (typeof bool !== 'boolean') {
						if (types.length === 1) {
							issues.push({
								message: `Key ${parsedKey} must be a boolean`,
								code: 'INVALID_TYPE',
							})
							return
						}

						continue
					}

					deep(validated, parsedKey, bool)
					return
				} else if (type === 'date') {
					let date: Date

					if (data instanceof Date) {
						date = data
					} else if (typeof data === 'string' || typeof data === 'number') {
						date = new Date(data)
					} else {
						if (types.length === 1) {
							issues.push({
								message: `Key ${parsedKey} must be a Date, string or number`,
								code: 'INVALID_TYPE',
							})
							return
						}

						continue
					}

					const dt = date.getTime()

					if (Number.isNaN(dt)) {
						if (types.length === 1) {
							issues.push({
								message: `Key ${parsedKey} must be a valid date`,
								code: 'INVALID_DATE',
							})
							return
						}

						continue
					}

					if (modifiers.min) {
						const min = new Date(Number(modifiers.min))

						if (Number.isNaN(min.getTime())) {
							issues.push({
								message: `Key ${parsedKey} contains a bad modifier (${modifiers.min}) that could not be converted to instance (Date)`,
								code: 'BAD_MODIFIER',
							})

							return
						}

						if (dt < min.getTime()) {
							if (types.length === 1) {
								issues.push({
									message: `Key ${parsedKey} must be greater than or equal to minimum date (${min.toISOString()})`,
									code: 'INVALID_DATE',
								})

								return
							}

							continue
						}
					}

					if (modifiers.max) {
						const max = new Date(Number(modifiers.max))

						if (Number.isNaN(max.getTime())) {
							issues.push({
								message: `Key ${parsedKey} contains a bad modifier (${modifiers.max}) that could not be converted to instance (Date)`,
								code: 'BAD_MODIFIER',
							})

							return
						}

						if (dt > max.getTime()) {
							if (types.length === 1) {
								issues.push({
									message: `Key ${parsedKey} must be less than or equal to maximum date (${max.toISOString()})`,
									code: 'INVALID_DATE',
								})

								return
							}

							continue
						}
					}

					deep(validated, parsedKey, date.toISOString())
					return
				} else if (type === 'array') {
					if (!Array.isArray(data)) {
						if (types.length === 1) {
							issues.push({
								message: `Key ${parsedKey} must be an array`,
								code: 'INVALID_TYPE',
							})
							return
						}

						continue
					}

					if (modifiers.min) {
						const min = Number(modifiers.min)

						if (Number.isNaN(min)) {
							issues.push({
								message: `Key ${parsedKey} contains a bad modifier (${modifiers.min}) that could not be converted to type (number)`,
								code: 'BAD_MODIFIER',
							})

							return
						}

						if (data.length < min) {
							if (types.length === 1) {
								issues.push({
									message: `Key ${parsedKey} must be greater than or equal to minimum array length (${min})`,
									code: 'INVALID_LENGTH',
								})

								return
							}

							continue
						}
					}

					if (modifiers.max) {
						const max = Number(modifiers.max)

						if (Number.isNaN(max)) {
							issues.push({
								message: `Key ${parsedKey} contains a bad modifier (${modifiers.max}) that could not be converted to type (number)`,
								code: 'BAD_MODIFIER',
							})

							return
						}

						if (data.length > max) {
							if (types.length === 1) {
								issues.push({
									message: `Key ${parsedKey} must be less than or equal to maximum array length (${max})`,
									code: 'INVALID_LENGTH',
								})

								return
							}

							continue
						}
					}

					if (spec.element.length) {
						const checked = checkSpec(spec, data, parsedKey)

						if (!checked.ok) {
							if (types.length === 1) {
								issues.push(checked.issue)
								return
							}

							continue
						}

						deep(validated, parsedKey, checked.value)
						return
					}

					deep(validated, parsedKey, data)
					return
				}
			}

			// no type matched
			issues.push({
				message: `Key ${parsedKey} must be one of: ${types.map(formatSpec).join(', ')}`,
				code: 'INVALID_TYPE',
			})
		} else {
			if (!isRecord(data)) {
				issues.push({
					message: `Key ${parsedKey} must be an object`,
					code: 'INVALID_TYPE',
				})
				return
			}

			const obj = data

			for (const subKey in schemaValue) {
				walk(`${parsedKey}.${subKey}`, schemaValue[subKey], obj[parseKey(subKey).key])
			}
		}
	}

	for (const key in schema) {
		walk(key, schema[key], input[parseKey(key).key])
	}

	// return the clean entry when validation passes, otherwise return the full
	// issue list
	return (issues.length ? { issues } : { value: validated }) satisfies Result<Entries>
}

export function parseKey(k: string) {
	const optional = k.endsWith('?')

	return {
		optional,
		key: optional ? k.slice(0, -1) : k,
	}
}

/**
 * Find a character outside any `<...>` generic, so a modifier's `=` inside an
 * element type is not mistaken for a top-level modifier.
 */
function indexOfTopLevel(value: string, target: string) {
	let depth = 0

	for (let i = 0; i < value.length; i++) {
		const char = value[i]

		if (char === '<') depth++
		else if (char === '>') depth--
		else if (char === target && depth === 0) return i
	}

	return -1
}

/**
 * Split a schema value on `|`, ignoring separators inside `<>` so an element
 * union such as `array<string|number>` stays one segment.
 */
function splitTopLevel(value: string) {
	const parts: string[] = []
	let depth = 0
	let start = 0

	for (let i = 0; i < value.length; i++) {
		const char = value[i]

		if (char === '<') depth++
		else if (char === '>') depth--
		else if (char === '|' && depth === 0) {
			parts.push(value.slice(start, i))
			start = i + 1
		}
	}

	parts.push(value.slice(start))

	return parts
}

/**
 * Parse one type expression, including generic array element types.
 *
 * `array` keeps its elements untyped. `array<T>` accepts a union of scalars or
 * nested arrays, for example `array<string>`, `array<string|number>`, and
 * `array<array<date>>`.
 */
function parseSpec(value: string): Schema.Spec {
	const generic = /^array<(.+)>$/.exec(value)

	if (generic) {
		const parts = splitTopLevel(generic[1]!)

		if (parts.some(part => part.includes('='))) {
			throw new Error('Array element types cannot take modifiers')
		}

		return { type: 'array', element: parts.map(parseSpec) }
	}

	if (value === 'array') return { type: 'array', element: [] }
	if (!isScalar(value)) throw new Error(`Unrecognised type: ${value}`)

	return { type: value }
}

export function parseSchemaValue(value: string | Schema.Value): Schema.Parsed {
	if (isRecord(value)) throw new Error('Cannot parse object schema values')

	const types: Schema.Spec[] = []
	const modifiers: Partial<Record<Schema.ModifierName, string>> = {}

	for (const part of splitTopLevel(value)) {
		const separator = indexOfTopLevel(part, '=')

		if (separator > -1) {
			const name = part.slice(0, separator)

			if (!isModifierName(name)) throw new Error(`Unrecognised modifier: ${name}`)

			modifiers[name] = part.slice(separator + 1)
		} else {
			types.push(parseSpec(part))
		}
	}

	return { types, modifiers }
}

/**
 * Render a parsed type the way it was authored, for diagnostics.
 */
function formatSpec(spec: Schema.Spec): string {
	if (spec.type !== 'array') return spec.type

	// a bare array has no element type
	const element = spec.element.map(formatSpec).join('|')

	return `array<${element || 'unknown'}>`
}

type Checked = { ok: true; value: unknown } | { ok: false; issue: Issue }

function fail(message: string, code: Issue['code'] = 'INVALID_TYPE'): Checked {
	return { ok: false, issue: { message, code } }
}

/**
 * Check a value against a union of element specs, coercing primitives the same
 * way field validation does.
 */
function checkElement(specs: Schema.Spec[], value: unknown, where: string): Checked {
	let first: Issue | undefined

	for (const spec of specs) {
		const checked = checkSpec(spec, value, where)

		if (checked.ok) return checked

		first ??= checked.issue
	}

	// a single spec keeps its more specific issue, such as a nested element path
	if (specs.length === 1 && first) return { ok: false, issue: first }

	return fail(`Key ${where} must be one of: ${specs.map(formatSpec).join(', ')}`)
}

/**
 * Check one value against one spec. Nested arrays recurse through their element
 * union so `array<array<date>>` produces ISO strings at every depth.
 */
function checkSpec(spec: Schema.Spec, value: unknown, where: string): Checked {
	switch (spec.type) {
		case 'string':
			return typeof value === 'string'
				? { ok: true, value }
				: fail(`Key ${where} must be a string`)

		case 'number': {
			const num =
				typeof value === 'string' && !Number.isNaN(Number(value)) ? Number(value) : value

			return typeof num === 'number' && !Number.isNaN(num)
				? { ok: true, value: num }
				: fail(`Key ${where} must be a number`)
		}

		case 'boolean': {
			if (typeof value === 'boolean') return { ok: true, value }

			if (typeof value === 'string') {
				if (value.toLowerCase() === 'true') return { ok: true, value: true }
				if (value.toLowerCase() === 'false') return { ok: true, value: false }
			}

			return fail(`Key ${where} must be a boolean`)
		}

		case 'date': {
			let date: Date

			if (value instanceof Date) date = value
			else if (typeof value === 'string' || typeof value === 'number')
				date = new Date(value)
			else return fail(`Key ${where} must be a Date, string or number`)

			return Number.isNaN(date.getTime())
				? fail(`Key ${where} must be a valid date`, 'INVALID_DATE')
				: { ok: true, value: date.toISOString() }
		}

		case 'array': {
			if (!Array.isArray(value)) return fail(`Key ${where} must be an array`)

			// a bare array promises nothing about its elements
			if (!spec.element.length) return { ok: true, value }

			const coerced: unknown[] = []

			for (let i = 0; i < value.length; i++) {
				const checked = checkElement(spec.element, value[i], `${where}.${i}`)

				if (!checked.ok) return checked

				coerced.push(checked.value)
			}

			return { ok: true, value: coerced }
		}
	}
}

function isModifierName(name: string): name is Schema.ModifierName {
	return MODIFIER_NAMES.some(n => n === name)
}

function isScalar(name: string): name is Schema.Scalar {
	return SCALAR_NAMES.some(n => n === name)
}
