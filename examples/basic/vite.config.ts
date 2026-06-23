import { defineConfig } from 'vite'

import mdsrc from '@jk2908/mdsrc'
import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		mdsrc({
			collections: [
				{
					name: 'Posts',
					dir: 'posts',
					schema: {
						title: 'string',
						'metadata?': {
							author: 'string',
						},
					},
				},
			],
		}),
		react(),
		babel({ presets: [reactCompilerPreset()] }),
	],
})
