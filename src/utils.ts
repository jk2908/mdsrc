export function capitalise(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1)
}

export function pluralise(str: string, count: number) {
	return count === 1 ? str : str.endsWith('s') ? str : `${str}s`
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
