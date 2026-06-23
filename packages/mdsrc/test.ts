import type { MarkdownToHtmlResult } from 'satteri'

import fs from 'node:fs/promises'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { BuildContext, Entries, Schema } from './src/types.js'
import {
	create,
	DEFAULT_COMPILE_OPTIONS,
	FILE_CACHE_MAX_SIZE,
	fileCache,
	getFileCache,
	maybeWrite,
	parse,
	parseKey,
	schemaToType,
	setFileCache,
	toModuleName,
	validate,
} from './src/index.js'
import { Logger } from './src/logger.js'
import { dedent, deep } from './src/utils.js'

const TEMP_DIR = './mdsrc-tmp'

const SCHEMA = {
	title: 'string',
	'metadata?': {
		author: 'string',
	},
	date: 'date',
	draft: 'boolean',
} satisfies Schema

const ENTRY = {
	title: 'mdsrc',
	metadata: {
		author: 'Md Src',
	},
	date: '6-18-26',
	draft: false,
	__mdsrc: {
		slug: 'test',
		filename: 'test.md',
	},
	body: '<p>Bodyyy</p>',
}

describe('markdown parsing', () => {
	const now = Date.now()

	const yaml = {
		kind: 'yaml',
		value: dedent(`
			title: mdsrc
			date: ${now}
		`),
	} satisfies MarkdownToHtmlResult['frontmatter']

	const toml = {
		kind: 'toml',
		value: dedent(`
			title = "mdsrc"
			date = ${now}
		`),
	} satisfies MarkdownToHtmlResult['frontmatter']

	it('parse', async () => {
		for (const f of [yaml, toml]) {
			const frontmatter = await parse(f)

			expect(frontmatter).toEqual({
				title: 'mdsrc',
				date: now,
			})
		}
	})

	it('returns empty object for missing frontmatter', async () => {
		const frontmatter = await parse(null)
		expect(frontmatter).toEqual({})
	})
})

describe('create', () => {
	const GOOD_PATH = 'test.md'
	const BAD_PATH = 'test.txt'

	const md = dedent(
		`---
			title: mdsrc
			metadata: { author: Md Src }
			date: 6-18-26
			draft: false
			---
			
			Bodyyy`,
	)

	const buildContext = {
		logger: new Logger(),
		names: [],
		compileOptions: DEFAULT_COMPILE_OPTIONS,
	} satisfies BuildContext

	beforeEach(async () => {
		await fs.mkdir(TEMP_DIR, { recursive: true })
	})

	afterEach(async () => {
		await fs.rm(TEMP_DIR, {
			recursive: true,
			force: true,
		})
	})

	it('creates a raw match', async () => {
		await fs.writeFile(path.join(TEMP_DIR, GOOD_PATH), md)

		const [created] = await create(TEMP_DIR, buildContext)
		expect(created).toEqual(ENTRY)
	})

	it('ignores non markdown inputs', async () => {
		await fs.writeFile(path.join(TEMP_DIR, BAD_PATH), md)

		const created = await create(TEMP_DIR, buildContext)
		expect(created).toHaveLength(0)
	})

	it('returns empty array for directory with no markdown files', async () => {
		await fs.writeFile(path.join(TEMP_DIR, BAD_PATH), 'not markdown')
		const result = await create(TEMP_DIR, buildContext)

		expect(result).toEqual([])
	})

	it('throws when directory does not exist', async () => {
		await expect(create('./nonexistent-dir', buildContext)).rejects.toThrow()
	})
})

describe('validate', () => {
	it('disallows invalid input', () => {
		for (const b of [null, 'bad']) {
			// @ts-expect-error: bad test
			const { issues } = validate(b, SCHEMA)
			expect(issues?.[0].code).toBe('INVALID_INPUT')
		}
	})

	it('accepts input without optional key', () => {
		// oxlint-disable-next-line no-unused-vars
		const { __mdsrc, body, metadata, ...rest } = ENTRY
		const { value, issues } = validate(rest, SCHEMA)

		const date = new Date(rest.date).toISOString()

		expect(issues).toBeUndefined()
		expect(value).toEqual({ ...rest, date })
	})

	it('disallows missing required key', () => {
		const { issues } = validate(
			{
				metadata: {
					author: 'Md Src',
				},
				date: '6-22-2026',
				draft: false,
			},
			SCHEMA,
		)

		expect(issues?.[0].code).toBe('MISSING_REQUIRED')
	})

	it('disallows unknown key', () => {
		const { issues } = validate({ ...ENTRY, some: 'other thing' }, SCHEMA)
		expect(issues?.[0].code).toBe('UNKNOWN_KEY')
	})

	it('allows optional keys in input', () => {
		// oxlint-disable-next-line no-unused-vars
		const { body, __mdsrc, ...rest } = ENTRY
		const { value, issues } = validate(rest, SCHEMA)

		const date = new Date(rest.date).toISOString()

		expect(issues).toBeUndefined()
		expect(value).toEqual({ ...rest, date })
	})

	it('coerces a number-like string to a number', () => {
		const num = '1'
		const { value } = validate({ num }, { num: 'number' })

		expect(value?.num).toBeTypeOf('number')
	})

	it('coerces a boolean-like string to a boolean', () => {
		const bool = 'true'
		const { value } = validate({ bool }, { bool: 'boolean' })

		expect(value?.bool).toBeTypeOf('boolean')
	})

	it('coerces Date objects, strings and numbers to ISO strings', () => {
		const schema = { date: 'date' } satisfies Schema
		const now = Date.now()
		const expected = new Date(now).toISOString()

		const { value: dateObjectValue } = validate({ date: new Date(now) }, schema)
		expect(dateObjectValue?.date).toBe(expected)

		const { value: stringValue } = validate(
			{
				date: new Date(now).toISOString(),
			},
			schema,
		)
		expect(stringValue?.date).toBe(expected)

		const { value: numberValue } = validate({ date: now }, schema)
		expect(numberValue?.date).toBe(expected)
	})

	it('disallows invalid date string', () => {
		const invalid = '22/6/26'
		const { issues } = validate({ date: invalid }, { date: 'date' })

		expect(issues?.[0].code).toBe('INVALID_DATE')
	})

	it('validates deeply nested object values', () => {
		const input = {
			some: {
				thing: {
					else: 'mdsrc',
				},
			},
		} satisfies Entries

		const schema = {
			some: {
				thing: {
					else: 'string',
				},
			},
		} satisfies Schema

		const { value } = validate(input, schema)
		expect(value).toEqual(input)
	})

	it('disallows invalid type per primitive', () => {
		const { issues: stringIssues } = validate(
			{ mdsrc: 123 },
			{
				mdsrc: 'string',
			},
		)

		expect(stringIssues?.[0].code).toBe('INVALID_TYPE')

		const { issues: numberIssues } = validate(
			{
				mdsrc: 'abc',
			},
			{
				mdsrc: 'number',
			},
		)

		expect(numberIssues?.[0].code).toBe('INVALID_TYPE')

		const { issues: booleanIssues } = validate(
			{
				mdsrc: 'abc',
			},
			{
				mdsrc: 'boolean',
			},
		)

		expect(booleanIssues?.[0].code).toBe('INVALID_TYPE')
	})

	it('disallows non-record value for nested schema field', () => {
		const { issues } = validate(
			{
				some: [],
			},
			{
				some: {
					other: {
						thing: 'string',
					},
				},
			},
		)

		expect(issues?.[0].code).toBe('INVALID_TYPE')
	})

	it('collects multiple issues within one validation', () => {
		const { issues } = validate(
			{
				title: 123,
				date: 'not a date',
				draft: 'maybe',
			},
			SCHEMA,
		)

		expect(issues).toHaveLength(3)
		expect(issues?.map(i => i.code)).toEqual([
			'INVALID_TYPE',
			'INVALID_DATE',
			'INVALID_TYPE',
		])
	})
})

describe('utils', () => {
	it('parses optional keys', () => {
		const input = 'key?'
		const { optional, key } = parseKey(input)

		expect(optional).toEqual(true)
		expect(key).toBe(input.slice(0, -1))
	})

	it('parses required keys', () => {
		const input = 'key'
		const { optional, key } = parseKey(input)

		expect(optional).toEqual(false)
		expect(key).toEqual(input)
	})

	it('converts a schema to stringified TypeScript', () => {
		const res = schemaToType(SCHEMA)
			.split('\n')
			.map(n => n.replace(/\s/g, '').trim())
			.join(';')

		expect(res).toBe('{title:string;metadata?:{author:string};date:string;draft:boolean}')
	})

	it('builds deep objects from dot separated strings', () => {
		const ob = {}
		deep(ob, 'some.thing.else', 'mdsrc')

		expect(ob).toEqual({
			some: {
				thing: {
					else: 'mdsrc',
				},
			},
		})
	})

	it('converts collection names to lowercase module names', () => {
		expect(toModuleName('Posts')).toBe('posts')
		expect(toModuleName('BlogPosts')).toBe('blogposts')
		expect(toModuleName('already-lowercase')).toBe('already-lowercase')
	})
})

describe('write (maybeWrite)', () => {
	const testFile = path.join(TEMP_DIR, 'test.txt')

	beforeEach(async () => {
		await fs.mkdir(TEMP_DIR, { recursive: true })
		fileCache.clear()
	})

	afterEach(async () => {
		await fs.rm(TEMP_DIR, { recursive: true, force: true })
	})

	it('writes a new file when cache is empty', async () => {
		const changed = await maybeWrite(testFile, 'hello')

		expect(changed).toBe(true)
		expect(await fs.readFile(testFile, 'utf-8')).toBe('hello')
	})

	it('skips write when cache matches and file exists', async () => {
		await maybeWrite(testFile, 'hello')
		const changed = await maybeWrite(testFile, 'hello')

		expect(changed).toBe(false)
	})

	it('writes when cache matches but file was deleted', async () => {
		await maybeWrite(testFile, 'hello')
		await fs.unlink(testFile)

		const changed = await maybeWrite(testFile, 'hello')

		expect(changed).toBe(true)
		expect(await fs.readFile(testFile, 'utf-8')).toBe('hello')
	})

	it('writes when content changes', async () => {
		await maybeWrite(testFile, 'hello')
		const changed = await maybeWrite(testFile, 'world')

		expect(changed).toBe(true)
		expect(await fs.readFile(testFile, 'utf-8')).toBe('world')
	})
})

describe('fileCache', () => {
	beforeEach(() => {
		fileCache.clear()
	})

	it('evicts least recently used entry when at capacity', () => {
		for (let i = 0; i < FILE_CACHE_MAX_SIZE; i++) {
			setFileCache(`file${i}.txt`, `content${i}`)
		}

		expect(fileCache.size).toBe(FILE_CACHE_MAX_SIZE)
		expect(fileCache.has('file0.txt')).toBe(true)

		setFileCache('new.txt', 'new content')

		expect(fileCache.size).toBe(FILE_CACHE_MAX_SIZE)
		expect(fileCache.has('file0.txt')).toBe(false)
		expect(fileCache.has('new.txt')).toBe(true)
	})

	it('promotes entries on read', () => {
		for (let i = 0; i < FILE_CACHE_MAX_SIZE; i++) {
			setFileCache(`file${i}.txt`, `content${i}`)
		}

		getFileCache('file0.txt')
		setFileCache('new.txt', 'new content')

		expect(fileCache.has('file0.txt')).toBe(true)
		expect(fileCache.has('file1.txt')).toBe(false)
	})
})
