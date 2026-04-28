import { realpathSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { Plugin, ViteDevServer } from 'vite'

import type {
	BuildContext,
	Collection,
	Entries,
	Issue,
	Raw,
	Result,
	Schema,
} from './types.js'
import { GENERATED_DIR, PKG_NAME } from './config.js'
import { Logger } from './logger.js'
import { capitalise, debounce, pluralise } from './utils.js'

const fileCache = new Map<string, string>()

function toModuleName(name: string) {
	return name.toLowerCase()
}

/**
 * Split a markdown file into frontmatter data and the body content
 * keep the format small so the parser stays easy to trust
 * fail fast if the opening fence is missing
 */
function parse(content: string) {
	// look for one fenced frontmatter block right at the top
	// leave the rest of the markdown body alone
	const regex = /^---\r?\n([\s\S]*?)\r?\n---([\s\S]*)$/
	const match = content.match(regex)
	const metadata: Entries = {}

	if (!match) throw new Error('invalid frontmatter')

	const [, frontmatter, body] = match

	if (frontmatter) {
		// treat each line as a simple key: value pair
		// this is a small subset, not full yaml
		for (const line of frontmatter.split('\n')) {
			const [key, value] = line.split(': ').map(str => str.trim())
			metadata[key as keyof Entries] = value
		}
	}

	return { metadata, body }
}

/**
 * Read every markdown file in a collection and turn it into the raw entry shape
 * add mdsrc metadata like slug and filename alongside the trimmed body
 * return an empty list if the directory read fails
 */
export async function create(dir: string, buildContext: BuildContext) {
	const { logger } = buildContext

	try {
		// only pick up markdown files from this directory
		// leave everything else alone
		const files = (await fs.readdir(dir)).filter(
			(file: string) => path.extname(file) === '.md',
		)
		const filePaths = files.map(file => path.join(dir, file))

		if (!files.length) {
			console.warn(`mdsrc: ${dir} is empty`)
			return []
		}

		return Promise.all(
			filePaths.map(async filePath => {
				const file = path.basename(filePath)

				// keep the parsed fields, body, and mdsrc metadata together
				// build the slug from the filename
				const { metadata, body } = parse(await fs.readFile(filePath, 'utf-8'))

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
		logger.error('[create]: failed to create entries', err)
		return []
	}
}

/**
 * Write a file only if the content has changed since the last build
 */
async function maybeWrite(filePath: string, content: string) {
	const cached = fileCache.get(filePath)

	if (cached === content) {
		try {
			await fs.access(filePath)
			return false
		} catch (err) {
			if (!(err instanceof Error) || !('code' in err) || err.code !== 'ENOENT') {
				throw err
			}

			// file was deleted since the last build, fall through and write it again
		}
	}

	if (cached === undefined) {
		try {
			const current = await fs.readFile(filePath, 'utf-8')
			fileCache.set(filePath, current)

			if (current === content) {
				fileCache.set(filePath, content)
				return false
			}
		} catch (err) {
			if (!(err instanceof Error) || !('code' in err) || err.code !== 'ENOENT') {
				throw err
			}
		}
	}

	// file is new or changed since the last build, write it and refresh the cache
	await fs.writeFile(filePath, content)
	fileCache.set(filePath, content)

	return true
}

/**
 * Check one entry against the declared schema and coerce what can be coerced
 * leave missing optional keys alone instead of treating them as errors
 * normalise dates to iso strings for output
 */
function validate(input: Entries, schema: Schema) {
	// keep valid values separate so bad fields never sneak into output
	const validated: Entries = {}
	// collect every problem so one pass can report the lot
	const issues: Issue[] = []

	// bail out early if the frontmatter is not even an object
	if (typeof input !== 'object' || input === null) {
		issues.push({ message: 'Input must be an object' })
		return { issues } satisfies Result<Entries>
	}

	// drive validation from the schema so the rules always stay in charge
	for (const key in schema) {
		const entry = schema[key]

		// if the key is missing, only complain when the schema says it must exist
		if (!(key in input)) {
			if (!entry.optional) {
				issues.push({ message: `Missing required key: ${key}` })
			}

			continue
		}

		// once the key exists, coerce it into the shape the schema expects
		const value = input[key]

		switch (entry.type) {
			case 'string': {
				// strings just need the basic type check and any length limits
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
				}

				break
			}
			case 'number': {
				let num = value

				// frontmatter usually starts life as text, so numeric strings still count
				if (typeof value === 'string' && !Number.isNaN(Number(value))) {
					num = Number(value)
				}

				if (typeof num !== 'number') {
					issues.push({ message: `Key ${key} must be a number` })
				} else {
					validated[key] = num
				}

				break
			}
			case 'boolean': {
				let bool = value
				// booleans often come through as the words true or false
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
				}

				break
			}
			case 'date': {
				// keep dates as iso strings because that is what generated output exposes
				if (typeof value !== 'string') {
					issues.push({ message: `Key ${key} must be a date` })
				} else {
					const date = new Date(value)

					if (Number.isNaN(date.getTime())) {
						issues.push({ message: `Key ${key} must be a valid date` })
					} else {
						validated[key] = date.toISOString()
					}
				}

				break
			}
		}
	}

	// hand back the clean entry when validation passes
	// otherwise return the full issue list
	return (issues.length ? { issues } : { value: validated }) satisfies Result<Entries>
}

async function build(src: Collection[], buildContext: BuildContext) {
	const { logger, outDir } = buildContext
	let names: string[] = []

	// keep each validated collection beside its schema so emit stays in sync
	const collections: Record<
		string,
		{
			items: Raw[]
			schema: Schema
		}
	> = {}

	try {
		if (!outDir) throw new Error('Output directory is not defined')

		// make sure the output directory exists before the writes begin
		// that way the emit step can stay simple
		await fs.mkdir(outDir, { recursive: true })

		// read and validate every collection before writing anything out
		// this keeps the js and dts outputs in step
		for (const collection of src) {
			const raw = await create(path.join(process.cwd(), collection.dir), buildContext)

			// check each raw item before it makes it into the generated collection
			// bad entries get logged and dropped
			const validated = await Promise.all(
				raw.map(async item => {
					try {
						const { body, __mdsrc, ...metadata } = item
						const res = validate(metadata, collection.schema)

						if (res.issues) throw new Error(JSON.stringify(res.issues, null, 2))

						return {
							body,
							...res.value,
							__mdsrc,
						}
					} catch (err) {
						logger.error(
							`[buildStart]: failed to validate item in ${collection.name}`,
							err,
						)
						return null
					}
				}),
			)

			collections[collection.name] = {
				// keep the cleaned items with the schema they came from
				// both js and dts generation read from this shape
				items: validated.filter(e => e !== null),
				schema: collection.schema,
			}
		}

		// take the collection names after validation has settled
		// every generated file then works from the same list
		names = Object.keys(collections)
		// queue the file writes first so the emit phase can run together
		// wait for them once every output is ready
		const promises = []

		// build the type file from the schema rather than the observed data
		// that keeps optional fields and date output honest
		promises.push(
			maybeWrite(
				path.join(outDir, 'types.ts'),
				`
					${names
						// make one named type per collection so the dts mirrors the js surface.
						// Body stays optional because an entry can still be mostly metadata
						.map(
							name => `
								export type ${capitalise(name)} = {
									body?: string
									${Object.entries(collections[name].schema)
										// turn each schema field into a ts property line
										// keep optional markers and date strings in step with validation
										.map(
											([key, entry]) =>
												`${key}${entry.optional ? '?' : ''}: ${entry.type === 'date' ? 'string' : entry.type}`,
										)
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

		// write the package surface separately so consumers get typed named exports
		// this mirrors the generated js entry file
		promises.push(
			maybeWrite(
				path.join(outDir, 'index.d.ts'),
				`	
					import type { ${names.map(name => capitalise(name)).join(', ')} } from './types.js'

					${names
						.map(
							name => `
								export const all${capitalise(pluralise(name, 2))}: ${capitalise(name)}[]
							`,
						)
						.join('\n\n')}

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

		// serialise each validated collection as a plain module for vite to load
		// empty collections still export a stable array shape
		for (const name of names) {
			const collection = collections[name]?.items
			const fileName = toModuleName(name)

			promises.push(
				maybeWrite(
					path.join(outDir, `${fileName}.js`),
					`export const all${capitalise(pluralise(name, 2))} = ${collection?.length ? JSON.stringify(collection) : '[]'}`.trim(),
				),
			)
		}

		// stitch the per-collection modules into the public js entrypoint
		// this is the file the root package import resolves to
		promises.push(
			maybeWrite(
				path.join(outDir, 'index.js'),
				names.map(name => `export * from './${toModuleName(name)}.js'`).join('\n'),
			),
		)

		// flush every generated artifact once all the content is ready
		// let any failed write fail the build
		const writes = await Promise.all(promises)
		buildContext.names = names

		return writes.some(changed => changed)
	} catch (err) {
		logger.error('[build]: failed to generate data', err)
		throw err
	}
}

// convert watcher paths to a consistent slash format before comparing them
const normaliseWatchPath = (p: string) => p.replace(/\\/g, '/')

/**
 * Build the vite plugin that validates collections and writes the generated modules
 * keep the runtime data and declaration files in the same pass
 * resolve package imports from the generated directory
 */
export default function plugin(src: Collection[]): Plugin {
	// use one logger for the whole build so every step reports the same way
	// stay chatty outside production
	const logger = new Logger(process.env.NODE_ENV === 'production' ? 'error' : 'debug')

	// write generated files into a hidden folder at the project root
	// keep the generated surface out of src
	const outDir = path.join(process.cwd(), GENERATED_DIR)
	const watchRoot = normaliseWatchPath(realpathSync.native(process.cwd()))
	const watchedRoots = src.map(c => `${normaliseWatchPath(path.join(watchRoot, c.dir))}/`)

	// watcher events can arrive through symlinked paths like /var while cwd has
	// already resolved to /private/var, so canonicalise the parent dir once and
	// reattach the file name for stable prefix checks
	const resolveWatchFile = (filePath: string) => {
		const absolutePath = path.resolve(watchRoot, filePath)
		const parentPath = path.dirname(absolutePath)

		try {
			const resolvedParentPath = normaliseWatchPath(realpathSync.native(parentPath))
			return normaliseWatchPath(
				path.join(resolvedParentPath, path.basename(absolutePath)),
			)
		} catch {
			return normaliseWatchPath(absolutePath)
		}
	}

	const isWatchedFile = (filePath: string) =>
		watchedRoots.some(root => resolveWatchFile(filePath).startsWith(root))

	// pass shared build tools into helpers without dragging lots of state around
	// keep the helper signatures small
	const buildContext = {
		logger,
		outDir,
		names: [],
	} satisfies BuildContext

	let rebuildRunning = false
	let rebuildQueued = false
	let rebuildReason = 'change'

	const rebuild = debounce((event: string, filePath: string) => {
		const queue = () => {
			void (async () => {
				// collapse bursts of file events into one active rebuild plus a single
				// queued rerun when changes land mid-build
				if (rebuildRunning) {
					rebuildQueued = true
					return
				}

				rebuildRunning = true

				do {
					rebuildQueued = false

					try {
						const changed = await build(src, buildContext)

						if (changed) logger.info(`[watch]: content rebuilt (${rebuildReason})`)
					} catch (err) {
						logger.error('[watch] content rebuild failed', err)
					}
				} while (rebuildQueued)

				rebuildRunning = false
			})()
		}

		// ignore anything outside the watched content dirs
		if (!isWatchedFile(filePath)) return

		const file = resolveWatchFile(filePath)

		rebuildReason = `${event}: ${path.relative(watchRoot, file)}`
		queue()
	}, 75)

	return {
		name: 'mdsrc',
		enforce: 'pre',
		config(viteConfig) {
			viteConfig.optimizeDeps ??= {}
			viteConfig.optimizeDeps.exclude = [
				...new Set([...(viteConfig.optimizeDeps.exclude ?? []), PKG_NAME]),
			]

			viteConfig.resolve ??= {}

			if (Array.isArray(viteConfig.resolve.alias)) {
				viteConfig.resolve.alias = [
					...viteConfig.resolve.alias,
					{
						find: PKG_NAME,
						replacement: path.join(outDir, 'index.js'),
					},
				]
			} else {
				viteConfig.resolve.alias = {
					...viteConfig.resolve.alias,
					[PKG_NAME]: path.join(outDir, 'index.js'),
				}
			}
		},
		async buildStart() {
			await build(src, buildContext)
		},
		configureServer(server: ViteDevServer) {
			logger.info(
				`[configureServer]: Watching for changes in ./${src.map(c => c.dir).join(', ')}...`,
			)

			server.watcher
				.on('add', (p: string) => rebuild('add', p))
				.on('change', (p: string) => rebuild('change', p))
				.on('unlink', (p: string) => rebuild('unlink', p))
		},
		resolveId(id) {
			// point imports at generated files rather than source files
			// that makes the package behave like a normal module
			if (id === PKG_NAME) {
				return path.join(outDir, 'index.js')
			}

			if (id.startsWith(`${PKG_NAME}/`)) {
				// allow collection subpath imports once the build knows their names
				// leave unknown subpaths unresolved
				const subpath = id.slice(PKG_NAME.length + 1)
				const match = buildContext.names.find(
					name => name === subpath || toModuleName(name) === subpath,
				)

				if (match) {
					return path.join(outDir, `${toModuleName(match)}.js`)
				}
			}

			return null
		},
	}
}
