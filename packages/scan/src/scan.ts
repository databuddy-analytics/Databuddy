import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	lstat,
	mkdir,
	open,
	readFile,
	realpath,
	rename,
	writeFile,
} from "node:fs/promises";
import { join } from "node:path";
import pLimit from "p-limit";
import { z } from "zod";
import { collectCoverage, coverageNote } from "./catalog";
import {
	type Attempt,
	type Catalog,
	createRequest,
	parseResponse,
	readUsage,
	requestEvaluation,
	rowSchema,
	type Row,
	type Segment,
} from "./evaluate";
import type { Snapshot } from "./terminal";

export const scanOptionsSchema = z.object({
	root: z.string().trim().min(1).default("."),
	output: z.string().trim().min(1).optional(),
	run: z.boolean().default(false),
	fresh: z.boolean().default(false),
	cacheOnly: z.boolean().default(false),
	// Grouped extraction beats whole-file chunks on a 190-item labelled intersection: covered precision
	// 51.6% -> 93.9%, p=0.027, at 2.4x the speed. Files that parse with no action are not reviewed.
	actions: z.boolean().default(true),
	concurrency: z.coerce.number().int().positive().default(8),
	// Label agreement against solo classification holds at 2-4 segments and falls off by 8, so cap at 4.
	batchFiles: z.coerce.number().int().positive().max(8).default(4),
});
const timeoutMs = 15_000;
// Failure rate climbs with request size: 26% at 30-40KB, 34% at 40-50KB, 94% above 70KB.
const maxRequestBytes = 48_000;
const attemptSchema = z.object({
	attempt: z.number(),
	ms: z.number(),
	status: z.number().nullable(),
	error: z.string().optional(),
	providerCode: z.string().optional(),
	requestId: z.string().optional(),
});
const callSchema = z.object({
	batch: z.number(),
	depth: z.number(),
	cacheKey: z.string(),
	requestBytes: z.number(),
	cached: z.boolean(),
	split: z.boolean(),
	ms: z.number(),
	inputTokens: z.number(),
	costUsd: z.number().nullable(),
	attempts: z.array(attemptSchema),
	error: z.string().optional(),
});
export const resultSchema = z.object({
	summary: z.object({
		root: z.string(),
		head: z.string().nullable(),
		model: z.string(),
		runId: z.string(),
		finishedAt: z.string(),
		sourceHash: z.string(),
		cacheOnly: z.boolean(),
		interrupted: z.boolean(),
		includedFiles: z.number(),
		skippedFiles: z.number(),
		classifiedFiles: z.number(),
		segments: z.number(),
		classifiedSegments: z.number(),
		batches: z.number(),
		oversizedBatches: z.number(),
		splitBatches: z.number(),
		completedBatches: z.number(),
		unattemptedBatches: z.number(),
		failures: z.number(),
		cachedBatches: z.number(),
		requestAttempts: z.number(),
		retries: z.number(),
		wallSeconds: z.number(),
		currentRunReportedCostUsd: z.number(),
		unknownFailedCallCosts: z.number(),
		missingCostReports: z.number(),
	}),
	rows: z.array(rowSchema),
	calls: z.array(callSchema),
});
export type ScanResult = z.infer<typeof resultSchema>;
type Call = z.infer<typeof callSchema>;
interface InventoryFile {
	characters?: number;
	path: string;
	reason?: string;
	segments?: number;
	sha256?: string;
	status: "included" | "excluded";
}
export const hash = (value: string) =>
	createHash("sha256").update(value).digest("hex");
const excluded =
	/(?:^|\/)(?:tests?|__tests__|fixtures?|__fixtures__|__mocks__|examples?|playground|node_modules|dist|\.next|\.agents|\.codex|vendor)(?:\/|$)|\.(?:test|spec|stories|generated|d)\.[^.]+$/i;
const sourceFile = /\.(?:[cm]?[jt]sx?|vue|swift|py|sh|sql|html|css)$/;
const sourceLineBoundary = /(?<=\n)/;
const secret =
	/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:sk_live_|sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{20,}/;
const trackingCall =
	/\b((?:[\w$]+\.)?(?:track[A-Z]\w*|track|capture|logEvent))\s*\(/;
const closers: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const trailingSeparator = /[\s,]+$/;
const whitespaceRun = /\s+/g;
// The argument as written identifies the event; a bare string search picks up nested property values
// instead. A truncated object argument still has to read as source, not as `track({ name: 'x',)`.
function firstArgument(text: string) {
	const open: string[] = [];
	let argument = "";
	for (const character of text) {
		if (character in closers) {
			open.push(character);
		} else if (")]}".includes(character)) {
			if (open.length === 0) {
				break;
			}
			open.pop();
		} else if (character === "," && open.length === 0) {
			break;
		}
		argument += character;
		if (argument.length > 72) {
			break;
		}
	}
	return (
		argument.trim().replace(whitespaceRun, " ").replace(trailingSeparator, "") +
		open
			.reverse()
			.map((character) => closers[character])
			.join("")
	);
}
const safeError =
	/^(?:Gateway HTTP [0-9]{3}|No matching cached response; network disabled)$/;
const shedError = /^(?:Gateway HTTP 5[0-9]{2}|Gateway request timed out)$/;
const splitDepth = 2;
const keyHelp = "Check the key, or unset it to use Databuddy's scan API.";
const catalogByteLimit = 24_000;

export async function readJSON(path: string): Promise<unknown> {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return null;
		}
		throw error;
	}
}
async function saveJSON(path: string, value: unknown) {
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
	await rename(temporary, path);
}
export function splitSource(path: string, content: string): Segment[] {
	const segments: Segment[] = [];
	let source = "",
		start = 1,
		line = 1;
	// Line chunks preserve all source; cross-chunk control flow still needs review.
	for (const text of content.split(sourceLineBoundary)) {
		if (text.length > 24_000) {
			throw new Error("oversized_source_line");
		}
		if (source && source.length + text.length > 24_000) {
			segments.push({ path, start, end: line - 1, source });
			source = "";
			start = line;
		}
		source += text;
		line++;
	}
	if (source) {
		segments.push({ path, start, end: line - 1, source });
	}
	return segments;
}

// The gateway sheds load on large prompts, and source characters mispredict request bytes, so pack by
// measured cost. maxRequestBytes is a packing budget, not a hard cap: a segment whose own cost exceeds
// it still ships alone, because splitting one segment's source would break the thing being judged.
// Those requests are counted as oversizedBatches.
export function planRequests(
	segments: Segment[],
	catalog: Catalog,
	batchFiles: number
): { body: string; jobs: Segment[] }[] {
	const build = (jobs: Segment[]) => createRequest(jobs, catalog);
	const overhead = Buffer.byteLength(build([]));
	const budget = Math.max(1, maxRequestBytes - overhead);
	const batches: Segment[][] = [];
	let batch: Segment[] = [],
		size = 0;
	for (const segment of segments) {
		const cost = Buffer.byteLength(build([segment])) - overhead;
		if (batch.length && (size + cost > budget || batch.length >= batchFiles)) {
			batches.push(batch);
			batch = [];
			size = 0;
		}
		batch.push(segment);
		size += cost;
	}
	if (batch.length) {
		batches.push(batch);
	}
	return batches.map((jobs) => ({ body: build(jobs), jobs }));
}

export async function readSources(root: string) {
	const inventory: InventoryFile[] = [],
		sources = new Map<string, string>(),
		tracking = new Set<string>();
	for (const path of execFileSync("git", ["ls-files", "-z"], {
		cwd: root,
		encoding: "utf8",
		// A large monorepo's path listing exceeds the default child-process buffer.
		maxBuffer: 64 * 1024 * 1024,
	})
		.split("\0")
		.filter(Boolean)
		.sort()) {
		if (!sourceFile.test(path) || excluded.test(path)) {
			inventory.push({
				path,
				status: "excluded",
				reason: "non-runtime/source-or-test",
			});
			continue;
		}
		try {
			const sourcePath = join(root, path);
			if (
				(await lstat(sourcePath)).isSymbolicLink() ||
				(await realpath(sourcePath)) !== sourcePath
			) {
				inventory.push({ path, status: "excluded", reason: "symbolic_link" });
				continue;
			}
			const content = await readFile(sourcePath, "utf8");
			if (secret.test(content)) {
				inventory.push({
					path,
					status: "excluded",
					reason: "possible embedded secret",
				});
				continue;
			}
			const chunks = splitSource(path, content);
			sources.set(path, content);
			inventory.push({
				path,
				status: "included",
				sha256: hash(content),
				characters: content.length,
				segments: chunks.length,
			});
			const lines = content.split("\n");
			for (const [index, line] of lines.entries()) {
				const call = trackingCall.exec(line);
				if (!call) {
					continue;
				}
				const signature = `${call[1]}(${firstArgument(
					lines
						.slice(index, index + 2)
						.join(" ")
						.slice(call.index + call[0].length, call.index + 260)
				)})`;
				tracking.add(signature);
			}
		} catch (error) {
			inventory.push({
				path,
				status: "excluded",
				reason:
					error instanceof Error && "code" in error
						? String(error.code)
						: error instanceof Error &&
								error.message === "oversized_source_line"
							? error.message
							: "unreadable",
			});
		}
	}
	// The whole catalog ships in every request, so it must never crowd out the source it describes.
	// Kept in measured priority order: shared producers carry coverage that locations alone cannot.
	let budget = catalogByteLimit;
	const trim = (entries: string[]) => {
		const kept: string[] = [];
		for (const entry of entries) {
			budget -= entry.length + 4;
			if (budget < 0) {
				return kept;
			}
			kept.push(entry);
		}
		return kept;
	};
	const coverage = collectCoverage(sources);
	const catalog = {
		trackingHelpers: trim(coverage.trackingHelpers),
		trackedRoutes: trim(coverage.trackedRoutes),
		warehouseWrites: trim(coverage.warehouseWrites),
		attributeTracking: trim(coverage.attributeTracking),
		directTrackingCandidates: trim(
			[...tracking].sort((left, right) => left.localeCompare(right))
		),
		note: `This is a lexical and syntactic index of possible tracking, deduplicated by call signature, not proof of coverage. Matches can be source examples, unrelated functions or wrappers. Verify executable source, event meaning and outcome before classifying covered. No matches does not prove missing coverage: shared procedures and imported callees may track elsewhere. Audit logs and usage metering alone are not product analytics. Static tracking code does not prove delivery. ${coverageNote}`,
	};
	return { inventory, sources, catalog };
}

export async function scan(
	options: z.infer<typeof scanOptionsSchema> & { output: string },
	onProgress: (snapshot: Snapshot) => void
) {
	const { root, output, cacheOnly, fresh, concurrency, batchFiles } = options;
	const run = options.run || fresh || cacheOnly;
	const git = (...args: string[]) =>
		execFileSync("git", args, {
			cwd: root,
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		});
	const previous = await readJSON(join(output, "inventory.json"));
	if (
		previous &&
		z.object({ root: z.string() }).parse(previous).root !== root
	) {
		throw new Error(
			"This output directory belongs to another repository. Choose another --output."
		);
	}
	let head: string | null = null;
	try {
		head = git("rev-parse", "--verify", "HEAD").trim();
	} catch {
		/* A newly initialized repository may have no commit. */
	}
	const { inventory, sources, catalog } = await readSources(root);
	const { groupActions } = options.actions
		? await import("./actions")
		: { groupActions: null };
	const segments: Segment[] = [];
	// A file the grouper parsed without finding an executable action has nothing to instrument; only
	// unsupported or unparsable files still fall back to whole-source review.
	const noActionFiles: string[] = [];
	for (const [path, source] of sources) {
		const actions = groupActions?.(path, source, sources);
		if (actions?.length) {
			for (const { start, end, source: context, ...action } of actions) {
				segments.push({ path, start, end, source: context, action });
			}
		} else if (actions) {
			noActionFiles.push(path);
		} else {
			segments.push(...splitSource(path, source));
		}
	}
	const includedFiles = new Set(segments.map((s) => s.path)).size;
	const sourceHash = hash(
		JSON.stringify(
			inventory
				.filter((f) => f.status === "included")
				.map((f) => [f.path, f.sha256])
		)
	);
	if (!cacheOnly) {
		await mkdir(join(output, "responses"), { recursive: true, mode: 0o700 });
		await saveJSON(join(output, "inventory.json"), {
			root,
			head,
			files: inventory,
			noActionFiles,
			catalog,
		});
	}
	if (!run) {
		return { includedFiles, skippedFiles: noActionFiles.length };
	}
	const batches = planRequests(segments, catalog, batchFiles);
	if (!(cacheOnly || process.env.AI_GATEWAY_API_KEY)) {
		try {
			process.loadEnvFile(join(root, ".env"));
		} catch (error) {
			if (
				!(error instanceof Error && "code" in error && error.code === "ENOENT")
			) {
				throw new Error("Could not load the repository .env.");
			}
		}
	}
	const apiKey = process.env.AI_GATEWAY_API_KEY?.trim() || undefined;
	const started = performance.now(),
		runId = randomUUID(),
		controller = new AbortController(),
		limit = pLimit(concurrency);
	const rows: Row[] = [],
		calls: Call[] = [];
	let plannedBatches = batches.length,
		interrupted = false,
		logFailure: unknown;
	// A cache replay is read-only, including diagnostics files.
	const logFile = cacheOnly
		? null
		: await open(join(output, "progress.ndjson"), "a", 0o600);
	let writes = Promise.resolve();
	const log = (type: string, fields: Record<string, unknown> = {}) => {
		if (!logFile) {
			return;
		}
		writes = writes.then(async () => {
			await logFile.write(
				`${JSON.stringify({ type, ...fields, at: new Date().toISOString(), runId })}\n`
			);
		});
		writes.catch((error) => {
			logFailure = error;
			controller.abort(error);
		});
	};
	const update = () =>
		onProgress({
			includedFiles,
			classifiedFiles: new Set(rows.map((r) => r.path)).size,
			batches: plannedBatches,
			completedBatches: calls.filter((c) => !c.split).length,
			active: limit.activeCount,
			retries: calls.reduce(
				(n, c) => n + Math.max(0, c.attempts.length - 1),
				0
			),
			failures: calls.filter((c) => c.error && !c.split).length,
			elapsedSeconds: (performance.now() - started) / 1000,
			rows,
			cacheOnly,
		});
	const cancel = () => {
		if (!interrupted) {
			interrupted = true;
			controller.abort(new Error("Interrupted by user"));
		}
	};
	process.on("SIGINT", cancel);
	process.on("SIGTERM", cancel);
	const refresh = setInterval(update, 100);
	refresh.unref();
	try {
		log("start", {
			pid: process.pid,
			root,
			head,
			sourceHash,
			concurrency,
			timeoutMs,
			includedFiles,
			batches: batches.length,
		});
		update();
		// A large request is far more likely to be shed than a small one, so a failed batch is retried as halves.
		const evaluateBatch = async (
			{ body, jobs }: { body: string; jobs: Segment[] },
			index: number,
			depth: number
		): Promise<void> => {
			if (controller.signal.aborted) {
				return;
			}
			const cacheKey = hash(body),
				cacheFile = join(output, "responses", `${cacheKey}.json`),
				at = performance.now();
			const attempts: Attempt[] = [],
				call: Call = {
					batch: index,
					depth,
					cacheKey,
					requestBytes: Buffer.byteLength(body),
					cached: false,
					split: false,
					ms: 0,
					inputTokens: 0,
					costUsd: null,
					attempts,
				};
			let response: unknown = null;
			log("batch_started", {
				batch: index,
				depth,
				cacheKey,
				requestBytes: call.requestBytes,
				files: jobs.map((j) => `${j.path}:${j.start}`),
			});
			try {
				if (!fresh) {
					try {
						response = await readJSON(cacheFile);
						if (response !== null) {
							parseResponse(response, jobs);
							call.cached = true;
						}
					} catch (error) {
						if (
							!(error instanceof SyntaxError || error instanceof z.ZodError)
						) {
							throw error;
						}
						log("cache_invalid", { batch: index, cacheKey });
					}
				}
				if (!call.cached) {
					response = null;
					if (cacheOnly) {
						throw new Error("No matching cached response; network disabled");
					}
					response = await requestEvaluation(body, {
						apiKey,
						run: { id: runId, mode: options.actions ? "actions" : "files" },
						timeoutMs,
						signal: controller.signal,
						onAttempt: (attempt) => {
							attempts.push(attempt);
							log("request_attempt", { batch: index, depth, ...attempt });
						},
						onRetry: (retry) => log("retry", { batch: index, ...retry }),
					});
				}
				const parsed = parseResponse(response, jobs);
				call.inputTokens = parsed.inputTokens;
				call.costUsd = parsed.costUsd;
				if (!call.cached) {
					await saveJSON(cacheFile, response);
				}
				rows.push(...parsed.rows);
			} catch (error) {
				const usage = readUsage(response);
				call.inputTokens = usage.inputTokens;
				call.costUsd = usage.costUsd;
				call.error = interrupted
					? "Interrupted by user"
					: error instanceof z.ZodError
						? "Invalid model response"
						: error instanceof Error && safeError.test(error.message)
							? error.message
							: error instanceof Error && error.name === "TimeoutError"
								? "Gateway request timed out"
								: error instanceof Error && "code" in error
									? `Scan failed (${String(error.code)})`
									: "Scan failed";
				call.split =
					!(cacheOnly || controller.signal.aborted) &&
					jobs.length > 1 &&
					depth < splitDepth &&
					shedError.test(call.error);
				if (
					attempts.some((a) => a.status === 401 || a.status === 403) ||
					logFailure
				) {
					controller.abort();
				}
			} finally {
				call.ms = Math.round(performance.now() - at);
				calls.push(call);
				log("batch_finished", {
					batch: index,
					depth,
					cached: call.cached,
					ms: call.ms,
					error: call.error,
					split: call.split,
					classifiedSegments: call.error ? 0 : jobs.length,
				});
				update();
			}
			if (call.split) {
				const half = Math.ceil(jobs.length / 2);
				const halves = [jobs.slice(0, half), jobs.slice(half)];
				plannedBatches += halves.length - 1;
				// Halves run inside this task's slot: taking new slots here can starve the limiter.
				for (const part of halves) {
					await evaluateBatch(
						{ body: createRequest(part, catalog), jobs: part },
						index,
						depth + 1
					);
				}
			}
		};
		const settled = await Promise.allSettled(
			batches.map((batch, index) => limit(() => evaluateBatch(batch, index, 0)))
		);
		const rejected = settled.find((result) => result.status === "rejected");
		if (rejected?.status === "rejected") {
			throw rejected.reason;
		}
		await writes;
		if (logFailure) {
			throw new Error("Could not write scan diagnostics.");
		}
		const statuses = calls.flatMap((c) => c.attempts).map((a) => a.status);
		const denied = statuses.find((status) => status === 401 || status === 403);
		if (apiKey && denied) {
			throw new Error(
				`Vercel AI Gateway rejected AI_GATEWAY_API_KEY (HTTP ${denied}). ${keyHelp}`
			);
		}
		if (!apiKey && statuses.includes(429)) {
			throw new Error(
				"Databuddy's scan API rate limit was reached. Try again later, or set AI_GATEWAY_API_KEY to use your own Vercel AI Gateway key."
			);
		}
		rows.sort(
			(a, b) =>
				b.priority - a.priority ||
				a.path.localeCompare(b.path) ||
				a.start - b.start
		);
		const summary: ScanResult["summary"] = {
			root,
			head,
			model: "typesafe-ai/jev",
			runId,
			finishedAt: new Date().toISOString(),
			sourceHash,
			cacheOnly,
			interrupted,
			includedFiles,
			skippedFiles: noActionFiles.length,
			classifiedFiles: new Set(rows.map((r) => r.path)).size,
			segments: segments.length,
			classifiedSegments: rows.length,
			batches: plannedBatches,
			oversizedBatches: calls.filter((c) => c.requestBytes > maxRequestBytes)
				.length,
			splitBatches: calls.filter((c) => c.split).length,
			completedBatches: calls.filter((c) => !c.split).length,
			unattemptedBatches: plannedBatches - calls.filter((c) => !c.split).length,
			failures: calls.filter((c) => c.error && !c.split).length,
			cachedBatches: calls.filter((c) => c.cached).length,
			requestAttempts: calls.reduce((n, c) => n + c.attempts.length, 0),
			retries: calls.reduce(
				(n, c) => n + Math.max(0, c.attempts.length - 1),
				0
			),
			wallSeconds: Math.round((performance.now() - started) / 100) / 10,
			currentRunReportedCostUsd: calls.reduce(
				(n, c) => n + (c.cached ? 0 : (c.costUsd ?? 0)),
				0
			),
			unknownFailedCallCosts: calls
				.flatMap((c) => c.attempts)
				.filter((a) => a.error).length,
			missingCostReports: calls.filter(
				(c) =>
					c.costUsd === null &&
					(c.cached || c.attempts.some((a) => a.status === 200 && !a.error))
			).length,
		};
		const result = { summary, rows, calls };
		if (!cacheOnly) {
			await saveJSON(join(output, "results.json"), result);
		}
		log("finished", { summary });
		await writes;
		return result;
	} finally {
		clearInterval(refresh);
		process.removeListener("SIGINT", cancel);
		process.removeListener("SIGTERM", cancel);
		controller.abort();
		await writes.catch(() => {
			/* The awaited write reports the failure. */
		});
		await logFile?.close();
	}
}
