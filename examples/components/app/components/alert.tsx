import type { ReactNode } from 'react'

type AlertProps = {
	type?: 'info' | 'warning' | 'error' | 'success'
	children?: ReactNode
}

const tones = {
	info: '#dbeafe',
	warning: '#fef3c7',
	error: '#fee2e2',
	success: '#dcfce7',
} satisfies Record<NonNullable<AlertProps['type']>, string>

export function Alert({ type = 'info', children }: AlertProps) {
	return (
		<div
			style={{
				backgroundColor: tones[type],
				borderRadius: '0.75rem',
				padding: '1rem',
				marginBlock: '1rem',
			}}>
			<strong
				style={{ display: 'block', marginBottom: '0.5rem', textTransform: 'capitalize' }}>
				{type}
			</strong>
			<div>{children}</div>
		</div>
	)
}
