import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
	name: '@databuddy/sdk',
	entries: [
		'./src/core/index.ts',
		'./src/react/index.ts',
		'./src/vue/index.ts',
		'./src/node/index.ts',
		'./src/ai/vercel/index.ts',
	],
	externals: ['react', 'react-dom', 'vue', 'jotai', '@ai-sdk/provider', 'ai', 'tokenlens', 'msw'],
	declaration: true,
	alias: {
		'@': resolve(__dirname, 'src'),
	},
	hooks: {
		'build:done': async () => {
			try {
				const file = await readFile('./dist/react/index.mjs', 'utf-8');
				await writeFile('./dist/react/index.mjs', `'use client';\n\n${file}`);
			} catch (error) {
				console.error('Failed to add "use client" directive:', error);
			}
		},
	},
});
