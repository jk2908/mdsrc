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

export const SCALAR_NAMES = ['string', 'number', 'boolean', 'date'] as const

export const PRIMITIVE_NAMES = [...SCALAR_NAMES, 'array'] as const

export const MODIFIER_NAMES = ['max', 'min'] as const

export namespace Schema {
	export type Primitive = (typeof PRIMITIVE_NAMES)[number]

	/** A primitive an array element can hold. */
	export type Scalar = (typeof SCALAR_NAMES)[number]

	/** A parsed type expression: a scalar, or an array of one or more of these. */
	export type Spec = { type: Scalar } | { type: 'array'; element: Spec[] }

	/** A parsed schema value: the types it accepts and its value modifiers. */
	export type Parsed = {
		types: Spec[]
		modifiers: Partial<Record<ModifierName, string>>
	}

	export type ModifierName = (typeof MODIFIER_NAMES)[number]

	export type Modifier = `${ModifierName}=${string}`

	export type Key = string

	/** `array<string>`, `array<string|number>`, `array<array<number>>` */
	export type ArrayOf = `array<${string}>`

	export type Value =
		| Primitive
		| ArrayOf
		| `${Primitive}|${string}`
		| `${ArrayOf}|${string}`
		| { [key: Key]: Value }
}

export interface Schema {
	[key: Schema.Key]: Schema.Value
}

export namespace Collection {
	export type Entry = {
		name: string
		dir: string
		ignorePattern?: IgnorePattern
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

export type IgnorePattern = RegExp | ((file: string) => boolean)

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
