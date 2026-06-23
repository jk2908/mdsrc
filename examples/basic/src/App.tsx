import { allPosts } from '@jk2908/mdsrc'

function App() {
	return (
		<>
			{allPosts.map(p => (
				<div key={p.__mdsrc.slug}>
					<h2>{p.title}</h2>

					<span>{p.metadata?.author}</span>

					<div dangerouslySetInnerHTML={{ __html: p.body }} />
				</div>
			))}
		</>
	)
}

export default App
