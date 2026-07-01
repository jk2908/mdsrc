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
		plugin({
			collections: [
				{
					dir: 'content',
					name: 'post',
					schema: {
						title: 'string',
						'date?': 'date',
					},
				},
			],
		}),
	],
})
```

The plugin reads markdown and MDX content, validates frontmatter against your schema, and generates typed modules during build and watch. Root config uses `collections`, optional `compileOptions`, and `logger`. Collection config uses `name`, `dir`, and `schema`.

### Schema

Fields are declared as `fieldName: 'type'`. Supported types: `string`, `number`, `boolean`, `date`, `array`.

Optional fields use a `?` suffix: `'metadata?': { author: 'string' }`.

Multiple types can be combined with `|`:

```ts
schema: {
	val: 'string|number',
}
```

Validation modifiers are supported:

- `min`: 
	- strings: minimum string length
	- numbers: minimum value
	- dates: earliest allowed date
	- arrays: minimum array length

- `max`:
	- strings: maximum string length
	- numbers: maximum value
	- dates: latest allowed date
	- arrays: maximum array length

```ts
schema: {
	title: 'string|min=3|max=6',
	age: 'number|min=18',
	date: 'date|max=1735689600000',
	tags: 'array|min=2',
}
```

Nested objects are declared inline:

```ts
schema: {
	title: 'string',
	'metadata?': {
		author: 'string',
		publishedAt: 'date',
	},
}
```

### Compile Options

Pass `compileOptions` to customise markdown parsing via satteri:

```ts
plugin({
	compileOptions: {
		features: {
			gfm: true, // tables, footnotes, strikethrough, task lists
			frontmatter: true, // YAML (---) and TOML (+++)
			math: false, // LaTeX math blocks
			smartPunctuation: true, // curly quotes, em-dashes, ellipses
		},
		mdastPlugins: [/* transform mdast tree */],
		hastPlugins: [/* transform hast tree */],
	},
	collections: [/* ... */],
})
```

See [satteri](https://satteri.bruits.org/) for the full list of compile options and feature toggles.

### Output

Each entry exports a `html` field containing the rendered HTML for markdown files, or a `Component` field for MDX files.

If you configure a collection with `name: 'post'`, `mdsrc` exposes `allPosts` from the package root.

```ts
import { allPosts } from '@jk2908/mdsrc'

export const summaries = allPosts.map(post => ({
	title: post.title,
	slug: post.__mdsrc.slug,
	html: post.html,
}))
```

#### Using MDX Components

For `.mdx` files, the generated entry includes a `Component` that you can render in your application. You can also pass custom components to it.

For example, to render a post and provide a custom `h1` component:

```tsx
import { allPosts } from '@jk2908/mdsrc'

const post = allPosts.find(p => p.__mdsrc.slug === 'my-first-post')
const H1 = ({ children }) => <h1 style={{ color: 'red' }}>{children}</h1>

export function Post() {
	if (!post || !post.Component) return <div>Not found</div>

	return <post.Component components={{ h1: H1 }} />
}
```

If you want the generated collection module directly, you can also import the collection subpath.

```ts
import { allPosts } from '@jk2908/mdsrc/post'
```

The generated files live in `./.mdsrc` on disk, so you can import them directly via paths like `./.mdsrc/index.js`, but `.mdsrc` itself is not a module ID the plugin resolves. The stable import IDs are `@jk2908/mdsrc` and `@jk2908/mdsrc/<collection>`.

## License

MIT
