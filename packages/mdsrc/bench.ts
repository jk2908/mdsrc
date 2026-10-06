/// <reference types="@types/bun" />

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { create, DEFAULT_COMPILE_OPTIONS, entryCache } from './src/index.js'
import { Logger } from './src/logger.js'
import type { BuildContext } from './src/types.js'

const ROOT = path.join(os.tmpdir(), `mdsrc-bench-${Date.now()}`)
const FILES = Number(process.env.FILES ?? 1000)
const COLLECTIONS = Number(process.env.COLLECTIONS ?? 8)
const ITERATIONS = Number(process.env.ITERATIONS ?? 3)

const buildContext: BuildContext = {
	logger: new Logger('error'),
	names: [],
	compileOptions: DEFAULT_COMPILE_OPTIONS,
}

function doc(i: number) {
	return [
		'---',
		`title: Post ${i}`,
		`date: 2026-01-01`,
		'---',
		'',
		`# Post ${i}`,
		'',
		`Some **body** text with a [link](https://example.com) for post ${i}.`,
		'',
		'- alpha',
		'- beta',
		'- gamma',
		'',
	].join('\n')
}

async function writeDocs(dir: string, from: number, count: number) {
	await fs.mkdir(dir, { recursive: true })

	for (let i = 0; i < count; i++) {
		const n = from + i
		// one in four files exercises the heavier MDX pipeline
		const ext = n % 4 === 0 ? 'mdx' : 'md'
		await fs.writeFile(path.join(dir, `post-${n}.${ext}`), doc(n))
	}
}

async function timings(fn: () => Promise<unknown>) {
	const runs: number[] = []

	for (let i = 0; i < ITERATIONS; i++) {
		const start = performance.now()
		await fn()
		runs.push(performance.now() - start)
	}

	return Math.min(...runs)
}

function report(label: string, ms: number) {
	console.log(`  ${label.padEnd(28)} ${ms.toFixed(1).padStart(8)} ms`)
}

function speedup(slow: number, fast: number) {
	return `${(slow / fast).toFixed(2)}x`
}

async function main() {
	console.log(
		`mdsrc bench: ${FILES} files, ${COLLECTIONS} collections, ${ITERATIONS} iterations\n`,
	)

	// Scenario A: per-file parse cache -------------------------------------
	const singleDir = path.join(ROOT, 'single')
	await writeDocs(singleDir, 0, FILES)

	// warm the JIT before measuring
	entryCache.clear()
	await create(singleDir, buildContext)

	const cold = await timings(async () => {
		// clear before every run so each iteration genuinely re-parses
		entryCache.clear()
		await create(singleDir, buildContext)
	})
	const warm = await timings(() => create(singleDir, buildContext))

	console.log('parse cache (single collection)')
	report('cold (all files parsed)', cold)
	report('warm (all files cached)', warm)
	console.log(`  ${'speedup'.padEnd(28)} ${speedup(cold, warm).padStart(8)}\n`)

	// Scenario B: collection scheduling ------------------------------------
	const dirs: string[] = []
	const perDir = Math.ceil(FILES / COLLECTIONS)

	for (let c = 0; c < COLLECTIONS; c++) {
		const dir = path.join(ROOT, `collection-${c}`)
		dirs.push(dir)
		await writeDocs(dir, c * perDir, perDir)
	}

	// warm before measuring
	entryCache.clear()
	for (const dir of dirs) await create(dir, buildContext)

	const sequential = await timings(async () => {
		entryCache.clear()
		for (const dir of dirs) await create(dir, buildContext)
	})

	const parallel = await timings(async () => {
		entryCache.clear()
		await Promise.all(dirs.map(dir => create(dir, buildContext)))
	})

	console.log('collection scheduling (cold, all dirs)')
	report('sequential for-loop', sequential)
	report('Promise.all', parallel)
	console.log(`  ${'speedup'.padEnd(28)} ${speedup(sequential, parallel).padStart(8)}\n`)

	await fs.rm(ROOT, { recursive: true, force: true })
}

await main()
