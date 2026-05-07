import fs from 'node:fs/promises'
import path from 'node:path'

const rootDir = import.meta.dir
const distDir = path.join(rootDir, 'dist')

await fs.rm(distDir, { recursive: true, force: true })

const result = await Bun.build({
	entrypoints: [path.join(rootDir, 'src/index.ts')],
	format: 'esm',
	outdir: distDir,
	packages: 'external',
	sourcemap: 'external',
	target: 'node',
})

if (!result.success) {
	for (const log of result.logs) {
		console.error(log)
	}

	process.exit(1)
}