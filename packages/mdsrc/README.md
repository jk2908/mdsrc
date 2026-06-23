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

The plugin reads markdown content, validates frontmatter against your schema, and generates typed modules during build and watch. Root config uses `collections`, optional `compileOptions`, and `logger`. Collection config uses `name`, `dir`, and `schema`.

### Schema

Fields are declared as `fieldName: 'type'`. Supported types: `string`, `number`, `boolean`, `date`, `object`.

Optional fields use a `?` suffix: `'metadata?': { author: 'string' }`.

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

Pass `compileOptions` to customize markdown parsing via satteri:

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

Available features:
- `gfm` - GitHub Flavored Markdown (tables, footnotes, strikethrough, task lists). Pass `{ footnotes: false }` to disable footnotes only.
- `frontmatter` - YAML and TOML frontmatter parsing.
- `math` - LaTeX math blocks (`$inline$` and `$$display$$`). Pass `{ singleDollarTextMath: false }` to keep `$` as literal text.
- `smartPunctuation` - Curly quotes, em-dashes, ellipses. Pass `{ quotes: false, dashes: true, ellipses: true }` for granular control.
- `headingAttributes` - Heading IDs and classes (`# Title {#id .class}`).
- `directive` - Container directives (`:::note`).
- `superscript` / `subscript` - `^super^` and `~sub~` syntax.
- `wikilinks` - Obsidian-style `[[links]]`.

### Output

Each entry exports a `body` field containing the rendered HTML.

If you configure a collection with `name: 'post'`, `mdsrc` exposes `allPosts` from the package root.

```ts
import { allPosts } from '@jk2908/mdsrc'

export const summaries = allPosts.map(post => ({
	title: post.title,
	slug: post.__mdsrc.slug,
	body: post.body,
}))
```

If you want the generated collection module directly, you can also import the collection subpath.

```ts
import { allPosts } from '@jk2908/mdsrc/post'
```

The generated files live in `./.mdsrc` on disk, so you can import them directly via paths like `./.mdsrc/index.js`, but `.mdsrc` itself is not a module ID the plugin resolves. The stable import IDs are `@jk2908/mdsrc` and `@jk2908/mdsrc/<collection>`.

## License

MIT
