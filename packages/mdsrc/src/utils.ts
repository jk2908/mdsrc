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
