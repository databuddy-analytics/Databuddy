import { build } from "bun";

const common = {
	target: "browser",
	format: "iife",
	minify: true,
} as const;

const entrypoints = [
	{ src: "./src/index.ts", name: "databuddy" },
	{ src: "./src/vitals.ts", name: "vitals" },
	{ src: "./src/errors.ts", name: "errors" },
];

for (const { src, name } of entrypoints) {
	await build({
		...common,
		entrypoints: [src],
		outdir: "./dist",
		naming: `${name}.js`,
		define: {
			"process.env.DATABUDDY_DEBUG": "false",
		},
	});
}

for (const { src, name } of entrypoints) {
	await build({
		...common,
		entrypoints: [src],
		outdir: "./dist",
		naming: `${name}-debug.js`,
		define: {
			"process.env.DATABUDDY_DEBUG": "true",
		},
	});
}

console.log("Build completed!");
