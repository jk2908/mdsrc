# @jk2908/mdsrc

A Vite plugin for managing markdown content with type safety.

## Install

```sh
npm install @jk2908/mdsrc
```

## Usage

```ts
import plugin from '@jk2908/mdsrc'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		plugin([
			{
				dir: 'content',
				name: 'post',
				schema: {
					title: { type: 'string' },
				},
			},
		]),
	],
})
```

The plugin reads markdown content, validates frontmatter against your schema, and generates typed modules during build and watch. Collection config currently uses `name`, `dir`, and `schema`.

If you configure a collection with `name: 'post'`, the generated module exports `allPosts` from the package root.

```ts
import { allPosts } from '.mdsrc'

export const summaries = allPosts.map(post => ({
	title: post.title,
	slug: post.__mdsrc.slug,
}))
```

## License

MIT