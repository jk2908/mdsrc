import path from 'node:path'
import fs from 'node:fs/promises'

import type { Plugin } from 'vite'

import type {
	Entries,
	Schema,
	Collection,
	Raw,
	Types,
	Issue,
	Success,
	Result,
	BuildContext,
	PluginConfig,
} from './types'

import { PKG_NAME, GENERATED_DIR } from './config'

import { capitalise, pluralise } from './utils'
import { Logger } from './logger'

function parse(content: string) {
	const regex = /^---\r?\n([\s\S]*?)\r?\n---([\s\S]*)$/
	const match = content.match(regex)
	const metadata: Entries = {}

	if (!match) throw new Error('invalid frontmatter')

	const [, frontmatter, body] = match

	if (frontmatter) {
		for (const line of frontmatter.split('\n')) {
			const [key, value] = line.split(': ').map(str => str.trim())
			metadata[key as keyof Entries] = value
		}
	}

	return { metadata, body }
}

export async function create(dir: string, ctx: BuildContext) {
	try {
		const files = (await fs.readdir(dir)).filter(
			(file: string) => path.extname(file) === '.md',
		)

		if (!files.length) {
			console.warn(`mdsrc: ${dir} is empty`)
			return []
		}

		return Promise.all(
			files.map(async (file: string) => {
				const { metadata, body } = parse(await fs.readFile(path.join(dir, file), 'utf-8'))

				return {
					...metadata,
					__mdsrc: {
						slug: path.basename(file, '.md').toLowerCase().replace(/\s+/g, '-'),
						filename: file,
					},
					body: body.trim(),
				} satisfies Raw
			}),
		)
	} catch (err) {
		ctx.logger.error('create: failed to create entries', err)
		return []
	}
}

function validate(input: Entries, schema: Schema) {
	const validated: Entries = {}
	const issues: Issue[] = []
	const types: Success<Entries>['types'] = {}

	if (typeof input !== 'object') {
		issues.push({ message: 'Input must be an object' })
		return { issues } satisfies Result<Entries>
	}

	for (const key in schema) {
		const entry = schema[key]

		if (!entry.optional && !(key in input)) {
			issues.push({ message: `Missing required key: ${key}` })
			continue
		}

		const value = input[key]

		switch (entry.type) {
			case 'string': {
				if (typeof value !== 'string') {
					issues.push({ message: `Key ${key} must be a string` })
				} else {
					if (entry.minLength && value.length < entry.minLength) {
						issues.push({
							message: `Key ${key} must be at least ${entry.minLength} characters`,
						})
					}

					if (entry.maxLength && value.length > entry.maxLength) {
						issues.push({
							message: `Key ${key} must be at most ${entry.maxLength} characters`,
						})
					}

					validated[key] = value
					types[key] = entry.type
				}

				break
			}
			case 'number': {
				let num = value

				if (typeof value === 'string' && !Number.isNaN(Number(value))) {
					num = Number(value)
				}

				if (typeof num !== 'number') {
					issues.push({ message: `Key ${key} must be a number` })
				} else {
					validated[key] = num
					types[key] = entry.type
				}

				break
			}
			case 'boolean': {
				let bool = value
				if (typeof value === 'string') {
					if (value.toLowerCase() === 'true') {
						bool = true
					} else if (value.toLowerCase() === 'false') {
						bool = false
					}
				}

				if (typeof bool !== 'boolean') {
					issues.push({ message: `Key ${key} must be a boolean` })
				} else {
					validated[key] = bool
					types[key] = entry.type
				}

				break
			}
			case 'date': {
				if (typeof value !== 'string') {
					issues.push({ message: `Key ${key} must be a date` })
				} else {
					const date = new Date(value)

					if (Number.isNaN(date.getTime())) {
						issues.push({ message: `Key ${key} must be a valid date` })
					} else {
						validated[key] = date.toISOString()
						types[key] = 'string'
					}
				}

				break
			}
		}
	}

	return (
		issues.length ? { issues } : { value: validated, types }
	) satisfies Result<Entries>
}

const DEFAULT_CONFIG = {
	logger: {
		level: Bun.env.PROD ? 'error' : 'debug',
	},
} as const satisfies Partial<PluginConfig>

export default function plugin(src: Collection[], c?: PluginConfig): Plugin {
	const config = { ...DEFAULT_CONFIG, ...c }
	const logger = new Logger(config.logger.level)

	const outDir = path.join(process.cwd(), GENERATED_DIR)

	const buildCtx = {
		logger,
	} satisfies BuildContext

	const collections: Record<
		string,
		{
			items: Raw[]
			types: Types
			schema: Schema
		}
	> = {}

	let names: string[] = []

	return {
		name: 'mdsrc',
		enforce: 'pre',
		async buildStart() {
			try {
				await fs.mkdir(outDir, { recursive: true })

				for (const collection of src) {
					const raw = await create(path.join(process.cwd(), collection.dir), buildCtx)
					let types: Types = {}

					const validated = await Promise.all(
						raw.map(async item => {
							try {
								const { body, __mdsrc, ...metadata } = item
								const res = validate(metadata, collection.schema)

								if (res.issues) throw new Error(JSON.stringify(res.issues, null, 2))
								if (res.types) types = { ...types, ...res.types }

								return {
									body,
									...(res.value ?? {}),
									__mdsrc,
								}
							} catch (err) {
								logger.error(
									`buildStart: failed to validate item in ${collection.name}`,
									err,
								)
								return null
							}
						}),
					)

					collections[collection.name] = {
						items: validated.filter(e => e !== null),
						types,
						schema: collection.schema,
					}
				}

				names = Object.keys(collections)
				const promises = []

				promises.push(
					fs.writeFile(
						path.join(outDir, 'types.ts'),
						`
							${names
								.map(
									name => `
										export type ${capitalise(name)} = {
											body?: string
											${Object.entries(collections[name].types)
												.map(([key, type]) => `${key}: ${type}`)
												.join('\n  ')}
											__mdsrc: {
												slug: string
												filename: string
											},
										}
									`,
								)
								.join('\n\n')}`.trim(),
					),
				)

				promises.push(
					fs.writeFile(
						path.join(outDir, 'index.d.ts'),
						`	
							import type { ${names.map(name => capitalise(name)).join(', ')} } from './types'

							declare module '${PKG_NAME}' {
								${names
									.map(
										name => `
											export const all${capitalise(pluralise(name, 2))}: ${capitalise(name)}[]
										`,
									)
									.join('\n\n')}
							}
						`.trim(),
					),
				)

				for (const name of names) {
					const collection = collections[name]?.items

					promises.push(
						fs.writeFile(
							path.join(outDir, `${name}.js`),
							`export const all${capitalise(pluralise(name, 2))} = ${collection?.length ? JSON.stringify(collection) : '[]'}`.trim(),
						),
					)
				}

				promises.push(
					fs.writeFile(
						path.join(outDir, 'index.js'),
						names.map(name => `export * from './${name}.js'`).join('\n'),
					),
				)

				await Promise.all(promises)
			} catch (err) {
				logger.error('buildStart: failed to generate data', err)
			}
		},
		resolveId(id) {
			if (id === PKG_NAME) {
				return path.join(outDir, 'index.js')
			}

			if (id.startsWith(`${PKG_NAME}/`)) {
				const subpath = id.slice(PKG_NAME.length + 1)

				if (names.some(name => name === subpath)) {
					return path.join(outDir, `${subpath}.js`)
				}
			}

			return null
		},
	}
}
