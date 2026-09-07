import { write } from "bun";
import { AsyncLocalStorage } from "node:async_hooks";
import { appendFileSync, existsSync, mkdirSync } from "node:fs";
import { resolve } from "node:path";

// Only provider credentials from the invoking environment are used. No cache/database clients.
const out = resolve(
	process.argv[2] ??
		"/private/tmp/databuddy-durable-context-20260907/artifacts/evals/collection-1"
);
if (existsSync(out)) {
	throw new Error(`Refusing to overwrite prior attempt: ${out}`);
}
mkdirSync(out, { recursive: true });
process.env.DATABASE_URL = "postgresql://eval@127.0.0.1:1/eval";
process.env.REDIS_URL = "redis://127.0.0.1:1";
const context = new AsyncLocalStorage<string>();
const emit = (event: string, value: unknown) =>
	appendFileSync(
		`${out}/trace.jsonl`,
		`${JSON.stringify({ at: new Date().toISOString(), page: context.getStore(), event, value })}\n`
	);
const original = globalThis.fetch;
globalThis.fetch = Object.assign(
	async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(input instanceof Request ? input.url : String(input));
		if (url.hostname !== "api.firecrawl.dev") {
			throw new Error(`Unexpected provider: ${url.origin}`);
		}
		const start = performance.now();
		emit("provider.request", {
			url: String(url),
			method: init?.method,
			body: typeof init?.body === "string" ? JSON.parse(init.body) : null,
		});
		try {
			const response = await original(input, init);
			emit("provider.response", {
				status: response.status,
				body: await response.clone().text(),
				ms: performance.now() - start,
			});
			return response;
		} catch (error) {
			emit("provider.error", {
				error:
					error instanceof Error
						? { name: error.name, message: error.message }
						: String(error),
				ms: performance.now() - start,
			});
			throw error;
		}
	},
	{ preconnect: original.preconnect }
);
const { readWebsitePage } = await import("@databuddy/ai/tools/scrape-page");
const paths = process.argv.slice(3);
if (paths.length === 0 || paths.length > 8) {
	throw new Error(
		"Provide 1–8 paths on the public target domain using BUSINESS_PROFILE_DOMAIN"
	);
}
const domain = process.env.BUSINESS_PROFILE_DOMAIN;
if (!domain) {
	throw new Error("BUSINESS_PROFILE_DOMAIN is required");
}
const cache = {
	read: async () => null,
	write: () => {
		throw new Error("Dry-run cache mutation");
	},
};
const start = performance.now();
const results: {
	path: string | undefined;
	elapsedMs: number;
	result: Awaited<ReturnType<typeof readWebsitePage>>;
}[] = [];
for (let index = 0; index < paths.length; index += 2) {
	const batch = await Promise.all(
		paths.slice(index, index + 2).map((path) =>
			context.run(path, async () => {
				const started = performance.now();
				const input = { domain, path, mutationMode: "dry-run" as const };
				emit("tool.request", input);
				const result = await readWebsitePage(input, cache);
				const entry = { path, elapsedMs: performance.now() - started, result };
				emit("tool.result", entry);
				console.log(
					JSON.stringify({
						path,
						elapsedMs: entry.elapsedMs,
						success: result.success,
						...(result.success
							? { chars: result.content.length, links: result.internalLinks }
							: { error: result.error }),
					})
				);
				return entry;
			})
		)
	);
	results.push(...batch);
	await write(
		`${out}/pages.json`,
		JSON.stringify(
			{
				collectedAt: new Date().toISOString(),
				elapsedMs: performance.now() - start,
				results,
			},
			null,
			2
		)
	);
}
