# @jk2908/mdsrc

A Vite plugin for managing markdown content with type safety.

## Install

```sh
npm install @jk2908/mdsrc
```

## Usage

```ts
import plugin from '@jk2908/mdsrc'
import comark from '@comark/markdown-it'
import { defineConfig } from 'vite'

export default defineConfig({
	plugins: [
		plugin({
			plugins: [comark],
			collections: [
				{
					dir: 'content',
					name: 'post',
					schema: {
						title: { type: 'string' },
					},
				},
			],
		}),
	],
})
```

The plugin reads markdown content, validates frontmatter against your schema, and generates typed modules during build and watch. Root config uses `collections`, optional `plugins`, and `logger`. Collection config uses `name`, `dir`, and `schema`.

Each entry exports both `html` and `markdown`.

- `html` is rendered with `markdown-it`, with hard line breaks preserved.
- Raw HTML is escaped by default because the renderer runs with `html: false`.
- `markdown` preserves the original body for custom renderers like `@comark/react`.

Root `plugins` accepts markdown-it plugins directly or tuples like `[plugin, ...args]` and applies them to every collection.

See `examples/basic` for the default HTML output flow and `examples/components` for the shared `@comark/markdown-it` plugin used with React.

If you configure a collection with `name: 'post'`, `mdsrc` exposes `allPosts` from the package root.

```ts
import { allPosts } from '@jk2908/mdsrc'

export const summaries = allPosts.map(post => ({
	title: post.title,
	slug: post.__mdsrc.slug,
	html: post.html,
	markdown: post.markdown,
}))
```

If you want the generated collection module directly, you can also import the collection subpath.

```ts
import { allPosts } from '@jk2908/mdsrc/post'
```

The generated files live in `./.mdsrc` on disk, so you can import them directly via paths like `./.mdsrc/index.js`, but `.mdsrc` itself is not a module ID the plugin resolves. The stable import IDs are `@jk2908/mdsrc` and `@jk2908/mdsrc/<collection>`.

## License

MIT