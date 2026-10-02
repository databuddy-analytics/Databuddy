import { build, file, gzipSync } from "bun";

const DOCUMENTED_GZIP_BUDGET_BYTES = 13.5 * 1024;

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

const gzipBytes = gzipSync(await file("./dist/databuddy.js").bytes(), {
	level: 9,
}).length;
if (gzipBytes > DOCUMENTED_GZIP_BUDGET_BYTES) {
	throw new Error(
		`databuddy.js is ${gzipBytes} bytes gzipped, over the ${DOCUMENTED_GZIP_BUDGET_BYTES} the docs round to "13 KB". Trim the tracker, or update the size copy and this budget together.`
	);
}

console.log(`Build completed! databuddy.js is ${gzipBytes} bytes gzipped.`);
