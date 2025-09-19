import { readFile, writeFile } from 'node:fs/promises';
import { defineBuildConfig } from 'unbuild';

export default defineBuildConfig({
	name: '@databuddy/sdk',
	entries: [
		'./src/core/index.ts',
		'./src/react/index.ts',
		'./src/vue/index.ts',
	],
	externals: ['react', 'react-dom', 'vue', 'jotai'],
	declaration: true,
	hooks: {
		'build:done': async () => {
			const file = await readFile('./dist/react/index.mjs', 'utf-8');
			await writeFile('./dist/react/index.mjs', `'use client';\n\n${file}`);
		},
	},
});
