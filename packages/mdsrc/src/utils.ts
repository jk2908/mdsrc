export function capitalise(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1)
}

export function pluralise(str: string, count: number) {
	return count === 1 ? str : str.endsWith('s') ? str : `${str}s`
}

export function singularise(str: string, suffix = 's') {
	return str.endsWith(suffix) ? str.slice(0, -suffix.length) : str
}

export function debounce<T extends unknown[]>(fn: (...args: T) => void, wait: number) {
	let timeoutId: ReturnType<typeof setTimeout> | null = null

	return (...args: T) => {
		if (timeoutId) {
			clearTimeout(timeoutId)
		}

		timeoutId = setTimeout(() => {
			fn.apply(null, args)
		}, wait)
	}
}

export function dedent(str: string) {
	return str
		.replace(/^\n/, '')
		.replace(/\s+$/, '')
		.split('\n')
		.filter(Boolean)
		.map(line => line.replace(/^\s+/, ''))
		.join('\n')
}

/**
 * Dedent an interpolated template literal, keeping the indentation of multiline
 * substitutions so generated source reads the way it is authored.
 */
export function source(
	strings: TemplateStringsArray,
	...values: Array<string | number | boolean | false | null | undefined>
) {
	let text = strings[0] ?? ''

	for (let index = 0; index < values.length; index += 1) {
		const value = values[index]
		const indentation = text.match(/(?:^|\n)([ \t]*)$/)?.[1] ?? ''
		const chunk = value === false || value == null ? '' : String(value)

		text += chunk.replace(/\n/g, `\n${indentation}`)
		text += strings[index + 1] ?? ''
	}

	const lines = text.replace(/^\n+|\n+$/g, '').split('\n')
	const margin = lines
		.filter(line => line.trim().length > 0)
		.reduce((smallest, line) => {
			const indentation = line.match(/^[ \t]*/)?.[0].length ?? 0

			return Math.min(smallest, indentation)
		}, Number.POSITIVE_INFINITY)

	if (!Number.isFinite(margin) || margin === 0) return lines.join('\n')

	return lines.map(line => line.slice(margin)).join('\n')
}

export function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function deep(obj: any, path: string, value: unknown) {
	const parts = path.split('.')
	let cur = obj

	for (let i = 0; i < parts.length - 1; i++) {
		const k = parts[i]
		cur[k] ??= {}
		cur = cur[k]
	}

	cur[parts.at(-1)!] = value
}

export function slugify(str: string) {
	return str.toLowerCase().replace(/\s/g, '-')
}
