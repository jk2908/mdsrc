import { defineConfig } from 'vite'

import mdsrc from '@jk2908/mdsrc'

export default defineConfig({
	plugins: [
		mdsrc({
			collections: [
				{
					name: 'post',
					dir: 'content/post',
					schema: {
						title: { type: 'string' },
					},
				},
			],
		}),
	],
})
