import { allPosts } from '@jk2908/mdsrc'

const app = document.querySelector<HTMLDivElement>('#app')

if (!app) {
	throw new Error('missing #app element')
}

const renderEntry = (title: string, html = '') => `
	<article>
		<h2>${title}</h2>
		<div>${html}</div>
	</article>
`

app.innerHTML = `
	<main>
		<h1>mdsrc basic example</h1>
		<p>HTML is exported with the default markdown renderer.</p>
		${allPosts.map(post => renderEntry(post.title, post.html)).join('')}
	</main>
`
