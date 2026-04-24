import { readFile, writeFile } from "node:fs/promises";
import { defineBuildConfig } from "unbuild";

export default defineBuildConfig({
	name: "@databuddy/devtools",
	entries: [
		"./src/core/index.ts",
		"./src/react/index.ts",
		"./src/vue/index.ts",
	],
	failOnWarn: false,
	externals: ["react", "vue"],
	rollup: {
		emitCJS: false,
		esbuild: {
			jsx: "automatic",
			jsxImportSource: "preact",
			minify: false,
		},
	},
	declaration: true,
	hooks: {
		"build:done": async () => {
			try {
				const file = await readFile("./dist/react/index.mjs", "utf-8");
				if (!file.startsWith("'use client';")) {
					await writeFile("./dist/react/index.mjs", `'use client';\n\n${file}`);
				}
			} catch (error) {
				console.error('Failed to add "use client" directive:', error);
			}
		},
	},
});
