import type {
	CompileOptions as SatteriCompileOptions,
	MdxCompileOptions as SatteriMdxCompileOptions,
} from 'satteri'

import type { LogLevel, Logger } from './logger.js'

export type CompileOptions = SatteriCompileOptions | SatteriMdxCompileOptions

export type PluginConfig = {
	collections: Collection.Entry[]
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

export type Manifest = Record<string, string[]>

export const PRIMITIVE_NAMES = ['string', 'number', 'boolean', 'date', 'array'] as const

export const MODIFIER_NAMES = ['max', 'min'] as const

export namespace Schema {
	export type Primitive = 'string' | 'number' | 'boolean' | 'date' | 'array'

	export type ModifierName = (typeof MODIFIER_NAMES)[number]

	export type Modifier = `${ModifierName}=${string}`

	export type Key = string

	export type Value = Primitive | `${Primitive}|${string}` | { [key: Key]: Value }
}

export interface Schema {
	[key: Schema.Key]: Schema.Value
}

export namespace Collection {
	export type Entry = {
		name: string
		dir: string
		schema: Schema
	}

	export type Metadata = {
		__mdsrc: {
			slug: string
			filename: string
			type: AcceptedExtension
		}
	}
}

export type Entries = Record<string, unknown>

export type AcceptedExtension = 'md' | 'mdx'

export type MdRaw = {
	__mdsrc: {
		slug: string
		filename: string
		type: Extract<AcceptedExtension, 'md'>
	}
	html: string
}

export type MdxRaw = {
	__mdsrc: {
		slug: string
		filename: string
		type: Extract<AcceptedExtension, 'mdx'>
	}
	code: string
}

export type Raw = MdRaw | MdxRaw

export type Types = Record<string, string>

export type IssueCode =
	| 'MISSING_REQUIRED'
	| 'UNKNOWN_KEY'
	| 'INVALID_TYPE'
	| 'INVALID_DATE'
	| 'INVALID_INPUT'
	| 'INVALID_LENGTH'
	| 'INVALID_SIZE'
	| 'BAD_MODIFIER'

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
