import React from 'react'

export function H1({ children, style, ...rest }: React.ComponentPropsWithRef<'h1'>) {
	return (
		<h1 style={{ ...style, fontSize: '48px' }} {...rest}>
			{children}
		</h1>
	)
}
