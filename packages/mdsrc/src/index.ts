import { realpathSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { Plugin, ViteDevServer } from 'vite'

import { markdownToHtml, type CompileOptions, type MarkdownToHtmlResult } from 'satteri'

import type {
	BuildContext,
	Collection,
	Entries,
	Issue,
	PluginConfig,
	Raw,
	Result,
	Schema,
} from './types.js'
import { GENERATED_DIR, PKG_NAME } from './config.js'
import { Logger } from './logger.js'
import { capitalise, debounce, deep, isRecord, pluralise } from './utils.js'

export const DEFAULT_COMPILE_OPTIONS = {
	features: {
		frontmatter: true,
	},
} satisfies CompileOptions

export type { CompileOptions } from './types.js'

/**
 * Parse YAML or TOML frontmatter
 */
export async function parse(frontmatter: MarkdownToHtmlResult['frontmatter']) {
	if (!frontmatter) return {}

	const { kind, value } = frontmatter

	switch (kind) {
		case 'yaml': {
			return (await import('yaml')).parse(value)
		}
		case 'toml': {
			return (await import('smol-toml')).parse(value)
		}
	}
}

/**
 * Read every markdown file in a collection and turn it into the raw entry shape
 * add mdsrc metadata like slug and filename alongside the trimmed body
 * return an empty list if the directory read fails
 */
export async function create(dir: string, buildContext: BuildContext) {
	const { logger, compileOptions = {} } = buildContext
	const { features, ...restCompileOptions } = compileOptions

	try {
		// only pick up markdown files from this directory
		// leave everything else alone
		const files = (await fs.readdir(dir)).filter(
			(file: string) => path.extname(file) === '.md',
		)
		const filePaths = files.map(file => path.join(dir, file))

		if (!files.length) {
			logger.warn(`mdsrc: ${dir} is empty`)
			return []
		}

		return Promise.all(
			filePaths.map(async filePath => {
				const file = path.basename(filePath)

				const { html, frontmatter: rawFrontmatter } = markdownToHtml(
					await fs.readFile(filePath, 'utf-8'),
					{
						features: {
							...DEFAULT_COMPILE_OPTIONS.features,
							...features,
						},
						...restCompileOptions,
					},
				)

				const frontmatter = await parse(rawFrontmatter)

				return {
					...frontmatter,
					__mdsrc: {
						slug: path.basename(file, '.md').toLowerCase().replace(/\s+/g, '-'),
						filename: file,
					},
					body: html.trim(),
				} satisfies Raw
			}),
		)
	} catch (err) {
		logger.error('[create]: failed to create entries', err)
		throw err
	}
}

/**
 * Returns whether the error was caused by a missing file or directory
 */
export function isENOENT(err: unknown) {
	return err instanceof Error && 'code' in err && err.code === 'ENOENT'
}

/**
 * LRU cache for file content. Stores the last written content per file path
 * so `maybeWrite` can skip disk I/O when nothing has changed.
 *
 * Uses Map insertion order to track recency: the front of the map holds the
 * least recently used entries, which are evicted first when the cache is full.
 */
export const fileCache = new Map<string, string>()

export const FILE_CACHE_MAX_SIZE = 100

/**
 * Promote an existing cache entry to most-recently-used by deleting and
 * re-inserting it, which moves it to the end of the Map's iteration
 * order. If the cache is at capacity, evict the least recently used
 * entry (front) before inserting
 */
export function setFileCache(filePath: string, content: string) {
	fileCache.delete(filePath)

	if (fileCache.size >= FILE_CACHE_MAX_SIZE) {
		const lru = fileCache.keys().next().value

		if (lru !== undefined) {
			fileCache.delete(lru)
		}
	}

	fileCache.set(filePath, content)
}

/**
 * Retrieve a cached value and promote it to most-recently-used so it won't
 * be evicted while still actively referenced
 */
export function getFileCache(filePath: string) {
	const content = fileCache.get(filePath)

	if (content !== undefined) {
		setFileCache(filePath, content)
	}

	return content
}

/**
 * Write a file only if the content has changed since the last build
 */
export async function maybeWrite(filePath: string, content: string) {
	const cached = getFileCache(filePath)

	if (cached !== content) {
		// cache says content changed, write without reading
		await fs.writeFile(filePath, content)
		setFileCache(filePath, content)

		return true
	}

	// cache miss or cache hit with same content — verify on disk
	try {
		if ((await fs.readFile(filePath, 'utf-8')) === content) {
			setFileCache(filePath, content)
			return false
		}
	} catch (err) {
		if (!isENOENT(err)) throw err
	}

	await fs.writeFile(filePath, content)
	setFileCache(filePath, content)

	return true
}

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
			switch (schemaValue) {
				case 'string': {
					if (typeof data !== 'string') {
						issues.push({
							message: `Key ${parsedKey} must be a string`,
							code: 'INVALID_TYPE',
						})
						return
					}

					deep(validated, parsedKey, data)
					break
				}

				case 'number': {
					let num = data

					if (typeof data === 'string' && !Number.isNaN(Number(data))) {
						num = Number(data)
					}

					if (typeof num !== 'number' || Number.isNaN(num)) {
						issues.push({
							message: `Key ${parsedKey} must be a number`,
							code: 'INVALID_TYPE',
						})
						return
					}

					deep(validated, parsedKey, num)
					break
				}

				case 'boolean': {
					let bool = data

					if (typeof data === 'string') {
						if (data.toLowerCase() === 'true') {
							bool = true
						} else if (data.toLowerCase() === 'false') {
							bool = false
						}
					}

					if (typeof bool !== 'boolean') {
						issues.push({
							message: `Key ${parsedKey} must be a boolean`,
							code: 'INVALID_TYPE',
						})
						return
					}

					deep(validated, parsedKey, bool)
					break
				}

				case 'date': {
					let date: Date

					if (data instanceof Date) {
						date = data
					} else if (typeof data === 'string' || typeof data === 'number') {
						date = new Date(data)
					} else {
						issues.push({
							message: `Key ${parsedKey} must be a Date, string or number`,
							code: 'INVALID_TYPE',
						})
						return
					}

					if (Number.isNaN(date.getTime())) {
						issues.push({
							message: `Key ${parsedKey} must be a valid date`,
							code: 'INVALID_DATE',
						})
						return
					}

					deep(validated, parsedKey, date.toISOString())
					break
				}
			}
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

export function schemaToType(schema: Schema) {
	const fields = Object.entries(schema)
		.map(([k, v]) => {
			const { key, optional } = parseKey(k)

			let type: string

			if (typeof v === 'string') {
				// date will be an ISO string post validation
				type = v === 'date' ? 'string' : v
			} else {
				// recursively call for record shapes
				type = schemaToType(v)
			}

			return `${key}${optional ? '?' : ''}: ${type}`
		})
		.join('\n  ')

	return `{ ${fields} }`
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
			const validated = raw.map(item => {
				const { body, __mdsrc, ...metadata } = item
				const res = validate(metadata, collection.schema)

				if (res.issues) throw new Error(JSON.stringify(res.issues, null, 2))

				return {
					...res.value,
					body,
					__mdsrc,
				}
			})

			collections[collection.name] = {
				// keep the cleaned items with the schema they came from
				// both js and dts generation read from this shape
				items: validated,
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
						.map(
							name => `
								export type ${capitalise(name)} = ${schemaToType(collections[name].schema)} & {
									body: string,
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

		// serialise each validated collection as a plain module for Vite to load
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

/**
 * Convert watcher paths to a consistent slash format before comparing them
 */
function normaliseWatchPath(p: string) {
	return p.replace(/\\/g, '/')
}

/**
 * Build the Vite plugin that validates collections and writes the generated modules
 * keep the runtime data and declaration files in the same pass
 * resolve package imports from the generated directory
 */
export default function mdsrc(config: PluginConfig): Plugin {
	const src = config.collections

	// use one logger for the whole build so every step reports the same way
	// stay chatty outside production
	const logger = new Logger(
		config.logger?.level ?? (process.env.NODE_ENV === 'production' ? 'error' : 'debug'),
	)

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

	function watchedFile(filePath: string) {
		return watchedRoots.some(root => resolveWatchFile(filePath).startsWith(root))
	}

	// pass shared build tools into helpers without dragging lots of state around
	// keep the helper signatures small
	const buildContext = {
		logger,
		compileOptions: config.compileOptions,
		outDir,
		names: [],
	} satisfies BuildContext

	let rebuildRunning = false
	let rebuildQueued = false
	let rebuildReason = 'change'

	const rebuild = debounce((event: string, filePath: string) => {
		function queue() {
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
		if (!watchedFile(filePath)) return

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
			if (id === PKG_NAME) return path.join(outDir, 'index.js')

			if (id.startsWith(`${PKG_NAME}/`)) {
				// allow collection subpath imports once the build knows their names
				// leave unknown subpaths unresolved
				const subpath = id.slice(PKG_NAME.length + 1)
				const match = buildContext.names.find(
					name => name === subpath || toModuleName(name) === subpath,
				)

				if (match) return path.join(outDir, `${toModuleName(match)}.js`)
			}

			return null
		},
	}
}

export function toModuleName(name: string) {
	return name.toLowerCase()
}

