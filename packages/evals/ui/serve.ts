import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";

declare const Bun: typeof globalThis.Bun;

const PORT = Number(process.env.EVAL_UI_PORT ?? 3002);
const RESULTS_DIR = join(import.meta.dir, "..", "results");
const UI_DIR = import.meta.dir;

Bun.serve({
	port: PORT,
	async fetch(req) {
		const url = new URL(req.url);

		if (url.pathname === "/api/results") {
			try {
				const files = await readdir(RESULTS_DIR);
				const jsonFiles = files
					.filter((f) => f.endsWith(".json"))
					.sort()
					.reverse();
				const results = await Promise.all(
					jsonFiles.map(async (f) => {
						const content = await readFile(join(RESULTS_DIR, f), "utf-8");
						return JSON.parse(content);
					})
				);
				return Response.json(results, {
					headers: { "Content-Type": "application/json" },
				});
			} catch {
				return Response.json([], {
					headers: { "Content-Type": "application/json" },
				});
			}
		}

		// Serve index.html
		if (url.pathname === "/" || url.pathname === "/index.html") {
			const html = await readFile(join(UI_DIR, "index.html"), "utf-8");
			return new Response(html, {
				headers: { "Content-Type": "text/html" },
			});
		}

		return new Response("Not found", { status: 404 });
	},
});

console.log(`Eval UI running at http://localhost:${PORT}`);
