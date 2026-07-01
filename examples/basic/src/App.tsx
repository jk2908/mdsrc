import { allPosts, allProjects } from '@jk2908/mdsrc'

import { H1 } from '../ui/h1'
import { P } from '../ui/p'

function App() {
	return (
		<>
			{allPosts.map(p => (
				<div key={p.__mdsrc.slug}>
					<h2>{p.title}</h2>

					<span>{p.metadata?.author}</span>

					{p.html && <div dangerouslySetInnerHTML={{ __html: p.html }} />}
				</div>
			))}

			{allProjects.map(p => {
				return (
					<div key={p.__mdsrc.slug}>
						<h2>{p.name}</h2>

						<span>{p.date}</span>

						{p.html && <div dangerouslySetInnerHTML={{ __html: p.html }} />}
						{p.Component && <p.Component components={{ p: P, h1: H1 }} />}

						{p.members?.map(m => (
							<span key={m}>{m}</span>
						))}
					</div>
				)
			})}
		</>
	)
}

export default App
