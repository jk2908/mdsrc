import type { CompileOptions as SatteriCompileOptions } from 'satteri'

import type { LogLevel, Logger } from './logger.js'

export type CompileOptions = SatteriCompileOptions

export type PluginConfig = {
	collections: Collection[]
	logger?: {
		level?: LogLevel
	}
	compileOptions?: CompileOptions
}

export type BuildContext = {
	logger: InstanceType<typeof Logger>
	compileOptions?: CompileOptions
	outDir?: string
	names?: string[]
}

export namespace Schema {
	type Primitive = 'string' | 'number' | 'boolean' | 'date' | 'object'

	export type Key = string
	export type Value = Primitive | { [key: Key]: Value }
}

export interface Schema {
	[key: Schema.Key]: Schema.Value
}

export type Collection = {
	name: string
	dir: string
	schema: Schema
}

export type Entries = Record<string, unknown>

export type Raw = {
	__mdsrc: {
		slug: string
		filename: string
	}
	body: string
} & Entries

export type Types = Record<string, string>

export type IssueCode =
	| 'MISSING_REQUIRED'
	| 'UNKNOWN_KEY'
	| 'INVALID_TYPE'
	| 'INVALID_DATE'
	| 'INVALID_INPUT'

export type Issue = {
	readonly code: IssueCode
	readonly message: string
}

export type Fail = {
	readonly issues: Issue[]
}

export type Success<Output> = {
	readonly value: Output
	readonly issues?: Issue[]
	readonly types?: Record<string, string>
}

export type Result<Output> = Success<Output> | Fail
