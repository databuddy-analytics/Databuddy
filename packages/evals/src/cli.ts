import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
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
	ScoreCard,
} from "./types";

function parseArgs(): {
	category?: string;
	caseId?: string;
	noSave: boolean;
	noJudge: boolean;
	apiUrl: string;
	concurrency: number;
} {
	const args = process.argv.slice(2);
	let category: string | undefined;
	let caseId: string | undefined;
	let noSave = false;
	let noJudge = false;
	let apiUrl = process.env.EVAL_API_URL ?? "http://localhost:3001";
	let concurrency = 10;

	for (let i = 0; i < args.length; i++) {
		if (args[i] === "--category" && args[i + 1]) {
			category = args[++i];
		} else if (args[i] === "--case" && args[i + 1]) {
			caseId = args[++i];
		} else if (args[i] === "--no-save") {
			noSave = true;
		} else if (args[i] === "--no-judge") {
			noJudge = true;
		} else if (args[i] === "--api-url" && args[i + 1]) {
			apiUrl = args[++i];
		} else if (args[i] === "--concurrency" && args[i + 1]) {
			concurrency = Number.parseInt(args[++i], 10) || 10;
		}
	}

	return { category, caseId, noSave, noJudge, apiUrl, concurrency };
}

async function runSingleCase(
	evalCase: EvalCase,
	config: EvalConfig
): Promise<CaseResult> {
	try {
		const response = await runCase(evalCase, config);
		const { scores, failures } = scoreCase(evalCase, response);

		// LLM judge for quality cases
		if (evalCase.category === "quality" && !config.skipJudge) {
			const qualityScore = await judgeQuality(
				evalCase,
				response.textContent,
				config
			);
			if (qualityScore >= 0) {
				scores.quality = qualityScore;
			}
		}

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

		return {
			id: evalCase.id,
			category: evalCase.category,
			name: evalCase.name,
			passed,
			scores,
			metrics: {
				steps: response.steps,
				latencyMs: response.latencyMs,
				inputTokens: 0,
				outputTokens: 0,
				costUsd: 0,
			},
			toolsCalled: response.toolCalls.map((tc) => tc.name),
			failures,
			response: response.textContent.slice(0, 500),
		};
	} catch (error) {
		const msg = error instanceof Error ? error.message : "Unknown error";
		return {
			id: evalCase.id,
			category: evalCase.category,
			name: evalCase.name,
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
			failures: [`Runner error: ${msg}`],
		};
	}
}

/**
 * Run tasks with concurrency limit.
 */
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

async function main() {
	const opts = parseArgs();

	const config: EvalConfig = {
		apiUrl: opts.apiUrl,
		authCookie: process.env.EVAL_SESSION_COOKIE,
		apiKey: process.env.EVAL_API_KEY,
		judgeModel: process.env.EVAL_JUDGE_MODEL,
		skipJudge: opts.noJudge || process.env.EVAL_SKIP_JUDGE === "true",
	};

	// Select cases
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
			console.error(`No cases found for category '${opts.category}'`);
			process.exit(1);
		}
	}

	const c = Math.min(opts.concurrency, cases.length);
	console.log(
		`Running ${cases.length} eval cases against ${config.apiUrl} (concurrency: ${c})...`
	);
	console.log("");

	const runStart = Date.now();
	let completed = 0;

	const results = await runWithConcurrency(
		cases,
		c,
		(evalCase) => runSingleCase(evalCase, config),
		(evalCase, result) => {
			completed++;
			const status = result.passed
				? "\x1b[32mOK\x1b[0m"
				: result.failures[0]?.startsWith("Runner error")
					? "\x1b[31mERROR\x1b[0m"
					: `\x1b[31mFAIL\x1b[0m (${result.failures.length})`;
			const time = `${(result.metrics.latencyMs / 1000).toFixed(1)}s`;
			console.log(
				`  [${completed}/${cases.length}] ${evalCase.id} ${status} ${time}`
			);
		}
	);

	const totalDuration = Date.now() - runStart;

	// Aggregate dimensions
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

	const run: EvalRun = {
		timestamp: new Date().toISOString(),
		model: "anthropic/claude-sonnet-4.6",
		apiUrl: config.apiUrl,
		duration: totalDuration,
		summary: {
			total: results.length,
			passed: passedCount,
			failed: results.length - passedCount,
			score: overallScore,
		},
		dimensions,
		cases: results,
	};

	printReport(run);

	// Save results
	if (!opts.noSave) {
		const resultsDir = join(import.meta.dir, "..", "results");
		mkdirSync(resultsDir, { recursive: true });
		const filename = `${new Date()
			.toISOString()
			.replace(/[:.]/g, "")
			.replace("T", "-")
			.slice(0, 15)}.json`;
		const filepath = join(resultsDir, filename);
		writeFileSync(filepath, JSON.stringify(run, null, 2));
		console.log(`Saved: ${filepath}`);
	}
}

main().catch((err) => {
	console.error("Eval failed:", err);
	process.exit(1);
});
