import { execFileSync } from "node:child_process";
import { createHash, randomUUID } from "node:crypto";
import {
	access,
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
import type { Site } from "./actions";
import { collectCoverage, coverageNote } from "./catalog";
import {
	type Attempt,
	type Catalog,
	type JsonValue,
	createRequest,
	parseResponse,
	hostedScanUrl,
	requestEvaluation,
	rowSchema,
	type Row,
	type Segment,
} from "./evaluate";
import type { Snapshot } from "./terminal";

export const scanOptionsSchema = z.object({
	root: z.string().trim().min(1).default("."),
	output: z.string().trim().min(1).optional(),
	dryRun: z.boolean().default(false),
	fresh: z.boolean().default(false),
	cacheOnly: z.boolean().default(false),
	actions: z.boolean().default(true),
	concurrency: z.coerce.number().int().positive().default(8),
	batchFiles: z.coerce.number().int().positive().max(4).default(2),
});
const timeoutMs = 15_000;
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
	attempts: z.array(attemptSchema),
	error: z.string().optional(),
});
const resultSchema = z.object({
	summary: z.object({
		root: z.string(),
		scope: z.string(),
		head: z.string().nullable(),
		model: z.string(),
		runId: z.string(),
		finishedAt: z.string(),
		destination: z.object({
			host: z.string(),
			kind: z.enum(["databuddy", "gateway"]),
		}),
		zeroDataRetention: z.literal(true),
		interrupted: z.boolean(),
		includedFiles: z.number(),
		skippedFiles: z.number(),
		classifiedFiles: z.number(),
		batches: z.number(),
		unattemptedBatches: z.number(),
		failures: z.number(),
		cachedBatches: z.number(),
		requestAttempts: z.number(),
		retries: z.number(),
		wallSeconds: z.number(),
		warnings: z.array(z.string()),
	}),
	rows: z.array(rowSchema),
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
	/(?:^|\/)(?:tests?|__tests__|fixtures?|__fixtures__|__mocks__|examples?|playground|e2e|cypress|playwright|node_modules|dist|\.next|\.agents|\.codex|vendor)(?:\/|$)|\.(?:test|spec|stories|generated|d)\.[^.]+$/i;
const sourceFile =
	/\.(?:[cm]?[jt]sx?|vue|svelte|astro|swift|py|sh|sql|html?|css)$/;
const repositoryKey =
	/^[ \t]*(?:export[ \t]+)?AI_GATEWAY_API_KEY[ \t]*=[ \t]*(.*?)[ \t]*$/m;
const quoted = /^(["'])(.*)\1$/;
const routeHandlerLabel = /^(?:GET|POST|PUT|PATCH|DELETE)$/;
const reviewable = /\.(?:[cm]?[jt]sx?|vue|svelte|astro|swift|py)$/;
const sourceLineBoundary = /(?<=\n)/;
const secret =
	/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----|(?:sk_live_|sk-proj-|ghp_|github_pat_)[A-Za-z0-9_-]{20,}/;
const trackingCall =
	/\b((?:[\w$]+\.)?(?:track[A-Z]\w*|track|capture|logEvent))\s*\((?=\s*(?:["'`{]|[\w$]+\.[\w$]))/;
const closers: Record<string, string> = { "(": ")", "[": "]", "{": "}" };
const trailingSeparator = /[\s,]+$/;
const whitespaceRun = /\s+/g;
const routeArrow = / -> /;
const packageManifest = /(?:^|\/)package\.json$/;
const procedureCall =
	/\b[\w$]+\.(\w+)\.(\w+)\.(?:mutationOptions|queryOptions|infiniteOptions|call|mutate|mutateAsync)\b/g;
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

async function readJSON(path: string): Promise<JsonValue> {
	try {
		return JSON.parse(await readFile(path, "utf8"));
	} catch (error) {
		if (error instanceof Error && "code" in error && error.code === "ENOENT") {
			return null;
		}
		throw error;
	}
}
async function saveJSON(path: string, value: object | JsonValue) {
	const temporary = `${path}.${process.pid}.tmp`;
	await writeFile(temporary, JSON.stringify(value), { mode: 0o600 });
	await rename(temporary, path);
}
export function splitSource(path: string, content: string): Segment[] {
	const segments: Segment[] = [];
	let source = "",
		start = 1,
		line = 1;
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

export async function readSources(root: string, scope = "") {
	const inventory: InventoryFile[] = [],
		sources = new Map<string, string>(),
		indexed = new Map<string, string>(),
		workspace = new Set<string>(),
		tracking = new Set<string>();
	for (const path of execFileSync("git", ["ls-files", "-z"], {
		cwd: root,
		encoding: "utf8",
		maxBuffer: 64 * 1024 * 1024,
	})
		.split("\0")
		.filter(Boolean)
		.sort()) {
		if (packageManifest.test(path)) {
			try {
				const { name } = JSON.parse(await readFile(join(root, path), "utf8"));
				if (typeof name === "string") {
					workspace.add(name);
				}
			} catch {
				/* An unreadable manifest only loses first-party import detection. */
			}
		}
		const scoped = !scope || path === scope || path.startsWith(`${scope}/`);
		const record = (file: InventoryFile) => {
			if (scoped) {
				inventory.push(file);
			}
		};
		if (!sourceFile.test(path) || excluded.test(path)) {
			record({
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
				record({ path, status: "excluded", reason: "symbolic_link" });
				continue;
			}
			const content = await readFile(sourcePath, "utf8");
			if (secret.test(content)) {
				record({
					path,
					status: "excluded",
					reason: "possible embedded secret",
				});
				continue;
			}
			const chunks = splitSource(path, content);
			indexed.set(path, content);
			if (scoped) {
				sources.set(path, content);
			}
			record({
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
			record({
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
	const coverage = collectCoverage(indexed);
	const catalog = {
		trackedRoutes: trim(coverage.trackedRoutes),
		trackingHelpers: trim(coverage.trackingHelpers),
		warehouseWrites: trim(coverage.warehouseWrites),
		attributeTracking: trim(coverage.attributeTracking),
		directTrackingCandidates: trim(
			[...tracking].sort((left, right) => left.localeCompare(right))
		),
		note: `This is a lexical and syntactic index of possible tracking, deduplicated by call signature, not proof of coverage. Matches can be source examples, unrelated functions or wrappers. Verify executable source, event meaning and outcome before classifying covered. No matches does not prove missing coverage: shared procedures and imported callees may track elsewhere. Audit logs and usage metering alone are not product analytics. Static tracking code does not prove delivery. ${coverageNote}`,
	};
	return {
		inventory,
		sources,
		catalog,
		attributeListeners: coverage.attributeListeners,
		trackedRoutes: coverage.trackedRoutes,
		workspace,
	};
}

export interface Destination {
	host: string;
	kind: "databuddy" | "gateway";
}
export interface SentFile {
	lines: [number, number][];
	path: string;
}
function sentFiles(segments: Segment[], excerpts: Map<Segment, Site[]>) {
	const files = new Map<string, [number, number][]>();
	for (const segment of segments) {
		for (const { path, start, end } of excerpts.get(segment) ?? [segment]) {
			files.set(path, [...(files.get(path) ?? []), [start, end]]);
		}
	}
	return [...files]
		.sort(([left], [right]) => left.localeCompare(right))
		.map(([path, ranges]): SentFile => {
			const lines: [number, number][] = [];
			for (const [start, end] of ranges.sort((a, b) => a[0] - b[0])) {
				const last = lines.at(-1);
				if (last && start <= last[1] + 1) {
					last[1] = Math.max(last[1], end);
				} else {
					lines.push([start, end]);
				}
			}
			return { path, lines };
		});
}

export async function scan(
	options: z.infer<typeof scanOptionsSchema> & {
		output: string;
		scope: string;
	},
	onProgress: (snapshot: Snapshot) => void,
	announce: (notice: { destination: Destination; files: number }) => void
) {
	const { root, scope, output, cacheOnly, fresh, concurrency, batchFiles } =
		options;
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
	const {
		inventory,
		sources,
		catalog,
		attributeListeners,
		trackedRoutes,
		workspace,
	} = await readSources(root, scope);
	const [listener] = attributeListeners;
	const routeEvents = new Map(
		trackedRoutes.map((entry) => {
			const [route = "", event = ""] = entry.split(routeArrow);
			return [route, event.split(" (")[0] ?? ""];
		})
	);
	const annotate = (source: string) => {
		const notes = new Set<string>();
		for (const match of source.matchAll(procedureCall)) {
			const route = `${match[1]}.${match[2]}`;
			const event = routeEvents.get(route);
			if (event) {
				notes.add(
					`// ${route} is a tracked route: it emits ${event} after the call succeeds`
				);
			}
		}
		return notes.size ? `${[...notes].join("\n")}\n${source}` : source;
	};
	const { groupActions } = options.actions
		? await import("./actions")
		: { groupActions: null };
	const found: Segment[] = [];
	const settled: Row[] = [];
	const excerpts = new Map<Segment, Site[]>();
	const noActionFiles: string[] = [];
	for (const [path, source] of sources) {
		const actions = groupActions?.(path, source, sources, workspace);
		if (actions?.length) {
			for (const {
				start,
				end,
				source: context,
				excerpts: lines,
				commits,
				tracked,
				...action
			} of actions) {
				if (tracked && listener && !commits) {
					settled.push({
						path,
						start,
						end,
						coverage: "covered",
						category: "none",
						priority: 0,
						coverageProbability: 1,
						categoryProbability: null,
						action,
					});
					continue;
				}
				const segment = {
					path,
					start,
					end,
					source: annotate(
						tracked && listener
							? `// ${tracked} on this element or an ancestor is emitted on click by the data-track listener at ${listener}\n${context}`
							: context
					),
					action,
				};
				found.push(segment);
				excerpts.set(segment, lines);
			}
		} else if (actions || !reviewable.test(path)) {
			noActionFiles.push(path);
		} else {
			found.push(...splitSource(path, source));
		}
	}
	const linkedRoutes = new Set(
		found.flatMap((segment) =>
			(segment.action?.sites ?? [])
				.filter((site) => site.path !== segment.path)
				.map((site) => `${site.path}:${site.start}`)
		)
	);
	const segments = found.filter(
		(segment) =>
			!(
				routeHandlerLabel.test(segment.action?.label ?? "") &&
				linkedRoutes.has(`${segment.path}:${segment.start}`)
			)
	);
	const includedFiles = new Set([...segments, ...settled].map((s) => s.path))
		.size;
	const sourceFiles = [...sources.keys()].filter((path) =>
		reviewable.test(path)
	).length;
	const warnings =
		options.actions && sourceFiles >= 20 && includedFiles < sourceFiles / 20
			? [
					`Only ${includedFiles} of ${sourceFiles} source files contain actions the scanner recognises (JSX handlers, form actions, DOM listeners, route handlers). Findings cover those files only, so an empty result does not mean tracking is complete.`,
				]
			: [];
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
	const apiKey =
		process.env.AI_GATEWAY_API_KEY?.trim() ||
		repositoryKey
			.exec(await readFile(join(root, ".env"), "utf8").catch(() => ""))?.[1]
			?.trim()
			.replace(quoted, "$2") ||
		undefined;
	const destination: Destination = apiKey
		? { host: "ai-gateway.vercel.sh", kind: "gateway" }
		: { host: new URL(hostedScanUrl).host, kind: "databuddy" };
	if (options.dryRun) {
		return {
			dryRun: true as const,
			destination,
			files: sentFiles(segments, excerpts),
			skippedFiles: noActionFiles.length,
			warnings,
			payload: { catalog, segments },
		};
	}
	const batches = planRequests(segments, catalog, batchFiles);
	const cacheFile = (body: string, kind = "json") =>
		join(output, "responses", `${hash(body)}.${kind}`);
	const exists = (path: string) =>
		access(path).then(
			() => true,
			() => false
		);
	if (!cacheOnly) {
		const pending = await Promise.all(
			batches.map(async ({ body, jobs }) =>
				fresh ||
				!(
					(await exists(cacheFile(body))) ||
					(await exists(cacheFile(body, "split")))
				)
					? jobs
					: []
			)
		);
		announce({
			destination,
			files: sentFiles(pending.flat(), excerpts).length,
		});
	}
	const started = performance.now(),
		runId = randomUUID(),
		controller = new AbortController(),
		limit = pLimit(concurrency);
	const rows: Row[] = [...settled],
		calls: Call[] = [];
	let plannedBatches = batches.length,
		interrupted = false,
		logFailed = false;
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
			logFailed = true;
			controller.abort(error);
		});
	};
	const update = () =>
		onProgress({
			includedFiles,
			classifiedFiles: new Set(rows.map((r) => r.path)).size,
			batches: plannedBatches,
			completedBatches: calls.filter((c) => !c.split).length,
			elapsedSeconds: (performance.now() - started) / 1000,
			rows,
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
			scope,
			head,
			concurrency,
			timeoutMs,
			includedFiles,
			batches: batches.length,
		});
		update();
		const evaluateBatch = async (
			{ body, jobs }: { body: string; jobs: Segment[] },
			index: number,
			depth: number
		): Promise<void> => {
			if (controller.signal.aborted) {
				return;
			}
			const cacheKey = hash(body),
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
					attempts,
				};
			let response: JsonValue = null;
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
						response = await readJSON(cacheFile(body));
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
				const splittable = jobs.length > 1 && depth < splitDepth;
				if (
					!(call.cached || fresh) &&
					splittable &&
					(await exists(cacheFile(body, "split")))
				) {
					call.split = true;
				} else if (!call.cached) {
					response = null;
					if (cacheOnly) {
						throw new Error("No matching cached response; network disabled");
					}
					response = await requestEvaluation(body, {
						apiKey,
						attempts: splittable ? 2 : undefined,
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
				if (!call.split) {
					const parsed = parseResponse(response, jobs);
					if (!call.cached) {
						await saveJSON(cacheFile(body), response);
					}
					rows.push(...parsed.rows);
				}
			} catch (error) {
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
					logFailed
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
				if (!cacheOnly) {
					await writeFile(cacheFile(body, "split"), "", { mode: 0o600 });
				}
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
		if (logFailed) {
			throw new Error("Could not write scan diagnostics.");
		}
		const statuses = calls.flatMap((c) => c.attempts).map((a) => a.status);
		const failures = calls.filter((c) => c.error && !c.split).length;
		const denied = statuses.find((status) => status === 401 || status === 403);
		if (apiKey && denied) {
			throw new Error(
				`Vercel AI Gateway rejected AI_GATEWAY_API_KEY (HTTP ${denied}). ${keyHelp}`
			);
		}
		if (!apiKey && failures && statuses.includes(429)) {
			throw new Error(
				"Databuddy's scan API rate limit was reached. Try again later, or set AI_GATEWAY_API_KEY to use your own Vercel AI Gateway key."
			);
		}
		rows.sort(
			(a, b) =>
				Number(a.category === "none") - Number(b.category === "none") ||
				b.priority - a.priority ||
				a.path.localeCompare(b.path) ||
				a.start - b.start
		);
		const summary: ScanResult["summary"] = {
			root,
			scope,
			head,
			model: "typesafe-ai/jev",
			runId,
			finishedAt: new Date().toISOString(),
			destination,
			zeroDataRetention: true,
			interrupted,
			includedFiles,
			skippedFiles: noActionFiles.length,
			classifiedFiles: new Set(rows.map((r) => r.path)).size,
			batches: plannedBatches,
			unattemptedBatches: plannedBatches - calls.filter((c) => !c.split).length,
			failures,
			cachedBatches: calls.filter((c) => c.cached).length,
			requestAttempts: calls.reduce((n, c) => n + c.attempts.length, 0),
			retries: calls.reduce(
				(n, c) => n + Math.max(0, c.attempts.length - 1),
				0
			),
			wallSeconds: Math.round((performance.now() - started) / 100) / 10,
			warnings,
		};
		const round = (value: number | null) =>
			value === null ? null : Math.round(value * 100) / 100;
		const result = {
			summary,
			rows: rows.map((row) => ({
				...row,
				priority: round(row.priority) ?? 0,
				coverageProbability: round(row.coverageProbability),
				categoryProbability: round(row.categoryProbability),
			})),
		};
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
