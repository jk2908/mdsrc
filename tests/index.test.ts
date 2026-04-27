import { afterEach, describe, expect, test } from 'bun:test'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

import type { ViteDevServer } from 'vite'

import type { Schema } from '../src/types.ts'
import plugin, { create } from '../src/index.ts'
import { Logger } from '../src/logger.ts'

const originalCwd = process.cwd()
const originalConsoleLog = console.log
const originalConsoleError = console.error
const fixturesDir = path.join(import.meta.dir, 'fixtures')
const tempRoots = new Set<string>()

const postSchema = {
	title: { type: 'string' },
} satisfies Schema

const postSchemaWithOptionalFields = {
	title: { type: 'string' },
	draft: { type: 'boolean', optional: true },
	publishedAt: { type: 'date', optional: true },
} satisfies Schema

afterEach(async () => {
	process.chdir(originalCwd)
	console.log = originalConsoleLog
	console.error = originalConsoleError

	for (const tempRoot of tempRoots) {
		await fs.rm(tempRoot, { recursive: true, force: true })
	}

	tempRoots.clear()
})

async function useFixture(name: string) {
	const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mdsrc-'))
	const workspaceDir = path.join(tempRoot, 'workspace')

	tempRoots.add(tempRoot)
	await fs.cp(path.join(fixturesDir, name), workspaceDir, { recursive: true })

	return {
		contentDir: path.join(workspaceDir, 'content'),
		workspaceDir,
	}
}

async function runBuild(workspaceDir: string, schema: Schema) {
	process.chdir(workspaceDir)

	const instance = plugin([{ name: 'post', dir: 'content', schema }])
	const buildStart = instance.buildStart as (() => Promise<void>) | undefined

	if (!buildStart) {
		throw new Error('missing buildStart hook')
	}

	await buildStart()

	const generatedDir = path.join(workspaceDir, '.mdsrc')
	const typesSource = await fs.readFile(path.join(generatedDir, 'types.ts'), 'utf-8')
	const allPosts = await readAllPosts(generatedDir)

	return { allPosts, generatedDir, instance, typesSource }
}

async function readAllPosts(generatedDir: string) {
	const { allPosts } = await import(
		`${pathToFileURL(path.join(generatedDir, 'post.js')).href}?t=${Date.now()}-${Math.random()}`
	)

	return allPosts
}

async function buildFixture(name: string, schema: Schema) {
	const { workspaceDir } = await useFixture(name)
	return {
		...(await runBuild(workspaceDir, schema)),
		workspaceDir,
	}
}

async function withSilentConsole<T>(run: () => Promise<T>) {
	console.log = () => {}
	return run()
}

function createWatcher() {
	const handlers = new Map<string, Array<(filePath: string) => void>>()

	return {
		on(event: string, handler: (filePath: string) => void) {
			const next = handlers.get(event) ?? []
			next.push(handler)
			handlers.set(event, next)
			return this
		},
		emit(event: string, filePath: string) {
			for (const handler of handlers.get(event) ?? []) {
				handler(filePath)
			}
		},
	}
}

async function waitFor(predicate: () => boolean | Promise<boolean>, timeoutMs = 1500) {
	const deadline = Date.now() + timeoutMs

	while (Date.now() < deadline) {
		if (await predicate()) return
		await new Promise(resolve => setTimeout(resolve, 20))
	}

	throw new Error('timed out waiting for condition')
}

describe('mdsrc', () => {
	test('create reads markdown files into raw entry data', async () => {
		const { contentDir } = await useFixture('single')
		const entries = await create(contentDir, { logger: new Logger('error') })

		expect(entries).toHaveLength(1)
		expect(entries[0]).toMatchObject({
			title: 'hello world',
			draft: 'true',
			publishedAt: '2024-01-02',
			body: 'this is the body',
			__mdsrc: {
				filename: 'Hello World.md',
				slug: 'hello-world',
			},
		})
	})

	test('build emits schema-driven types and keeps optional fields optional', async () => {
		const { allPosts, typesSource } = await buildFixture(
			'single',
			postSchemaWithOptionalFields,
		)

		expect(typesSource).toContain('title: string')
		expect(typesSource).toContain('draft?: boolean')
		expect(typesSource).toContain('publishedAt?: string')
		expect(allPosts).toHaveLength(1)
		expect(allPosts[0]).toMatchObject({
			title: 'hello world',
			draft: true,
			publishedAt: '2024-01-02T00:00:00.000Z',
			body: 'this is the body',
		})
	})

	test('build drops invalid entries but still emits schema-based types', async () => {
		const { allPosts, typesSource } = await withSilentConsole(() =>
			buildFixture('invalid', postSchemaWithOptionalFields),
		)

		expect(allPosts).toEqual([])
		expect(typesSource).toContain('title: string')
		expect(typesSource).toContain('draft?: boolean')
		expect(typesSource).toContain('publishedAt?: string')
	})

	test('build keeps every valid markdown file in the generated collection', async () => {
		const { allPosts, typesSource } = await buildFixture('multi', postSchema)
		const posts = [...allPosts].toSorted((left, right) =>
			left.__mdsrc.slug.localeCompare(right.__mdsrc.slug),
		)

		expect(typesSource).toContain('title: string')
		expect(posts.map(post => post.__mdsrc.slug)).toEqual(['hello-world', 'second-post'])
		expect(posts.map(post => post.title)).toEqual(['hello world', 'second post'])
		expect(posts.map(post => post.body)).toEqual(['first body', 'second body'])
	})

	test('resolveId returns generated files for the package root and known subpaths', async () => {
		const { generatedDir, instance, workspaceDir } = await buildFixture(
			'single',
			postSchema,
		)
		const resolveId = instance.resolveId as ((id: string) => string | null) | undefined

		if (!resolveId) {
			throw new Error('missing resolveId hook')
		}

		const rootId = resolveId('@jk2908/mdsrc')
		const postId = resolveId('@jk2908/mdsrc/post')

		if (!rootId || !postId) {
			throw new Error('expected generated paths to resolve')
		}

		expect(await fs.realpath(rootId)).toBe(
			await fs.realpath(path.join(generatedDir, 'index.js')),
		)
		expect(await fs.realpath(postId)).toBe(
			await fs.realpath(path.join(workspaceDir, '.mdsrc', 'post.js')),
		)
		expect(resolveId('@jk2908/mdsrc/missing')).toBeNull()
	})

	test('watch rebuild logs only when generated output changes', async () => {
		const { instance, workspaceDir } = await buildFixture('single', postSchema)
		const configureServer = instance.configureServer as
			| ((server: ViteDevServer) => void)
			| undefined

		if (!configureServer) {
			throw new Error('missing configureServer hook')
		}

		const watcher = createWatcher()
		const logs: string[] = []
		console.log = (...args: unknown[]) => {
			logs.push(args.map(arg => String(arg)).join(' '))
		}

		configureServer({ watcher } as unknown as ViteDevServer)
		watcher.emit('change', path.join(workspaceDir, 'content', 'Hello World.md'))

		await new Promise(resolve => setTimeout(resolve, 250))

		expect(logs.some(line => line.includes('[watch]: content rebuilt'))).toBeFalse()
	})

	test('watch rebuild state stays isolated per plugin instance', async () => {
		const tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'mdsrc-watch-'))
		const workspaceDir = path.join(tempRoot, 'workspace')
		const generatedDir = path.join(workspaceDir, '.mdsrc')

		tempRoots.add(tempRoot)
		await fs.mkdir(path.join(workspaceDir, 'content-a'), { recursive: true })
		await fs.mkdir(path.join(workspaceDir, 'content-b'), { recursive: true })
		await fs.writeFile(
			path.join(workspaceDir, 'content-a', 'Alpha.md'),
			'---\ntitle: alpha v1\n---\n\nalpha body',
		)
		await fs.writeFile(
			path.join(workspaceDir, 'content-b', 'Beta.md'),
			'---\ntitle: beta v1\n---\n\nbeta body',
		)

		process.chdir(workspaceDir)

		const alpha = plugin([{ name: 'alpha', dir: 'content-a', schema: postSchema }])
		const beta = plugin([{ name: 'beta', dir: 'content-b', schema: postSchema }])
		const alphaBuildStart = alpha.buildStart as (() => Promise<void>) | undefined
		const betaBuildStart = beta.buildStart as (() => Promise<void>) | undefined
		const alphaConfigureServer = alpha.configureServer as
			| ((server: ViteDevServer) => void)
			| undefined
		const betaConfigureServer = beta.configureServer as
			| ((server: ViteDevServer) => void)
			| undefined

		if (!alphaBuildStart || !betaBuildStart) {
			throw new Error('missing buildStart hook')
		}

		if (!alphaConfigureServer || !betaConfigureServer) {
			throw new Error('missing configureServer hook')
		}

		await alphaBuildStart()
		await betaBuildStart()

		const alphaWatcher = createWatcher()
		const betaWatcher = createWatcher()
		const logs: string[] = []
		console.log = (...args: unknown[]) => {
			logs.push(args.map(arg => String(arg)).join(' '))
		}

		alphaConfigureServer({ watcher: alphaWatcher } as unknown as ViteDevServer)
		betaConfigureServer({ watcher: betaWatcher } as unknown as ViteDevServer)

		await fs.writeFile(
			path.join(workspaceDir, 'content-a', 'Alpha.md'),
			'---\ntitle: alpha v2\n---\n\nalpha body',
		)
		await fs.writeFile(
			path.join(workspaceDir, 'content-b', 'Beta.md'),
			'---\ntitle: beta v2\n---\n\nbeta body',
		)

		alphaWatcher.emit('change', path.join(workspaceDir, 'content-a', 'Alpha.md'))
		betaWatcher.emit('change', path.join(workspaceDir, 'content-b', 'Beta.md'))

		await waitFor(async () => {
			const alphaSource = await fs.readFile(path.join(generatedDir, 'alpha.js'), 'utf-8')
			const betaSource = await fs.readFile(path.join(generatedDir, 'beta.js'), 'utf-8')

			return alphaSource.includes('alpha v2') && betaSource.includes('beta v2')
		})

		expect(
			logs.filter(line => line.includes('[watch]: content rebuilt')),
		).toHaveLength(2)
	})
})
