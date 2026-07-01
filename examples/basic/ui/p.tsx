export function P({ children, style, ...rest }: React.ComponentPropsWithRef<'p'>) {
	return (
		<p style={{ ...style, background: 'red' }} {...rest}>
			{children}
		</p>
	)
}
