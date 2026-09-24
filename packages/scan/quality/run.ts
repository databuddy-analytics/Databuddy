import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, realpath, rename, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { Command, CommanderError, InvalidArgumentError } from "commander";
import { z } from "zod";
import { groupActions } from "../src/actions";
import {
	type Attempt,
	type Row,
	type Segment,
	createRequest,
	parseResponse,
	requestEvaluation,
} from "../src/evaluate";
import {
	hash,
	planRequests,
	readSources,
	scanOptionsSchema,
	splitSource,
} from "../src/scan";

const reviewSchema = z.object({
	id: z.string(),
	path: z.string(),
	line: z.number().int().positive(),
	endLine: z.number().int().positive(),
	expectedDecision: z.enum(["useful", "covered", "ignore", "needs_context"]),
	split: z.enum(["known", "holdout"]),
	sourceSha: z.string().optional(),
	expectExecutableAction: z.boolean().optional(),
});
type Review = z.infer<typeof reviewSchema>;
interface Prepared {
	body: string;
	bytes: number;
	jobs: Segment[];
	requestHash: string;
}
interface Placement {
	batchSize: number;
	index: number;
	requestBytes: number;
	requestHash: string;
}
interface RequestResult {
	attempts: Attempt[];
	error?: string;
	inputTokens: number;
	ms: number;
	outputTokens: number;
	requestBytes: number;
	requestHash: string;
	rows: Row[];
	segments: number;
}
const decisions: Record<Row["coverage"], Review["expectedDecision"]> = {
	missing: "useful",
	partial: "useful",
	covered: "covered",
	operational: "ignore",
	uncertain: "needs_context",
};
const sum = (values: number[]) => values.reduce((total, n) => total + n, 0);
const tally = (values: string[]) =>
	Object.fromEntries(
		[...new Set(values)].map((value) => [
			value,
			values.filter((other) => other === value).length,
		])
	);
const limit = (value: string) => {
	const parsed = Number(value);
	if (!Number.isInteger(parsed) || parsed < 1 || parsed > 20) {
		throw new InvalidArgumentError("Choose 1–20 reviewed cases.");
	}
	return parsed;
};
const command = new Command()
	.name("scan-quality")
	.description(
		"Offline extraction audit; --run compares both arms under production batching, not whole-scan accuracy or speed."
	)
	.option("--root <path>", "Git repository", ".")
	.option(
		"--output <path>",
		"Report directory (default: <root>/tmp/scan-quality)"
	)
	.option(
		"--limit <count>",
		"First 1–20 reviewed cases, in the fixed dataset order",
		limit,
		20
	)
	.option(
		"--run",
		"Send source to Jev through Vercel AI Gateway with zero data retention requested"
	)
	.exitOverride();

async function main() {
	command.parse();
	const options = command.opts<{
		root: string;
		output?: string;
		limit: number;
		run?: boolean;
	}>();
	const root = await realpath(
		execFileSync("git", ["rev-parse", "--show-toplevel"], {
			cwd: resolve(options.root),
			encoding: "utf8",
			stdio: ["ignore", "pipe", "pipe"],
		}).trim()
	);
	const dataset = await readFile(
		new URL("./cases.json", import.meta.url),
		"utf8"
	);
	const cases = reviewSchema
		.array()
		.max(20)
		.parse(JSON.parse(dataset))
		.slice(0, options.limit);
	const { sources, inventory, catalog } = await readSources(root);
	const { batchFiles } = scanOptionsSchema.parse({});
	const prepare = (jobs: Segment[], body = createRequest(jobs, catalog)) => ({
		body,
		bytes: Buffer.byteLength(body),
		jobs,
		requestHash: hash(body),
	});
	const plan = (segments: Segment[]): Prepared[] =>
		planRequests(segments, catalog, batchFiles).map(({ body, jobs }) =>
			prepare(jobs, body)
		);
	const placements = (batches: Prepared[]) => {
		const map = new Map<Segment, Placement>();
		for (const prepared of batches) {
			for (const [index, job] of prepared.jobs.entries()) {
				map.set(job, {
					requestHash: prepared.requestHash,
					index,
					requestBytes: prepared.bytes,
					batchSize: prepared.jobs.length,
				});
			}
		}
		return map;
	};
	const files = new Map(
		[...new Set(cases.map((item) => item.path))].map((path) => {
			const source = sources.get(path);
			const actions =
				source === undefined ? null : groupActions(path, source, sources);
			const mode =
				source === undefined
					? "unavailable"
					: actions === null
						? "fallback"
						: actions.length
							? "actions"
							: "none";
			const split = source === undefined ? [] : splitSource(path, source);
			const jobs: Segment[] =
				actions?.map(({ source: context, start, end, ...action }) => ({
					path,
					start,
					end,
					source: context,
					action,
				})) ?? split;
			return [path, { source, actions, mode, split, jobs }] as const;
		})
	);
	const plans = cases.map((review) => {
		const file = files.get(review.path);
		if (!file) {
			throw new Error("Missing file plan");
		}
		const baseline =
			file.split.find(
				(segment) =>
					segment.start <= review.line && segment.end >= review.endLine
			) ?? null;
		const matched = (file.actions ?? []).flatMap((action, index) =>
			[
				{ path: review.path, start: action.start, end: action.end },
				...action.sites,
			].some(
				(site) =>
					site.path === review.path &&
					site.start <= review.line &&
					site.end >= review.line
			)
				? [index]
				: []
		);
		const status =
			file.mode === "unavailable"
				? "source_unavailable"
				: file.mode === "fallback"
					? "unsupported_fallback"
					: matched.length
						? review.expectExecutableAction === false
							? "unexpected_action"
							: "matched"
						: review.expectExecutableAction === false ||
								review.expectedDecision === "ignore"
							? "suppressed"
							: "extraction_miss";
		return { review, file, matched, status, baseline };
	});
	const baselineBatches = plan([
		...new Set(plans.flatMap((item) => (item.baseline ? [item.baseline] : []))),
	]);
	const focusedBatches = plan(
		[...files.values()]
			.filter((file) => file.mode === "actions")
			.flatMap((file) => file.jobs)
	);
	const baselinePlacements = placements(baselineBatches);
	const focusedPlacements = placements(focusedBatches);
	const requests = new Map<string, RequestResult>();
	const controller = new AbortController();
	let interrupted = false;
	const cancel = () => {
		interrupted = true;
		controller.abort();
	};
	const runId = randomUUID(),
		startedAt = new Date().toISOString();
	const output = resolve(options.output ?? join(root, "tmp", "scan-quality"));
	const reportPath = join(
		output,
		`${options.run ? "comparison" : "extraction"}-${runId}.json`
	);
	const codeHashes = Object.fromEntries(
		await Promise.all(
			[
				"run.ts",
				"../src/actions.ts",
				"../src/evaluate.ts",
				"../src/scan.ts",
			].map(async (path) => [
				path,
				hash(await readFile(new URL(path, import.meta.url), "utf8")),
			])
		)
	);
	const sourceHash = hash(
		JSON.stringify(
			inventory
				.filter((file) => file.status === "included")
				.map((file) => [file.path, file.sha256])
		)
	);
	const lookup = (placement: Placement | undefined) => {
		if (!placement) {
			return { placement: null, row: null, status: "unplanned" };
		}
		const request = requests.get(placement.requestHash);
		const row = request?.rows[placement.index] ?? null;
		return {
			placement,
			row,
			status: request
				? (request.error ?? (row ? "scored" : "missing_row"))
				: options.run
					? "not_attempted"
					: "offline",
		};
	};
	const score = () =>
		plans.map(({ review, file, matched, status, baseline }) => {
			const base = lookup(
				baseline ? baselinePlacements.get(baseline) : undefined
			);
			const targets =
				file.mode === "actions"
					? matched.map((index) =>
							lookup(focusedPlacements.get(file.jobs[index] as Segment))
						)
					: [];
			const predictions = targets.flatMap((target) =>
				target.row ? [target.row] : []
			);
			return {
				...review,
				sourceHash: file.source === undefined ? null : hash(file.source),
				stale:
					file.source === undefined || !review.sourceSha
						? null
						: hash(file.source) !== review.sourceSha,
				extraction: status,
				candidateCount: file.actions?.length ?? null,
				matches: matched.map((index) => ({
					index,
					start: file.actions?.[index]?.start,
					end: file.actions?.[index]?.end,
					sites: file.actions?.[index]?.sites,
				})),
				baseline: {
					request: base.placement,
					status: base.status,
					coverage: base.row ? base.row.coverage : null,
					correct: base.row
						? decisions[base.row.coverage] === review.expectedDecision
						: null,
				},
				focused: {
					mode: file.mode,
					requests: targets.map((target) => ({
						...target.placement,
						status: target.status,
					})),
					coverages: predictions.map((row) => row.coverage),
					correct:
						targets.length && predictions.length === targets.length
							? predictions.every(
									(row) => decisions[row.coverage] === review.expectedDecision
								)
							: null,
				},
			};
		});
	function report() {
		const entries = score();
		const summaries = ["all", "known", "holdout"].map((split) => {
			const selected = entries.filter(
				(entry) => split === "all" || entry.split === split
			);
			const count = (variant: "baseline" | "focused") => ({
				scored: selected.filter((entry) => entry[variant].correct !== null)
					.length,
				correct: selected.filter((entry) => entry[variant].correct === true)
					.length,
				recall: Object.fromEntries(
					["useful", "covered", "ignore", "needs_context"].map((decision) => {
						const wanted = selected.filter(
							(entry) =>
								entry.expectedDecision === decision &&
								entry[variant].correct !== null
						);
						return [
							decision,
							`${wanted.filter((entry) => entry[variant].correct).length}/${wanted.length}`,
						];
					})
				),
			});
			const paired = selected.filter(
				(entry) =>
					entry.baseline.correct !== null && entry.focused.correct !== null
			);
			return [
				split,
				{
					cases: selected.length,
					baseline: count("baseline"),
					focused: count("focused"),
					paired: {
						cases: paired.length,
						baselineCorrect: paired.filter((entry) => entry.baseline.correct)
							.length,
						focusedCorrect: paired.filter((entry) => entry.focused.correct)
							.length,
					},
				},
			];
		});
		const planned = new Map(
			[...baselineBatches, ...focusedBatches].map((prepared) => [
				prepared.requestHash,
				prepared,
			])
		);
		const attempts = [...requests.values()].flatMap(
			(request) => request.attempts
		);
		return {
			runId,
			startedAt,
			updatedAt: new Date().toISOString(),
			root,
			mode: options.run ? "live" : "offline",
			interrupted,
			comparison:
				"Bounded prompt diagnostic; not whole-scan accuracy or speed. Both arms batch under production bounds, so a case shares its request with neighbouring segments. Ground truth never enters requests. Holdout cases are previously reviewed, not blind validation. Focused scores measure grouped candidates only: production fallback for files with no candidates is not an action-level gain. Request order alternates by arm, subject to request deduplication.",
			datasetHash: hash(dataset),
			sourceHash,
			codeHashes,
			summary: {
				cases: entries.length,
				uniqueFiles: files.size,
				plannedRequests: planned.size,
				plannedBaselineRequests: baselineBatches.length,
				plannedFocusedRequests: focusedBatches.length,
				plannedRequestBytes: sum(
					[...planned.values()].map((prepared) => prepared.bytes)
				),
				completedRequests: requests.size,
				splitRequests: [...requests.keys()].filter(
					(requestHash) => !planned.has(requestHash)
				).length,
				attempts: attempts.length,
				attemptOutcomes: tally(
					attempts.map(
						(attempt) => attempt.error ?? `HTTP ${attempt.status ?? 0}`
					)
				),
				extraction: tally(entries.map((entry) => entry.extraction)),
				staleCases: entries.filter((entry) => entry.stale === true).length,
				caseOutcomes: {
					baseline: tally(entries.map((entry) => entry.baseline.status)),
					focused: tally(
						entries.flatMap((entry) =>
							entry.focused.requests.length
								? entry.focused.requests.map((request) => request.status)
								: ["unmatched"]
						)
					),
				},
				multiplyMatchedCases: entries.filter(
					(entry) => entry.matches.length > 1
				).length,
				extraMatches: sum(
					entries.map((entry) => Math.max(0, entry.matches.length - 1))
				),
				scores: Object.fromEntries(summaries),
			},
			entries,
			requests: [...requests.values()],
		};
	}
	await mkdir(output, { recursive: true, mode: 0o700 });
	const save = async () => {
		const temporary = `${reportPath}.tmp`;
		await writeFile(temporary, JSON.stringify(report(), null, 2), {
			mode: 0o600,
		});
		await rename(temporary, reportPath);
	};
	await save();
	if (options.run) {
		if (!process.env.AI_GATEWAY_API_KEY) {
			try {
				process.loadEnvFile(join(root, ".env"));
			} catch (error) {
				if (
					!(
						error instanceof Error &&
						"code" in error &&
						error.code === "ENOENT"
					)
				) {
					throw error;
				}
			}
		}
		const apiKey = process.env.AI_GATEWAY_API_KEY;
		if (!apiKey) {
			throw new Error("Set AI_GATEWAY_API_KEY before using --run.");
		}
		const evaluate = async (
			prepared: Prepared,
			placed: Map<Segment, Placement>,
			depth = 0
		) => {
			if (requests.has(prepared.requestHash) || controller.signal.aborted) {
				return;
			}
			const started = performance.now();
			const record: RequestResult = {
				requestHash: prepared.requestHash,
				requestBytes: prepared.bytes,
				segments: prepared.jobs.length,
				attempts: [],
				rows: [],
				ms: 0,
				inputTokens: 0,
				outputTokens: 0,
			};
			try {
				const raw = await requestEvaluation(prepared.body, {
					apiKey,
					timeoutMs: 15_000,
					signal: controller.signal,
					onAttempt: (attempt) => record.attempts.push(attempt),
					onRetry: () => {},
				});
				Object.assign(record, parseResponse(raw, prepared.jobs));
			} catch (error) {
				record.error = controller.signal.aborted
					? "interrupted"
					: error instanceof z.ZodError
						? "invalid_response"
						: "request_failed";
				if ([401, 403].includes(record.attempts.at(-1)?.status ?? 0)) {
					controller.abort();
				}
			}
			record.ms = Math.round(performance.now() - started);
			requests.set(prepared.requestHash, record);
			await save();
			if (
				record.error === "request_failed" &&
				prepared.jobs.length > 1 &&
				depth < 2 &&
				!controller.signal.aborted
			) {
				const half = Math.ceil(prepared.jobs.length / 2);
				for (const part of [
					prepared.jobs.slice(0, half),
					prepared.jobs.slice(half),
				]) {
					const child = prepare(part);
					for (const [index, job] of part.entries()) {
						placed.set(job, {
							requestHash: child.requestHash,
							index,
							requestBytes: child.bytes,
							batchSize: part.length,
						});
					}
					await evaluate(child, placed, depth + 1);
				}
			}
		};
		process.on("SIGINT", cancel);
		process.on("SIGTERM", cancel);
		try {
			const arms = [
				baselineBatches.map(
					(prepared) => [prepared, baselinePlacements] as const
				),
				focusedBatches.map(
					(prepared) => [prepared, focusedPlacements] as const
				),
			];
			const queue = Array.from(
				{ length: Math.max(...arms.map((arm) => arm.length)) },
				(_, index) =>
					index % 2
						? [arms[1]?.[index], arms[0]?.[index]]
						: [arms[0]?.[index], arms[1]?.[index]]
			)
				.flat()
				.filter((entry) => entry !== undefined);
			for (const [prepared, placed] of queue) {
				if (controller.signal.aborted) {
					break;
				}
				await evaluate(prepared, placed);
			}
		} finally {
			controller.abort();
			process.removeListener("SIGINT", cancel);
			process.removeListener("SIGTERM", cancel);
			await save();
		}
	}
	console.log(
		JSON.stringify({ report: reportPath, ...report().summary }, null, 2)
	);
	process.exitCode = interrupted
		? 130
		: [...requests.values()].some((request) => request.error)
			? 1
			: 0;
}
main().catch((error) => {
	if (error instanceof CommanderError) {
		process.exitCode = error.exitCode;
		return;
	}
	console.error(
		error instanceof Error ? error.message : "Quality harness failed"
	);
	process.exitCode = 1;
});
