import {
	MODIFIER_NAMES,
	PRIMITIVE_NAMES,
	type Entries,
	type Issue,
	type Result,
	type Schema,
} from './types.js'
import { deep, isRecord } from './utils.js'

/**
 * Check one entry against the declared schema and coerce what can be coerced
 * leave missing optional keys alone instead of treating them as errors
 * normalise dates to ISO strings for output
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

			for (const type of types) {
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

					deep(validated, parsedKey, data)
					return
				}
			}

			// no type matched
			issues.push({
				message: `Key ${parsedKey} must be one of: ${types.join(', ')}`,
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

function parseSchemaValue(value: Schema.Value) {
	if (isRecord(value)) throw new Error('Cannot parse object schema values')

	const parts = value.split('|')
	const types: string[] = []
	const modifiers: Partial<Record<Schema.ModifierName, string>> = {}

	for (const p of parts) {
		if (p.indexOf('=') > -1) {
			const [m, v] = p.split('=')

			if (!isModifierName(m)) throw new Error(`Unrecognised modifier: ${m}`)

			modifiers[m] = v
		} else {
			if (!isPrimitive(p)) throw new Error(`Unrecognised type: ${p}`)
			types.push(p)
		}
	}

	return { types, modifiers }
}

function isModifierName(name: string): name is Schema.ModifierName {
	return MODIFIER_NAMES.some(n => n === name)
}

function isPrimitive(name: string): name is Schema.Primitive {
	return PRIMITIVE_NAMES.some(n => n === name)
}
