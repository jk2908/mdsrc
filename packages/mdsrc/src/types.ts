import type { MarkdownIt, MarkdownItOptions } from 'markdown-it-ts'

import type { LogLevel, Logger } from './logger.js'

type MarkdownItUseArgs = Parameters<MarkdownIt['use']>

export type MarkdownItConfig = MarkdownItOptions

export type MarkdownPlugin = MarkdownItUseArgs[0]

export type MarkdownPluginUse =
	| MarkdownPlugin
	| readonly [
			plugin: MarkdownPlugin,
			...params: MarkdownItUseArgs extends [unknown, ...infer Params] ? Params : never,
	  ]

export type MarkdownConfig = {
	plugins?: MarkdownPluginUse[]
	config?: MarkdownItConfig
}

export type PluginConfig = {
	collections: Collection[]
	logger?: {
		level?: LogLevel
	}
	markdown?: MarkdownConfig
}

export type BuildContext = {
	logger: InstanceType<typeof Logger>
	markdown?: MarkdownConfig
	outDir?: string
	names?: string[]
}

export type SchemaEntry = {
	type: 'string' | 'number' | 'boolean' | 'date'
	optional?: boolean
	minLength?: number
	maxLength?: number
}

export type Schema = Record<string, SchemaEntry>

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
	html: string
	markdown: string
} & Entries

export type Types = Record<string, string>

export type Issue = {
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
