import { defineConfig } from 'vite'

import comark from '@comark/markdown-it'
import mdsrc from '@jk2908/mdsrc'
import solas from '@jk2908/solas'
import react from '@vitejs/plugin-react'

export default defineConfig({
	plugins: [
		solas({
			url: 'http://localhost:8787',
		}),
		react(),
		mdsrc({
			plugins: [comark],
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
