import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { costFromUsage } from "tokenlens";
import { allCases, getCaseById, getCasesByCategory } from "./cases";
import { judgeQuality } from "./judge";
import { printReport } from "./report";
import { runCase } from "./runner";
import { scoreCase } from "./scorers";
import type {
	CaseResult,
	EvalCase,
	EvalConfig,
	EvalRun,
	JudgeScores,
	ScoreCard,
} from "./types";

function parseArgs(): {
	subcommand: "run" | "judge" | "compare";
	category?: string;
	caseId?: string;
	model?: string;
	file?: string;
	noSave: boolean;
	diff: boolean;
	apiUrl: string;
	concurrency: number;
} {
	const args = process.argv.slice(2);
	let subcommand: "run" | "judge" | "compare" = "run";
	let category: string | undefined;
	let caseId: string | undefined;
	let model: string | undefined;
	let file: string | undefined;
	let noSave = false;
	let diff = false;
	let apiUrl = process.env.EVAL_API_URL ?? "http://localhost:3001";
	let concurrency = 10;

	if (args[0] === "judge" || args[0] === "compare") {
		subcommand = args[0];
	}

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--category" && args[i + 1]) {
			category = args[++i];
		} else if (args[i] === "--case" && args[i + 1]) {
			caseId = args[++i];
		} else if (args[i] === "--model" && args[i + 1]) {
			model = args[++i];
		} else if (args[i] === "--file" && args[i + 1]) {
			file = args[++i];
		} else if (args[i] === "--no-save") {
			noSave = true;
		} else if (args[i] === "--diff") {
			diff = true;
		} else if (args[i] === "--api-url" && args[i + 1]) {
			apiUrl = args[++i];
		} else if (args[i] === "--concurrency" && args[i + 1]) {
			concurrency = Number.parseInt(args[++i], 10) || 10;
		}
	}

	return {
		subcommand,
		category,
		caseId,
		model,
		file,
		noSave,
		diff,
		apiUrl,
		concurrency,
	};
}

function computeCost(
	modelId: string,
	inputTokens: number,
	outputTokens: number
): number {
	try {
		const result = costFromUsage({
			id: modelId,
			usage: { inputTokens, outputTokens },
		});
		return typeof result === "number" ? result : 0;
	} catch {
		return 0;
	}
}

async function runSingleCase(
	evalCase: EvalCase,
	config: EvalConfig,
	modelId: string
): Promise<CaseResult> {
	try {
		const response = await runCase(evalCase, config);
		const { scores, failures } = scoreCase(evalCase, response);

		const scoreValues = Object.values(scores).filter(
			(v): v is number => v !== undefined
		);
		const avgScore =
			scoreValues.length > 0
				? Math.round(
						scoreValues.reduce((a, b) => a + b, 0) / scoreValues.length
					)
				: 0;
		const passed = failures.length === 0 && avgScore >= 60;

		const costUsd = computeCost(
			modelId,
			response.inputTokens,
			response.outputTokens
		);

		return {
			id: evalCase.id,
			category: evalCase.category,
			name: evalCase.name,
			query: evalCase.query,
			passed,
			scores,
			metrics: {
				steps: response.steps,
				latencyMs: response.latencyMs,
				inputTokens: response.inputTokens,
				outputTokens: response.outputTokens,
				costUsd,
			},
			toolsCalled: response.toolCalls.map((tc) => tc.name),
			toolCalls: response.toolCalls,
			failures,
			response: response.textContent,
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : "Unknown error";
		return {
			id: evalCase.id,
			category: evalCase.category,
			name: evalCase.name,
			query: evalCase.query,
			passed: false,
			scores: {},
			metrics: {
				steps: 0,
				latencyMs: 0,
				inputTokens: 0,
				outputTokens: 0,
				costUsd: 0,
			},
			toolsCalled: [],
			toolCalls: [],
			failures: [`Runner error: ${msg}`],
			response: "",
		};
	}
}

async function runWithConcurrency<T, R>(
	items: T[],
	concurrency: number,
	fn: (item: T) => Promise<R>,
	onComplete?: (item: T, result: R) => void
): Promise<R[]> {
	const results: R[] = new Array(items.length);
	let nextIdx = 0;

	async function worker() {
		while (nextIdx < items.length) {
			const idx = nextIdx++;
			const item = items[idx];
			const result = await fn(item);
			results[idx] = result;
			onComplete?.(item, result);
		}
	}

	const workers = Array.from(
		{ length: Math.min(concurrency, items.length) },
		() => worker()
	);
	await Promise.all(workers);
	return results;
}

function buildRun(
	results: CaseResult[],
	model: string,
	apiUrl: string,
	duration: number
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
	const overallScore = Math.round(
		Object.values(dimensions).reduce((a, b) => a + b, 0) / 5
	);

	return {
		timestamp: new Date().toISOString(),
		model,
		apiUrl,
		duration,
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

function saveRun(run: EvalRun, resultsDir: string): string {
	mkdirSync(resultsDir, { recursive: true });
	const slug = run.model.replace(/\//g, "--");
	const ts = new Date()
		.toISOString()
		.replace(/[:.]/g, "")
		.replace("T", "-")
		.slice(0, 15);
	const filename = `${ts}_${slug}.json`;
	const filepath = join(resultsDir, filename);
	writeFileSync(filepath, JSON.stringify(run, null, 2));
	return filepath;
}

async function cmdRun() {
	const opts = parseArgs();
	const modelId = opts.model ?? "anthropic/claude-sonnet-4.6";

	const config: EvalConfig = {
		apiUrl: opts.apiUrl,
		authCookie: process.env.EVAL_SESSION_COOKIE,
		apiKey: process.env.EVAL_API_KEY,
		judgeModel: process.env.EVAL_JUDGE_MODEL,
		modelOverride: opts.model,
		skipJudge: true,
	};

	let cases = allCases;
	if (opts.caseId) {
		const c = getCaseById(opts.caseId);
		if (!c) {
			console.error(`Case '${opts.caseId}' not found`);
			process.exit(1);
		}
		cases = [c];
	} else if (opts.category) {
		cases = getCasesByCategory(opts.category);
		if (cases.length === 0) {
			console.error(`No cases for category '${opts.category}'`);
			process.exit(1);
		}
	}

	const c = Math.min(opts.concurrency, cases.length);
	console.log(
		`Running ${cases.length} eval cases against ${config.apiUrl} (concurrency: ${c})...`
	);
	console.log(`Model: ${modelId}`);
	console.log("");

	const runStart = Date.now();
	let completed = 0;

	const results = await runWithConcurrency(
		cases,
		c,
		(evalCase) => runSingleCase(evalCase, config, modelId),
		(evalCase, result) => {
			completed++;
			const status = result.passed
				? "\x1b[32mOK\x1b[0m"
				: result.failures[0]?.startsWith("Runner error")
					? "\x1b[31mERROR\x1b[0m"
					: `\x1b[31mFAIL\x1b[0m (${result.failures.length})`;
			const time = `${(result.metrics.latencyMs / 1000).toFixed(1)}s`;
			const cost =
				result.metrics.costUsd > 0
					? ` $${result.metrics.costUsd.toFixed(4)}`
					: "";
			console.log(
				`  [${completed}/${cases.length}] ${evalCase.id} ${status} ${time}${cost}`
			);
		}
	);

	const run = buildRun(results, modelId, config.apiUrl, Date.now() - runStart);
	printReport(run);

	if (!opts.noSave) {
		const resultsDir = join(import.meta.dir, "..", "results");
		const filepath = saveRun(run, resultsDir);
		console.log(`Saved: ${filepath}`);
	}
}

async function cmdJudge() {
	const opts = parseArgs();
	const resultsDir = join(import.meta.dir, "..", "results");
	const files: string[] = [];

	if (opts.file) {
		files.push(opts.file);
	} else {
		const all = readdirSync(resultsDir)
			.filter((f) => f.endsWith(".json"))
			.sort();
		if (opts.model) {
			const slug = opts.model.replace(/\//g, "--");
			const matching = all.filter((f) => f.includes(slug));
			if (matching.length === 0) {
				console.error(`No results found for model ${opts.model}`);
				process.exit(1);
			}
			files.push(join(resultsDir, matching[matching.length - 1]));
		} else {
			for (const f of all) {
				files.push(join(resultsDir, f));
			}
		}
	}

	const config: EvalConfig = {
		apiUrl: "",
		judgeModel: process.env.EVAL_JUDGE_MODEL,
		skipJudge: false,
	};

	for (const filepath of files) {
		const run: EvalRun = JSON.parse(readFileSync(filepath, "utf-8"));
		console.log(`\nJudging ${run.model} (${filepath})...`);

		let judged = 0;
		for (const c of run.cases) {
			if (c.category !== "quality") {
				continue;
			}

			const existingScore = c.scores.quality;
			const alreadyJudged =
				existingScore !== undefined &&
				existingScore > 0 &&
				(c as unknown as { qualityDetail?: JudgeScores }).qualityDetail !==
					undefined;

			if (alreadyJudged) {
				console.log(`  ${c.id}: already judged (${existingScore}), skipping`);
				continue;
			}
			if (!c.response || c.response.length === 0) {
				console.log(`  ${c.id}: no response stored, skipping`);
				continue;
			}

			const evalCase = getCaseById(c.id);
			if (!evalCase) {
				continue;
			}

			const scores = await judgeQuality(evalCase, c.response, config);
			if (scores === null) {
				console.log(`  ${c.id}: judge failed`);
			} else {
				c.scores.quality = scores.average;
				(c as unknown as { qualityDetail: JudgeScores }).qualityDetail = scores;
				judged++;
				console.log(
					`  ${c.id}: quality=${scores.average} (dg=${scores.dataGrounding} ad=${scores.analyticalDepth} ac=${scores.actionability} co=${scores.completeness} cm=${scores.communication})`
				);
			}
		}

		if (judged > 0) {
			const updated = buildRun(run.cases, run.model, run.apiUrl, run.duration);
			updated.timestamp = run.timestamp;
			writeFileSync(filepath, JSON.stringify(updated, null, 2));
			console.log(`Updated ${filepath} (${judged} cases judged)`);
			printReport(updated);
		} else {
			console.log("No cases to judge");
		}
	}
}

function cmdCompare() {
	const opts = parseArgs();
	const resultsDir = join(import.meta.dir, "..", "results");
	const all = readdirSync(resultsDir)
		.filter((f) => f.endsWith(".json"))
		.sort();

	const latestByModel = new Map<string, EvalRun>();
	for (const f of all) {
		const run: EvalRun = JSON.parse(readFileSync(join(resultsDir, f), "utf-8"));
		if (run.summary.total === 0) {
			continue;
		}
		latestByModel.set(run.model, run);
	}

	const models = [...latestByModel.keys()].sort();
	const caseIds =
		latestByModel
			.values()
			.next()
			.value?.cases.map((c: CaseResult) => c.id) ?? [];

	const COL = 20;
	const pad = (s: string, n: number) =>
		s.length >= n ? s.slice(0, n) : s + " ".repeat(n - s.length);
	const rpad = (s: string, n: number) =>
		s.length >= n ? s.slice(0, n) : " ".repeat(n - s.length) + s;

	const shortName = (m: string) => {
		const parts = m.split("/");
		return parts[parts.length - 1].slice(0, COL - 1);
	};

	console.log(
		`\n${"Case".padEnd(32)} | ${models.map((m) => pad(shortName(m), COL)).join(" | ")}`
	);
	console.log("-".repeat(34 + models.length * (COL + 3)));

	for (const cid of caseIds) {
		let row = pad(cid.slice(0, 30), 32) + " |";
		let hasDiff = false;
		const cellValues: string[] = [];

		for (const model of models) {
			const run = latestByModel.get(model)!;
			const c = run.cases.find((x) => x.id === cid);
			if (!c) {
				cellValues.push(pad("--", COL));
				continue;
			}
			const status = c.passed ? "OK" : "FAIL";
			const t = `${(c.metrics.latencyMs / 1000).toFixed(0)}s`;
			const q =
				c.scores.quality !== undefined && c.scores.quality > 0
					? `q${c.scores.quality}`
					: "";
			const cost =
				c.metrics.costUsd > 0 ? `$${c.metrics.costUsd.toFixed(3)}` : "";
			cellValues.push(pad(`${status} ${t} ${q} ${cost}`.trim(), COL));
		}

		if (opts.diff) {
			const statuses = cellValues.map((v) => v.trim().startsWith("OK"));
			hasDiff = statuses.some((s) => s !== statuses[0]);
		}

		if (!opts.diff || hasDiff) {
			for (const v of cellValues) {
				row += ` ${v} |`;
			}
			console.log(row);
		}
	}

	console.log("-".repeat(34 + models.length * (COL + 3)));
	let summaryRow = pad("TOTAL", 32) + " |";
	for (const model of models) {
		const run = latestByModel.get(model)!;
		const s = run.summary;
		const d = run.dimensions;
		const avgLat =
			run.cases
				.filter((c) => c.passed)
				.reduce((a, c) => a + c.metrics.latencyMs, 0) /
			(s.passed || 1) /
			1000;
		const totalCost = run.cases.reduce(
			(a, c) => a + (c.metrics.costUsd ?? 0),
			0
		);
		const costStr = totalCost > 0 ? ` $${totalCost.toFixed(3)}` : "";
		const q = d.quality > 0 ? ` q${d.quality}` : "";
		summaryRow += ` ${pad(`${s.passed}/${s.total} ${avgLat.toFixed(0)}s${q}${costStr}`, COL)} |`;
	}
	console.log(summaryRow);
	console.log("");
}

async function main() {
	const opts = parseArgs();
	switch (opts.subcommand) {
		case "judge":
			return cmdJudge();
		case "compare":
			return cmdCompare();
		default:
			return cmdRun();
	}
}

main().catch((err) => {
	console.error("Eval failed:", err);
	process.exit(1);
});
