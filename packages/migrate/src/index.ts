#!/usr/bin/env bun
import { readFile, writeFile } from "node:fs/promises";
import { Glob } from "bun";
import { transform } from "./transform";

const PATTERN = "**/*.{ts,tsx,js,jsx,html,vue,svelte,mdx,astro}";
const IGNORE_SEGMENTS = [
	"node_modules",
	".next",
	"dist",
	".git",
	"build",
	".turbo",
	".vercel",
];

const args = process.argv.slice(2);
const write = args.includes("--write");
const quiet = args.includes("--quiet");
const roots = args.filter((arg) => !arg.startsWith("--"));
if (roots.length === 0) {
	roots.push(".");
}

let totalFiles = 0;
let totalChanges = 0;

for (const root of roots) {
	const glob = new Glob(PATTERN);
	for await (const path of glob.scan({ cwd: root, dot: false })) {
		if (IGNORE_SEGMENTS.some((seg) => path.includes(`${seg}/`))) {
			continue;
		}
		const fullPath = `${root.replace(/\/$/, "")}/${path}`;
		const content = await readFile(fullPath, "utf8");
		const { output, changes } = transform(content);
		if (changes === 0) {
			continue;
		}
		totalFiles += 1;
		totalChanges += changes;
		if (!quiet) {
			console.log(
				`${fullPath}: ${changes} replacement${changes === 1 ? "" : "s"}`
			);
		}
		if (write) {
			await writeFile(fullPath, output);
		}
	}
}

const verb = write ? "applied" : "would apply";
console.log(
	`\n${totalChanges} replacement${totalChanges === 1 ? "" : "s"} ${verb} across ${totalFiles} file${totalFiles === 1 ? "" : "s"}.`
);
if (totalChanges > 0 && !write) {
	console.log("Dry run. Re-run with --write to apply.");
	process.exit(1);
}
