import { defineConfig } from 'vite'

import mdsrc from '@jk2908/mdsrc'
import babel from '@rolldown/plugin-babel'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
	plugins: [
		mdsrc({
			compileOptions: {},
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
				{
					name: 'Projects',
					dir: 'projects',
					schema: {
						name: 'string',
						date: 'string|number',
						'members?': 'array',
					},
				},
			],
		}),
		react(),
		babel({ presets: [reactCompilerPreset()] }),
	],
})
