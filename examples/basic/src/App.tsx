import { allPosts, allProjects } from '@jk2908/mdsrc'

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

			{allProjects.map(p => (
				<div key={p.__mdsrc.slug}>
					<h2>{p.name}</h2>

					<span>{p.date}</span>

					<div dangerouslySetInnerHTML={{ __html: p.body }} />

					{p.members?.map(m => (
						<span>{m}</span>
					))}
				</div>
			))}
		</>
	)
}

export default App
