import { realpathSync } from 'node:fs'
import fs from 'node:fs/promises'
import path from 'node:path'

import type { Plugin, ViteDevServer } from 'vite'

import {
	markdownToHtml,
	mdxToJs,
	type CompileOptions,
	type MarkdownToHtmlResult,
} from 'satteri'

import type {
	AcceptedExtension,
	BuildContext,
	Collection,
	Manifest,
	MdxRaw,
	PluginConfig,
	Raw,
	Schema,
} from './types.js'
import { AUTOGEN_MSG, GENERATED_DIR, PKG_NAME } from './config.js'
import { Logger } from './logger.js'
import {
	capitalise,
	debounce,
	isRecord,
	pluralise,
	singularise,
	slugify,
} from './utils.js'
import { parseKey, validate } from './validate.js'

export const DEFAULT_COMPILE_OPTIONS = {
	features: {
		frontmatter: true,
	},
} satisfies CompileOptions

const ACCEPTED_EXTENSIONS = ['md', 'mdx'] as const satisfies AcceptedExtension[]

export type { Collection, CompileOptions } from './types.js'

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
		const files = (await fs.readdir(dir)).filter((file: string) =>
			ACCEPTED_EXTENSIONS.some(e => `.${e}` === path.extname(file)),
		)
		const filePaths = files.map(file => path.join(dir, file))

		if (!files.length) {
			logger.warn(`mdsrc: ${dir} is empty`)
			return []
		}

		const parserArgs = {
			features: {
				...DEFAULT_COMPILE_OPTIONS.features,
				...features,
			},
			...restCompileOptions,
		}

		return Promise.all(
			filePaths.map(async filePath => {
				const file = path.basename(filePath)

				const ext = path.extname(filePath)
				// if not markdown, must be mdx
				const md = ext === '.md'
				const content = await fs.readFile(filePath, 'utf-8')

				let res =
					ext === '.md'
						? markdownToHtml(content, parserArgs)
						: mdxToJs(content, parserArgs)

				// if any async plugins are used, `res` will be a Promise
				if (res instanceof Promise) res = await res

				const frontmatter = await parse(res.frontmatter)
				const body = 'html' in res ? res.html : res.code
				const slug = slugify(path.basename(file, md ? '.md' : '.mdx'))

				return md
					? {
							...frontmatter,
							__mdsrc: { slug, filename: file, type: 'md' as const },
							html: body.trim(),
						}
					: {
							...frontmatter,
							__mdsrc: { slug, filename: file, type: 'mdx' as const },
							code: body.trim(),
						}
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

export function schemaToType(schema: Schema) {
	const fields = Object.entries(schema)
		.map(([k, v]) => {
			const { key, optional } = parseKey(k)

			let type: string

			if (typeof v === 'string') {
				// date will be an ISO string post validation
				type = v === 'date' ? 'string' : v === 'array' ? 'any[]' : v
			} else {
				// recursively call for record shapes
				type = schemaToType(v)
			}

			return `${key}${optional ? '?' : ''}: ${type}`
		})
		.join('\n  ')

	return `{ ${fields} }`
}

export async function getManifest(outDir: string) {
	return fs
		.readFile(path.join(outDir, 'manifest.json'), 'utf-8')
		.then(JSON.parse)
		.then(manifest => {
			if (!isRecord(manifest)) return null

			const entries = Object.entries(manifest).filter(
				(entry): entry is [string, string[]] =>
					typeof entry[0] === 'string' &&
					Array.isArray(entry[1]) &&
					entry[1].every(value => typeof value === 'string'),
			)

			return Object.fromEntries(entries)
		})
		.catch(() => null)
}

export async function cleanup(
	outDir: string,
	manifest: Manifest,
	prevManifest: Manifest | null,
) {
	if (!prevManifest) return false

	const files = new Set(Object.values(manifest).flat())
	const prevFiles = Object.values(prevManifest).flat()
	const staleDirs = new Set<string>()

	let cleaned = false

	for (const filePath of prevFiles) {
		// this asset still exists
		if (files.has(filePath)) continue

		await fs.rm(filePath, { force: true })

		fileCache.delete(filePath)
		staleDirs.add(path.dirname(filePath))

		cleaned = true
	}

	// sort so nested dirs are removed first
	for (const dir of [...staleDirs].toSorted((a, b) => b.length - a.length)) {
		if (dir === outDir) continue

		try {
			if ((await fs.readdir(dir)).length) continue
		} catch (err) {
			if (!isENOENT(err)) throw err
			continue
		}

		await fs.rm(dir, { recursive: true, force: true })
		cleaned = true
	}

	return cleaned
}

async function build(src: Collection.Entry[], buildContext: BuildContext) {
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

	// file manifest for cleanup
	const manifest: Record<string, string[]> = {}

	try {
		if (!outDir) throw new Error('Output directory is not defined')

		// make sure the output directory exists before the writes begin
		await fs.mkdir(outDir, { recursive: true })
		const prevManifest = await getManifest(outDir)

		// read and validate every collection before writing anything out
		// this keeps the js and dts outputs in step
		for (const collection of src) {
			const raw = await create(path.join(process.cwd(), collection.dir), buildContext)

			// check each raw item before it makes it into the generated collection
			// bad entries get logged and dropped
			const validated: Raw[] = raw.map(item => {
				const { html, code, __mdsrc, ...metadata } = item
				const res = validate(metadata, collection.schema)

				if (res.issues) throw new Error(JSON.stringify(res.issues, null, 2))

				return __mdsrc.type === 'md'
					? { ...res.value, __mdsrc, html }
					: { ...res.value, __mdsrc, code }
			})

			collections[collection.name] = {
				// keep the cleaned items with the schema they came from
				// both js and dts generation read from this shape
				items: validated,
				schema: collection.schema,
			}

			manifest[collection.name] = []
		}

		// take the collection names after validation has settled
		// every generated file then works from the same list
		names = Object.keys(collections)

		const componentTypeDef = names.some(name => collections[name]?.items.some(isMdx))
			? getComponentTypeDef(buildContext.compileOptions)
			: null

		// queue the file writes first so the emit phase can run together
		// wait for them once every output is ready
		const promises = []

		// build the type file from the schema rather than the observed data
		// that keeps optional fields and date output honest
		promises.push(
			maybeWrite(
				path.join(outDir, 'types.ts'),
				` ${AUTOGEN_MSG}

					import type { Collection } from '${PKG_NAME}'
					${componentTypeDef ? `\n\t\t\t\t\t${componentTypeDef.import}` : ''}

					${componentTypeDef ? `\n\t\t\t\t\ttype Component = ${componentTypeDef.type}\n` : ''}
				
					${names
						.map(
							name => `
								export type ${capitalise(singularise(name))} = ${schemaToType(collections[name].schema)} & {
									html?: string,
									Component?: ${componentTypeDef ? 'Component' : 'unknown'},
								} & Collection.Metadata
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
				`	${AUTOGEN_MSG}

					import type { ${names.map(name => capitalise(singularise(name))).join(', ')} } from './types.js'

					${names
						.map(
							name => `
								export const all${capitalise(pluralise(name, 2))}: ${capitalise(singularise(name))}[]
							`,
						)
						.join('\n\n')}

					declare module '${PKG_NAME}' {
						${names
							.map(
								name => `
									export const all${capitalise(pluralise(name, 2))}: ${capitalise(singularise(name))}[]
								`,
							)
							.join('\n\n')}
					}
				`.trim(),
			),
		)

		// serialise each validated collection as a plain module for Vite to load
		for (const name of names) {
			const collection = collections[name]?.items ?? []

			const fileName = toModuleName(name)
			const filePath = `${fileName}.js`

			const imports: string[] = []
			const entries: string[] = []

			if (collection.some(isMdx)) {
				await fs.mkdir(path.join(outDir, fileName), { recursive: true })
			}

			for (let i = 0; i < collection.length; i++) {
				const item = collection[i]

				if (isMdx(item)) {
					const slug = item.__mdsrc.slug

					// fileName (collection name) is used as dir name
					const fullPath = path.join(outDir, fileName, `${slug}.js`)

					manifest[name].push(fullPath)
					promises.push(maybeWrite(fullPath, item.code))

					const importName = `C${i}`
					imports.push(`import ${importName} from './${fileName}/${slug}.js'`)

					// oxlint-disable-next-line no-unused-vars
					const { code, ...rest } = item
					entries.push(`{ ...${JSON.stringify(rest)}, Component: ${importName} }`)
				} else {
					entries.push(JSON.stringify(item))
				}
			}

			const fullPath = path.join(outDir, filePath)

			// add to manifest
			manifest[name].push(fullPath)

			promises.push(
				maybeWrite(
					fullPath,
					`	${AUTOGEN_MSG}
		
						${imports.join('\n')}

						export const all${capitalise(pluralise(name, 2))} = [${entries.join(',\n')}]`.trim(),
				),
			)
		}

		// stitch the per-collection modules into the public js entrypoint
		// this is the file the root package import resolves to
		promises.push(
			maybeWrite(
				path.join(outDir, 'index.js'),
				`${AUTOGEN_MSG}
				
					${names
						.map(
							name =>
								`
								export * from './${toModuleName(name)}.js'
							`,
						)
						.join('\n')}`,
			),
		)

		promises.push(
			maybeWrite(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2)),
		)

		// flush every generated artifact once all the content is ready
		// let any failed write fail the build
		const writes = await Promise.all(promises)
		const cleaned = await cleanup(outDir, manifest, prevManifest)

		buildContext.names = names

		return writes.some(c => c) || cleaned
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

function getComponentTypeDef(compileOptions?: CompileOptions) {
	const importSource = getJsxImportSource(compileOptions)

	switch (importSource) {
		case 'preact': {
			return {
				import: `import type { ComponentType } from 'preact'`,
				type: `ComponentType<{ components?: Record<string, ComponentType<any>> }>`,
			}
		}
		case 'solid-js': {
			return {
				import: `import type { Component } from 'solid-js'`,
				type: `Component<{ components?: Record<string, Component<any>> }>`,
			}
		}
		case 'react':
		default: {
			return {
				import: `import type { ComponentType } from 'react'`,
				type: `ComponentType<{ components?: Record<string, ComponentType<any>> }>`,
			}
		}
	}
}

/**
 * @see https://satteri.bruits.org/docs/options/
 */
function getJsxImportSource(compileOptions?: CompileOptions) {
	if (!compileOptions) return 'react'

	if (
		'jsxImportSource' in compileOptions &&
		typeof compileOptions.jsxImportSource === 'string'
	) {
		return compileOptions.jsxImportSource
	}

	return 'react'
}

function isMdx(item: Raw): item is MdxRaw {
	return item.__mdsrc.type === 'mdx'
}
