import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

import type { EvalRun } from "../src/types";

declare const Bun: typeof globalThis.Bun;

const PORT = Number(process.env.EVAL_UI_PORT ?? 3002);
const RESULTS_DIR = join(import.meta.dir, "..", "results");
const UI_DIR = import.meta.dir;

async function readRun(path: string): Promise<EvalRun | null> {
	try {
		const content = await readFile(path, "utf-8");
		const run = JSON.parse(content) as EvalRun;
		return run?.summary?.total > 0 && run.model && run.timestamp ? run : null;
	} catch {
		return null;
	}
}

async function readRuns(): Promise<EvalRun[]> {
	let dirs: string[];
	try {
		dirs = (await readdir(RESULTS_DIR, { withFileTypes: true }))
			.filter((dirent) => dirent.isDirectory())
			.map((dirent) => dirent.name)
			.sort();
	} catch {
		return [];
	}

	const runs = await Promise.all(
		dirs.flatMap(async (dir) => {
			const modelDir = join(RESULTS_DIR, dir);
			const files = [join(modelDir, "latest.json")];
			try {
				const historyFiles = await readdir(join(modelDir, "runs"));
				files.push(
					...historyFiles
						.filter((file) => file.endsWith(".json"))
						.map((file) => join(modelDir, "runs", file))
				);
			} catch {
				// Historical runs are optional.
			}
			return Promise.all(files.map(readRun));
		})
	);

	const byKey = new Map<string, EvalRun>();
	for (const run of runs.flat().filter((run): run is EvalRun => !!run)) {
		byKey.set(`${run.model}:${run.timestamp}`, run);
	}

	return [...byKey.values()].sort(
		(a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
	);
}

Bun.serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);

		if (url.pathname === "/api/results") {
			return Response.json(await readRuns(), {
				headers: { "Cache-Control": "no-store" },
			});
		}

		if (url.pathname === "/" || url.pathname === "/index.html") {
			const html = await readFile(join(UI_DIR, "index.html"), "utf-8");
			return new Response(html, {
				headers: { "Content-Type": "text/html; charset=utf-8" },
			});
		}

		return new Response("Not found", { status: 404 });
	},
});

console.log(`Eval UI running at http://localhost:${PORT}`);
