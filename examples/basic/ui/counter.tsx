import { useState } from 'react'

export function Counter(props: Omit<React.ComponentPropsWithRef<'button'>, 'onClick'>) {
	const [count, setCount] = useState(0)

	return (
		<button {...props} onClick={() => setCount(c => c + 1)}>
			Count: {count}
		</button>
	)
}
