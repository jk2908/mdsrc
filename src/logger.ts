import { NAME } from './config'

const LEVELS = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	fatal: 4,
} as const

export type LogLevel = keyof typeof LEVELS

type LogEntry = {
	ts: number
	level: LogLevel
	message: string
	error?:
		| Error
		| {
				message: string
				stack?: string
				cause?: unknown
		  }
}

/**
 * Log messages with different severity levels
 * @param level - the severity level of the logger
 */
export class Logger {
	#level: LogLevel = 'info'

	constructor(level: LogLevel = 'info') {
		this.#level = level
	}

	set level(level: LogLevel) {
		this.#level = level
	}

	get level() {
		return this.#level
	}

	log(level: LogLevel, message: string, error?: Error) {
		if (LEVELS[level] < LEVELS[this.#level]) return

		const entry: LogEntry = {
			ts: Date.now(),
			level,
			message,
		}

		if (level === 'error' || level === 'fatal') {
			entry.error = error ? new Error(message, { cause: error }) : new Error(message)
		}

		console.log(
			`[${NAME}] [${entry.ts}] [${level.toUpperCase()}] ${message}`,
			error ? `\n${error.stack}` : '',
		)
	}

	debug(message: string) {
		this.log('debug', message)
	}

	info(message: string) {
		this.log('info', message)
	}

	warn(message: string) {
		this.log('warn', message)
	}

	error(message: string, error?: unknown) {
		this.log('error', message, Logger.toError(error))
	}

	fatal(message: string, error?: unknown) {
		this.log('fatal', message, Logger.toError(error))
	}

	static toError(err: unknown) {
		return err instanceof Error ? err : new Error(String(err), { cause: err })
	}

	static print(err: unknown) {
		if (err instanceof Error) {
			return err.message + (err.stack ? `\n${err.stack}` : '')
		}

		if (typeof err === 'object' && err !== null) {
			return JSON.stringify(err, null, 2)
		}

		return String(err)
	}
}

export const logger = new Logger(Bun.env.PROD ? 'error' : 'debug')
