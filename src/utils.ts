export const capitalise = (str: string) => str.charAt(0).toUpperCase() + str.slice(1)

export const pluralise = (str: string, count: number) =>
	count === 1 ? str : str.endsWith('s') ? str : `${str}s`
