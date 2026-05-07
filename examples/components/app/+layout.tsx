import { Comark } from '@comark/react'
import { allPosts } from '@jk2908/mdsrc'

import { Alert } from './components/alert'

export default function Layout() {
	return (
		<html lang="en">
			<head>
				<meta charSet="UTF-8" />
				<meta name="viewport" content="width=device-width, initial-scale=1.0" />
			</head>

			<body>
				<h1>mdsrc components example</h1>

				<p>
					Markdown and HTML are both exported. This example renders the markdown field
					with Comark in React.
				</p>

				{allPosts.map(post => (
					<article key={post.__mdsrc.slug}>
						<h2>{post.title}</h2>

						<Comark components={{ alert: Alert }}>{post.markdown}</Comark>
					</article>
				))}
			</body>
		</html>
	)
}
