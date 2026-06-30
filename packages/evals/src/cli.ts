import {
	copyFileSync,
	mkdirSync,
	readFileSync,
	readdirSync,
	writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { readBooleanEnv } from "@databuddy/env/boolean";
import {
	getCaseById,
	getCasesByFilters,
	getCaseSurfaces,
	getCaseTags,
	listCaseSurfaces,
	listCaseTags,
} from "./cases";
import {
	allModelIds,
	computeCaseCost,
	filterModels,
	getModelTags,
	getPricingEnvKeys,
	hasModelPricing,
	listTags,
} from "./costs";
import { judgeQuality } from "./judge";
import { printReport } from "./report";
import { runCase } from "./runner";
import type { ProgressEvent } from "./runner";
import { scoreCase } from "./scorers";
import { runSlackAdapterHarness } from "./slack-harness";
import type {
	CaseResult,
	EvalCase,
	EvalConfig,
	EvalRunner,
	EvalRun,
	EvalSurface,
	ScoreCard,
} from "./types";

const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const GREEN = "\x1b[32m";
const RED = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN = "\x1b[36m";
const BOLD = "\x1b[1m";
const CLEAR_LINE = "\x1b[2K\r";
const HIDE_CURSOR = "\x1b[?25l";
const SHOW_CURSOR = "\x1b[?25h";

interface CliOpts {
	apiUrl: string;
	caseId?: string;
	category?: string;
	concurrency: number;
	diff: boolean;
	excludeTags: string[];
	file?: string;
	filter?: string;
	limit?: number;
	model?: string;
	noSave: boolean;
	rejudge: boolean;
	runner: EvalRunner;
	skipJudge: boolean;
	subcommand: "run" | "compare" | "models" | "slack-harness";
	surfaces: Array<EvalSurface | "all">;
	tags: string[];
}

const STRUCTURAL_PASS_THRESHOLD = 60;
const DEFAULT_JUDGED_QUALITY_THRESHOLD = 60;
const QUALITY_GATE_FAILURE_PREFIX = "Quality judge score";
const RUNNER_ERROR_PREFIX = "Runner error:";

function shouldJudgeCase(evalCase: EvalCase): boolean {
	return ["quality", "attribution", "insights"].includes(evalCase.category);
}

function countRunnerErrors(run: EvalRun): number {
	return run.cases.filter((c) =>
		c.failures.some((failure) => failure.startsWith(RUNNER_ERROR_PREFIX))
	).length;
}

function averageScore(scores: Partial<ScoreCard>): number {
	const scoreValues = Object.values(scores).filter(
		(v): v is number => v !== undefined
	);
	return scoreValues.length > 0
		? Math.round(scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length)
		: 0;
}

function refreshCaseStatus(result: CaseResult, evalCase: EvalCase): void {
	result.failures = result.failures.filter(
		(f) => !f.startsWith(QUALITY_GATE_FAILURE_PREFIX)
	);

	const minQualityScore =
		evalCase.expect.minQualityScore ??
		(shouldJudgeCase(evalCase) ? DEFAULT_JUDGED_QUALITY_THRESHOLD : undefined);
	if (
		minQualityScore !== undefined &&
		result.scores.quality !== undefined &&
		result.scores.quality < minQualityScore
	) {
		result.failures.push(
			`${QUALITY_GATE_FAILURE_PREFIX} ${result.scores.quality} below required ${minQualityScore}`
		);
	}

	result.passed =
		result.failures.length === 0 &&
		averageScore(result.scores) >= STRUCTURAL_PASS_THRESHOLD;
}

function parseArgs(): CliOpts {
	const args = process.argv.slice(2);
	let subcommand: CliOpts["subcommand"] = "run";
	let category: string | undefined;
	let caseId: string | undefined;
	let model: string | undefined;
	let file: string | undefined;
	let filter: string | undefined;
	let limit: number | undefined;
	let runner = (process.env.EVAL_RUNNER as EvalRunner | undefined) ?? "package";
	let noSave = false;
	let skipJudge = readBooleanEnv("EVAL_SKIP_JUDGE");
	let rejudge = false;
	let diff = false;
	let apiUrl = process.env.EVAL_API_URL ?? "http://localhost:3001";
	let concurrency = 10;
	const surfaces: Array<EvalSurface | "all"> = [];
	const tags: string[] = [];
	const excludeTags: string[] = [];

	if (args[0] === "compare") {
		subcommand = "compare";
	} else if (args[0] === "models") {
		subcommand = "models";
	} else if (args[0] === "slack-harness") {
		subcommand = "slack-harness";
	}

	const remainingArgs = [...args];
	while (remainingArgs.length > 0) {
		const arg = remainingArgs.shift();
		switch (arg) {
			case "--category":
				category = remainingArgs.shift();
				break;
			case "--case":
				caseId = remainingArgs.shift();
				break;
			case "--model":
				model = remainingArgs.shift();
				break;
			case "--file":
				file = remainingArgs.shift();
				break;
			case "--no-save":
				noSave = true;
				break;
			case "--skip-judge":
				skipJudge = true;
				break;
			case "--rejudge":
				rejudge = true;
				break;
			case "--diff":
				diff = true;
				break;
			case "--api-url":
				apiUrl = remainingArgs.shift() ?? apiUrl;
				break;
			case "--concurrency":
				concurrency = Number.parseInt(remainingArgs.shift() ?? "", 10) || 10;
				break;
			case "--filter":
				filter = remainingArgs.shift();
				break;
			case "--limit": {
				const value = Number.parseInt(remainingArgs.shift() ?? "", 10);
				if (Number.isFinite(value) && value > 0) {
					limit = value;
				}
				break;
			}
			case "--runner": {
				const value = remainingArgs.shift();
				if (value === "api" || value === "package") {
					runner = value;
				}
				break;
			}
			case "--surface":
				surfaces.push(...parseSurfaces(remainingArgs.shift()));
				break;
			case "--tag":
				tags.push(...parseCsv(remainingArgs.shift()));
				break;
			case "--exclude-tag":
				excludeTags.push(...parseCsv(remainingArgs.shift()));
				break;
			default:
				break;
		}
	}

	return {
		subcommand,
		category,
		caseId,
		model,
		file,
		filter,
		limit,
		runner,
		noSave,
		skipJudge,
		rejudge,
		diff,
		apiUrl,
		concurrency,
		surfaces,
		tags,
		excludeTags,
	};
}

function parseCsv(value: string | undefined): string[] {
	return (value ?? "")
		.split(",")
		.map((part) => part.trim())
		.filter(Boolean);
}

function parseSurfaces(value: string | undefined): Array<EvalSurface | "all"> {
	const allowed = new Set(["agent", "mcp", "slack", "all"]);
	return parseCsv(value).filter((surface): surface is EvalSurface | "all" =>
		allowed.has(surface)
	);
}

interface SlotState {
	caseId: string;
	startedAt: number;
	status: "running" | "done";
	steps: number;
	textChars: number;
	tools: string[];
}

function formatElapsed(ms: number): string {
	const s = Math.floor(ms / 1000);
	return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m${s % 60}s`;
}

function renderLiveSlots(
	slots: Map<number, SlotState>,
	completed: number,
	total: number,
	startTime: number
) {
	const lines: string[] = [];
	const elapsed = formatElapsed(Date.now() - startTime);
	lines.push(`${DIM}[${elapsed}] ${completed}/${total} done${RESET}`);

	for (const [, slot] of slots) {
		if (slot.status !== "running") {
			continue;
		}
		const age = formatElapsed(Date.now() - slot.startedAt);
		const toolStr =
			slot.tools.length > 0 ? ` ${CYAN}${slot.tools.at(-1)}${RESET}` : "";
		const charStr =
			slot.textChars > 0 ? ` ${DIM}${slot.textChars}ch${RESET}` : "";
		lines.push(
			`  ${YELLOW}▶${RESET} ${slot.caseId.slice(0, 30).padEnd(30)} step ${slot.steps}${toolStr}${charStr} ${DIM}${age}${RESET}`
		);
	}

	const output = lines.join("\n");
	const lineCount = lines.length;

	process.stderr.write(`${output}\n`);

	return lineCount;
}

function clearLines(count: number) {
	for (let i = 0; i < count; i++) {
		process.stderr.write(`\x1b[A${CLEAR_LINE}`);
	}
}

async function runSingleCase(
	evalCase: EvalCase,
	config: EvalConfig,
	modelId: string,
	onProgress?: (evt: ProgressEvent) => void
): Promise<CaseResult> {
	try {
		const response = await runCase(evalCase, config, onProgress);
		const { scores, failures, warnings } = scoreCase(evalCase, response);

		const costUsd = computeCaseCost(
			modelId,
			response.inputTokens,
			response.outputTokens
		);

		const result: CaseResult = {
			id: evalCase.id,
			category: evalCase.category,
			name: evalCase.name,
			query: evalCase.query,
			surfaces: getCaseSurfaces(evalCase),
			tags: getCaseTags(evalCase),
			passed: false,
			scores,
			metrics: {
				steps: response.steps,
				latencyMs: response.latencyMs,
				inputTokens: response.inputTokens,
				outputTokens: response.outputTokens,
				costUsd,
				judgeCostUsd: 0,
			},
			toolsCalled: [...new Set(response.toolCalls.map((tc) => tc.name))],
			toolCalls: response.toolCalls,
			failures: [...failures, ...warnings],
			warnings,
			response: response.textContent,
		};
		refreshCaseStatus(result, evalCase);
		return result;
	} catch (error) {
		const msg = error instanceof Error ? error.message : "Unknown error";
		return {
			id: evalCase.id,
			category: evalCase.category,
			name: evalCase.name,
			query: evalCase.query,
			surfaces: getCaseSurfaces(evalCase),
			tags: getCaseTags(evalCase),
			passed: false,
			scores: {},
			metrics: {
				steps: 0,
				latencyMs: 0,
				inputTokens: 0,
				outputTokens: 0,
				costUsd: 0,
				judgeCostUsd: 0,
			},
			toolsCalled: [],
			toolCalls: [],
			failures: [`Runner error: ${msg}`],
			warnings: [],
			response: "",
		};
	}
}

function buildRun(
	results: CaseResult[],
	model: string,
	apiUrl: string,
	duration: number,
	runner: EvalRunner,
	filters?: EvalRun["filters"],
	judgeModel?: string
): EvalRun {
	const dimSums: ScoreCard = {
		tool_routing: 0,
		behavioral: 0,
		quality: 0,
		format: 0,
		performance: 0,
	};
	const dimCounts: ScoreCard = {
		tool_routing: 0,
		behavioral: 0,
		quality: 0,
		format: 0,
		performance: 0,
	};
	for (const r of results) {
		for (const [k, v] of Object.entries(r.scores)) {
			if (v !== undefined && v >= 0) {
				dimSums[k as keyof ScoreCard] += v;
				dimCounts[k as keyof ScoreCard] += 1;
			}
		}
	}

	const dimensions: ScoreCard = {
		tool_routing: dimCounts.tool_routing
			? Math.round(dimSums.tool_routing / dimCounts.tool_routing)
			: 0,
		behavioral: dimCounts.behavioral
			? Math.round(dimSums.behavioral / dimCounts.behavioral)
			: 0,
		quality: dimCounts.quality
			? Math.round(dimSums.quality / dimCounts.quality)
			: 0,
		format: dimCounts.format
			? Math.round(dimSums.format / dimCounts.format)
			: 0,
		performance: dimCounts.performance
			? Math.round(dimSums.performance / dimCounts.performance)
			: 0,
	};

	const passedCount = results.filter((r) => r.passed).length;
	const scoredDimensions = (Object.keys(dimensions) as Array<keyof ScoreCard>)
		.filter((dimension) => dimCounts[dimension] > 0)
		.map((dimension) => dimensions[dimension]);
	const overallScore =
		scoredDimensions.length > 0
			? Math.round(
					scoredDimensions.reduce((total, score) => total + score, 0) /
						scoredDimensions.length
				)
			: 0;

	return {
		timestamp: new Date().toISOString(),
		model,
		apiUrl,
		duration,
		runner,
		filters,
		judgeModel,
		summary: {
			total: results.length,
			passed: passedCount,
			failed: results.length - passedCount,
			score: overallScore,
		},
		dimensions,
		cases: results,
	};
}

function modelSlug(model: string): string {
	return model.replace(/[^a-zA-Z0-9._-]+/g, "--");
}

function timestampSlug(timestamp: string): string {
	return timestamp.replace(/[:.]/g, "-");
}

function saveRun(run: EvalRun, resultsDir: string): string {
	const modelDir = join(resultsDir, modelSlug(run.model));
	const historyDir = join(modelDir, "runs");
	mkdirSync(historyDir, { recursive: true });

	const content = JSON.stringify(run, null, 2);
	const historyPath = join(historyDir, `${timestampSlug(run.timestamp)}.json`);
	writeFileSync(historyPath, content);

	const latestPath = join(modelDir, "latest.json");
	writeFileSync(latestPath, content);
	return historyPath;
}

function archiveExistingFile(filepath: string): string | null {
	let content: string;
	try {
		content = readFileSync(filepath, "utf-8");
	} catch {
		return null;
	}

	try {
		const run = JSON.parse(content) as Partial<EvalRun>;
		const model = typeof run.model === "string" ? run.model : "unknown";
		const timestamp =
			typeof run.timestamp === "string"
				? run.timestamp
				: new Date().toISOString();
		const historyDir = join(
			import.meta.dir,
			"..",
			"results",
			modelSlug(model),
			"runs"
		);
		mkdirSync(historyDir, { recursive: true });
		const archivePath = join(historyDir, `${timestampSlug(timestamp)}.json`);
		writeFileSync(archivePath, content);
		return archivePath;
	} catch {
		const archivePath = `${filepath}.${Date.now()}.bak`;
		copyFileSync(filepath, archivePath);
		return archivePath;
	}
}

async function cmdRun() {
	const opts = parseArgs();
	const judgeModel = process.env.EVAL_JUDGE_MODEL ?? "zai/glm-5-turbo";

	if (opts.rejudge) {
		await rejudgeFromFile(opts, judgeModel);
		return;
	}

	let modelIds: string[];
	if (opts.filter) {
		modelIds = filterModels(opts.filter);
		if (modelIds.length === 0) {
			console.error(`No models match filter '${opts.filter}'`);
			process.exit(1);
		}
	} else {
		modelIds = [opts.model ?? "anthropic/claude-sonnet-4.6"];
	}

	let cases = getCasesByFilters({
		category: opts.category,
		excludeTags: opts.excludeTags,
		surfaces: opts.surfaces,
		tags: opts.tags,
	});
	if (opts.caseId) {
		const c = getCaseById(opts.caseId);
		if (!c) {
			console.error(`Case '${opts.caseId}' not found`);
			process.exit(1);
		}
		cases = [c];
	} else if (opts.limit && cases.length > opts.limit) {
		cases = cases.slice(0, opts.limit);
	} else if (cases.length === 0) {
		console.error("No cases match the selected filters");
		console.error(
			`Surfaces: ${listCaseSurfaces().join(", ")} | Tags: ${listCaseTags().join(", ")}`
		);
		process.exit(1);
	}

	if (modelIds.length > 1) {
		console.log(
			`${BOLD}Batch run: ${modelIds.length} models × ${cases.length} cases${RESET}\n`
		);
	}

	let anyFailed = false;
	for (let mi = 0; mi < modelIds.length; mi++) {
		const modelId = modelIds[mi];
		if (modelIds.length > 1) {
			console.log(
				`\n${CYAN}━━━ [${mi + 1}/${modelIds.length}] ${modelId} ━━━${RESET}\n`
			);
		}
		const run = await runModelSuite(opts, modelId, judgeModel, cases);
		if (run.summary.failed > 0) {
			anyFailed = true;
		}
	}

	if (anyFailed) {
		process.exitCode = 1;
	}
}

async function runModelSuite(
	opts: CliOpts,
	modelId: string,
	judgeModel: string,
	cases: EvalCase[]
) {
	const config: EvalConfig = {
		apiUrl: opts.apiUrl,
		authCookie: process.env.EVAL_SESSION_COOKIE,
		apiKey: process.env.EVAL_API_KEY,
		judgeModel,
		modelOverride: modelId,
		runner: opts.runner,
		surface: opts.surfaces.length === 1 ? opts.surfaces[0] : undefined,
	};

	const concurrency = Math.min(opts.concurrency, cases.length);
	console.log(
		`${BOLD}Running ${cases.length} evals${RESET} with ${config.runner} runner${config.runner === "api" ? ` against ${config.apiUrl}` : ""} (concurrency: ${concurrency})`
	);
	console.log(`Model: ${modelId}`);
	if (!hasModelPricing(modelId)) {
		const keys = getPricingEnvKeys(modelId);
		console.log(
			`${YELLOW}Warning:${RESET} no pricing entry for ${modelId}; agent cost will be reported as $0. Add it to packages/evals/src/costs.ts or set ${keys.input} and ${keys.output}.`
		);
	}
	if (opts.surfaces.length > 0) {
		console.log(`Surfaces: ${opts.surfaces.join(", ")}`);
	}
	if (opts.tags.length > 0 || opts.excludeTags.length > 0) {
		console.log(
			`Tags: ${opts.tags.join(", ") || "any"}${opts.excludeTags.length > 0 ? ` | exclude: ${opts.excludeTags.join(", ")}` : ""}`
		);
	}
	if (!opts.skipJudge) {
		console.log(`Judge: ${judgeModel}`);
	}
	console.log("");

	const runStart = Date.now();
	let completed = 0;
	const pendingJudges: Promise<void>[] = [];

	const slots = new Map<number, SlotState>();
	let lastLineCount = 0;
	let slotIdCounter = 0;
	const isTTY = process.stderr.isTTY;

	function redraw() {
		if (!isTTY) {
			return;
		}
		if (lastLineCount > 0) {
			clearLines(lastLineCount);
		}
		lastLineCount = renderLiveSlots(slots, completed, cases.length, runStart);
	}

	let redrawTimer: ReturnType<typeof setInterval> | null = null;
	if (isTTY) {
		process.stderr.write(HIDE_CURSOR);
		redrawTimer = setInterval(redraw, 500);
	}

	const results: CaseResult[] = new Array(cases.length);
	let nextIdx = 0;

	async function worker() {
		while (nextIdx < cases.length) {
			const idx = nextIdx++;
			const evalCase = cases[idx];
			const slotId = slotIdCounter++;

			const slot: SlotState = {
				caseId: evalCase.id,
				startedAt: Date.now(),
				steps: 0,
				tools: [],
				textChars: 0,
				status: "running",
			};
			slots.set(slotId, slot);
			redraw();

			const result = await runSingleCase(evalCase, config, modelId, (evt) => {
				switch (evt.kind) {
					case "step":
						slot.steps = evt.step;
						break;
					case "tool":
						slot.tools.push(evt.name);
						break;
					case "text":
						slot.textChars = evt.chars;
						break;
					default:
						break;
				}
			});

			results[idx] = result;
			slot.status = "done";
			slots.delete(slotId);
			completed++;

			if (isTTY && lastLineCount > 0) {
				clearLines(lastLineCount);
				lastLineCount = 0;
			}

			const status = result.failures[0]?.startsWith("Runner error")
				? `${RED}ERROR${RESET}`
				: result.passed
					? result.warnings.length > 0
						? `${YELLOW}WARN${RESET} (${result.warnings.length})`
						: `${GREEN}OK${RESET}`
					: `${RED}FAIL${RESET} (${result.failures.length})`;
			const time = formatElapsed(result.metrics.latencyMs);
			const toolList =
				slot.tools.length > 0
					? ` ${DIM}[${[...new Set(slot.tools)].join(", ")}]${RESET}`
					: "";
			console.log(
				`  ${String(completed).padStart(2)}/${cases.length} ${evalCase.id.slice(0, 30).padEnd(30)} ${status} ${time} ${DIM}${slot.steps} steps${RESET}${toolList}`
			);

			if (result.failures.length > 0) {
				for (const f of result.failures) {
					console.log(`       ${DIM}-> ${f}${RESET}`);
				}
			}
			if (result.warnings.length > 0) {
				for (const w of result.warnings) {
					console.log(`       ${DIM}~  ${w}${RESET}`);
				}
			}

			redraw();

			if (
				!opts.skipJudge &&
				shouldJudgeCase(evalCase) &&
				result.response.length > 0
			) {
				pendingJudges.push(
					judgeQuality(evalCase, result.response, result.toolCalls, judgeModel)
						.then((judgeResult) => {
							if (judgeResult) {
								const { scores, usage } = judgeResult;
								result.scores.quality = scores.average;
								result.qualityDetail = scores;

								result.metrics.judgeCostUsd = computeCaseCost(
									judgeModel,
									usage.inputTokens,
									usage.outputTokens
								);

								refreshCaseStatus(result, evalCase);

								if (isTTY && lastLineCount > 0) {
									clearLines(lastLineCount);
									lastLineCount = 0;
								}
								console.log(
									`  ${DIM}[judge]${RESET} ${evalCase.id.slice(0, 25)} q=${scores.average} ${result.passed ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`} ${DIM}dg=${scores.dataGrounding} ad=${scores.analyticalDepth} ac=${scores.actionability} co=${scores.completeness} cm=${scores.communication}${RESET}`
								);
								if (scores.explanation) {
									console.log(`         ${DIM}${scores.explanation}${RESET}`);
								}
								redraw();
							}
						})
						.catch((err) => {
							if (isTTY && lastLineCount > 0) {
								clearLines(lastLineCount);
								lastLineCount = 0;
							}
							console.log(
								`  ${DIM}[judge]${RESET} ${evalCase.id.slice(0, 25)} ${RED}error${RESET}: ${err instanceof Error ? err.message : err}`
							);
							redraw();
						})
				);
			}
		}
	}

	const workers = Array.from({ length: concurrency }, () => worker());
	await Promise.all(workers);

	if (redrawTimer) {
		clearInterval(redrawTimer);
	}
	if (isTTY) {
		if (lastLineCount > 0) {
			clearLines(lastLineCount);
		}
		process.stderr.write(SHOW_CURSOR);
	}

	if (pendingJudges.length > 0) {
		console.log(
			`\n${DIM}Awaiting ${pendingJudges.length} judge calls...${RESET}`
		);
		await Promise.all(pendingJudges);
	}

	const run = buildRun(
		results,
		modelId,
		config.apiUrl,
		Date.now() - runStart,
		opts.runner,
		{
			...(opts.category ? { categories: [opts.category] } : {}),
			...(opts.surfaces.length > 0 ? { surfaces: opts.surfaces } : {}),
			...(opts.tags.length > 0 ? { tags: opts.tags } : {}),
			...(opts.excludeTags.length > 0 ? { excludeTags: opts.excludeTags } : {}),
		},
		opts.skipJudge ? undefined : judgeModel
	);
	printReport(run);

	if (!opts.noSave) {
		const runnerErrors = countRunnerErrors(run);
		const saveFailedRuns = readBooleanEnv("EVAL_SAVE_FAILED_RUNS");
		if (runnerErrors === run.summary.total && !saveFailedRuns) {
			console.log(
				`${YELLOW}Not saved:${RESET} every case failed with a runner error. Fix the runner environment and rerun, or set EVAL_SAVE_FAILED_RUNS=1 to keep diagnostic failures.`
			);
		} else {
			const resultsDir = join(import.meta.dir, "..", "results");
			const filepath = saveRun(run, resultsDir);
			console.log(`Saved: ${filepath}`);
			console.log(
				`Latest: ${join(resultsDir, modelSlug(run.model), "latest.json")}`
			);
		}
	}

	return run;
}

async function rejudgeFromFile(opts: CliOpts, judgeModel: string) {
	const resultsDir = join(import.meta.dir, "..", "results");
	let filepath: string;

	if (opts.file) {
		filepath = opts.file;
	} else if (opts.model) {
		filepath = join(resultsDir, modelSlug(opts.model), "latest.json");
		try {
			readFileSync(filepath);
		} catch {
			console.error(`No results found for model ${opts.model}`);
			process.exit(1);
		}
	} else {
		console.error("--rejudge requires --model or --file");
		process.exit(1);
	}

	const run: EvalRun = JSON.parse(readFileSync(filepath, "utf-8"));
	console.log(`Re-judging ${run.model} (${filepath})...`);
	console.log(`Judge: ${judgeModel}\n`);

	const toJudge = run.cases.filter((c) => {
		const evalCase = getCaseById(c.id);
		return !!(evalCase && shouldJudgeCase(evalCase) && c.response?.length > 0);
	});

	if (toJudge.length === 0) {
		console.log("No quality cases to judge");
		return;
	}

	const results = await Promise.all(
		toJudge.map(async (caseResult) => {
			const evalCase = getCaseById(caseResult.id);
			if (!evalCase) {
				return false;
			}

			const judgeResult = await judgeQuality(
				evalCase,
				caseResult.response,
				caseResult.toolCalls,
				judgeModel
			);
			if (!judgeResult) {
				console.log(`  ${caseResult.id}: judge failed`);
				return false;
			}

			const { scores } = judgeResult;
			caseResult.scores.quality = scores.average;
			caseResult.qualityDetail = scores;
			caseResult.metrics.judgeCostUsd = computeCaseCost(
				judgeModel,
				judgeResult.usage.inputTokens,
				judgeResult.usage.outputTokens
			);
			refreshCaseStatus(caseResult, evalCase);
			console.log(
				`  ${caseResult.id}: quality=${scores.average} ${caseResult.passed ? `${GREEN}PASS${RESET}` : `${RED}FAIL${RESET}`} (dg=${scores.dataGrounding} ad=${scores.analyticalDepth} ac=${scores.actionability} co=${scores.completeness} cm=${scores.communication})`
			);
			if (scores.explanation) {
				console.log(`    ${DIM}${scores.explanation}${RESET}`);
			}
			return true;
		})
	);

	const judged = results.filter(Boolean).length;
	if (judged > 0) {
		const archivePath = archiveExistingFile(filepath);
		if (archivePath) {
			console.log(`Archived previous result: ${archivePath}`);
		}

		const updated = buildRun(
			run.cases,
			run.model,
			run.apiUrl,
			run.duration,
			run.runner,
			run.filters,
			judgeModel
		);
		updated.timestamp = run.timestamp;
		writeFileSync(filepath, JSON.stringify(updated, null, 2));
		console.log(`\nUpdated ${filepath} (${judged} cases re-judged)`);
		printReport(updated);
	}
}

function loadAllResults(resultsDir: string): Map<string, EvalRun> {
	const latestByModel = new Map<string, EvalRun>();
	let dirs: string[];
	try {
		dirs = readdirSync(resultsDir, { withFileTypes: true })
			.filter((d) => d.isDirectory())
			.map((d) => d.name);
	} catch {
		return latestByModel;
	}
	for (const dir of dirs) {
		const filepath = join(resultsDir, dir, "latest.json");
		try {
			const run: EvalRun = JSON.parse(readFileSync(filepath, "utf-8"));
			if (run.summary.total > 0) {
				latestByModel.set(run.model, run);
			}
		} catch {}
	}
	return latestByModel;
}

function selectCompareModels(
	latestByModel: Map<string, EvalRun>,
	opts: CliOpts
): string[] {
	let models = [...latestByModel.keys()].sort();
	if (opts.filter) {
		const allowed = new Set(filterModels(opts.filter));
		models = models.filter((model) => allowed.has(model));
	}
	if (opts.model) {
		const requested = parseCsv(opts.model);
		models = requested.flatMap((needle) => {
			const exact = models.find((model) => model === needle);
			if (exact) {
				return [exact];
			}
			const slug = modelSlug(needle);
			return models.filter(
				(model) => modelSlug(model) === slug || model.includes(needle)
			);
		});
	}
	return [...new Set(models)];
}

function cmdCompare() {
	const opts = parseArgs();
	const resultsDir = join(import.meta.dir, "..", "results");
	const latestByModel = loadAllResults(resultsDir);

	const models = selectCompareModels(latestByModel, opts);
	const firstRun = models.length > 0 ? latestByModel.get(models[0]) : undefined;
	if (!firstRun) {
		console.log("No results to compare");
		return;
	}
	const caseIds = [
		...new Set(
			models.flatMap((model) =>
				(latestByModel.get(model)?.cases ?? []).map((c) => c.id)
			)
		),
	];

	const COL = 20;
	const pad = (s: string, n: number) =>
		s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);

	const shortName = (m: string) => {
		const parts = m.split("/");
		return (parts.at(-1) ?? m).slice(0, COL - 1);
	};

	console.log(
		`\n${"Case".padEnd(32)} | ${models.map((m) => pad(shortName(m), COL)).join(" | ")}`
	);
	console.log("-".repeat(34 + models.length * (COL + 3)));

	for (const cid of caseIds) {
		let row = `${pad(cid.slice(0, 30), 32)} |`;
		const cellValues: string[] = [];

		for (const model of models) {
			const run = latestByModel.get(model);
			if (!run) {
				cellValues.push(pad("--", COL));
				continue;
			}
			const c = run.cases.find((x) => x.id === cid);
			if (!c) {
				cellValues.push(pad("--", COL));
				continue;
			}
			const status = c.passed ? "OK" : "FAIL";
			const t = `${(c.metrics.latencyMs / 1000).toFixed(0)}s`;
			const cost =
				c.metrics.costUsd > 0 ? `$${c.metrics.costUsd.toFixed(3)}` : "";
			const q =
				c.scores.quality !== undefined && c.scores.quality > 0
					? `q${c.scores.quality}`
					: "";
			cellValues.push(pad(`${status} ${t} ${cost} ${q}`.trim(), COL));
		}

		if (opts.diff) {
			const statuses = cellValues.map((v) => v.trim().startsWith("OK"));
			const hasDiff = statuses.some((s) => s !== statuses[0]);
			if (!hasDiff) {
				continue;
			}
		}

		for (const v of cellValues) {
			row += ` ${v} |`;
		}
		console.log(row);
	}

	console.log("-".repeat(34 + models.length * (COL + 3)));
	let summaryRow = `${pad("TOTAL", 32)} |`;
	for (const model of models) {
		const run = latestByModel.get(model);
		if (!run) {
			summaryRow += ` ${pad("--", COL)} |`;
			continue;
		}
		const s = run.summary;
		const d = run.dimensions;
		const avgLat =
			run.cases
				.filter((c) => c.passed)
				.reduce((a, c) => a + c.metrics.latencyMs, 0) /
			(s.passed || 1) /
			1000;
		const q = d.quality > 0 ? ` q${d.quality}` : "";
		summaryRow += ` ${pad(`${s.passed}/${s.total} ${avgLat.toFixed(0)}s${q}`, COL)} |`;
	}
	console.log(summaryRow);

	let costRow = `${pad("COST", 32)} |`;
	for (const model of models) {
		const run = latestByModel.get(model);
		if (!run) {
			costRow += ` ${pad("--", COL)} |`;
			continue;
		}
		const totalCost = run.cases.reduce((a, c) => a + c.metrics.costUsd, 0);
		const avgCost = totalCost / (run.cases.length || 1);
		const costStr =
			totalCost > 0
				? `$${totalCost.toFixed(4)} (~$${avgCost.toFixed(4)}/q)`
				: "--";
		costRow += ` ${pad(costStr, COL)} |`;
	}
	console.log(costRow);

	let tokenRow = `${pad("TOKENS", 32)} |`;
	for (const model of models) {
		const run = latestByModel.get(model);
		if (!run) {
			tokenRow += ` ${pad("--", COL)} |`;
			continue;
		}
		const totalIn = run.cases.reduce((a, c) => a + c.metrics.inputTokens, 0);
		const totalOut = run.cases.reduce((a, c) => a + c.metrics.outputTokens, 0);
		const fmt = (n: number) =>
			n > 1000 ? `${(n / 1000).toFixed(0)}k` : String(n);
		tokenRow += ` ${pad(`${fmt(totalIn)}in ${fmt(totalOut)}out`, COL)} |`;
	}
	console.log(tokenRow);
	console.log("");
}

function cmdModels() {
	const opts = parseArgs();
	const ids = opts.filter ? filterModels(opts.filter) : allModelIds();

	console.log(
		`\n${BOLD}${ids.length} models${RESET}${opts.filter ? ` (filter: ${opts.filter})` : ""}\n`
	);
	for (const id of ids) {
		const tags = getModelTags(id);
		console.log(`  ${id.padEnd(42)} ${DIM}${tags.join(", ")}${RESET}`);
	}
	console.log(`\n${DIM}Tags: ${listTags().join(", ")}${RESET}\n`);
	console.log(
		`${DIM}Eval surfaces: ${listCaseSurfaces().join(", ")} | Eval tags: ${listCaseTags().join(", ")}${RESET}\n`
	);
}

async function main() {
	const opts = parseArgs();
	switch (opts.subcommand) {
		case "compare":
			cmdCompare();
			break;
		case "models":
			cmdModels();
			break;
		case "slack-harness":
			await runSlackAdapterHarness();
			process.exit(process.exitCode ?? 0);
			return;
		default:
			await cmdRun();
			process.exit(process.exitCode ?? 0);
	}
}

main().catch((err) => {
	console.error("Eval failed:", err);
	process.exit(1);
});
