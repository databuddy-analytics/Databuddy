import type { EvalRun } from "./types";

const PASS = "\x1b[32mPASS\x1b[0m";
const FAIL = "\x1b[31mFAIL\x1b[0m";
const DIM = "\x1b[2m";
const RESET = "\x1b[0m";
const BOLD = "\x1b[1m";

function pad(str: string, len: number): string {
	return str.length >= len
		? str.slice(0, len)
		: str + " ".repeat(len - str.length);
}

function padNum(n: number | undefined, len = 5): string {
	if (n === undefined || n < 0) {
		return pad("--", len);
	}
	return pad(String(n), len);
}

export function printReport(run: EvalRun): void {
	const runner = run.runner ?? "api";
	console.log("");
	console.log(`${BOLD}Agent Eval - ${run.timestamp}${RESET}`);
	console.log(`Model: ${run.model}`);
	console.log(`Runner: ${runner}${runner === "api" ? ` (${run.apiUrl})` : ""}`);
	if (run.filters?.surfaces?.length) {
		console.log(`Surfaces: ${run.filters.surfaces.join(", ")}`);
	}
	if (run.filters?.tags?.length || run.filters?.excludeTags?.length) {
		console.log(
			`Tags: ${run.filters.tags?.join(", ") || "any"}${run.filters.excludeTags?.length ? ` | exclude: ${run.filters.excludeTags.join(", ")}` : ""}`
		);
	}
	console.log(`Duration: ${(run.duration / 1000).toFixed(1)}s`);
	console.log("");

	const header = ` # | ${pad("Case", 28)} | Pass | Tools | Behav | Qual  | Fmt   | Perf  | Cost    | Time`;
	console.log(header);
	console.log("-".repeat(header.length));

	let totalCost = 0;
	let totalJudgeCost = 0;
	for (let i = 0; i < run.cases.length; i++) {
		const c = run.cases[i];
		const status = c.passed ? PASS : FAIL;
		const time = `${(c.metrics.latencyMs / 1000).toFixed(1)}s`;
		const caseTotalCost = c.metrics.costUsd + (c.metrics.judgeCostUsd ?? 0);
		const cost =
			caseTotalCost > 0 ? `$${caseTotalCost.toFixed(4)}` : pad("--", 7);
		totalCost += c.metrics.costUsd;
		totalJudgeCost += c.metrics.judgeCostUsd ?? 0;
		const row = `${pad(String(i + 1), 2)} | ${pad(c.id, 28)} | ${status} | ${padNum(c.scores.tool_routing)} | ${padNum(c.scores.behavioral)} | ${padNum(c.scores.quality)} | ${padNum(c.scores.format)} | ${padNum(c.scores.performance)} | ${pad(cost, 7)} | ${time}`;
		console.log(row);

		if (c.failures.length > 0) {
			for (const f of c.failures) {
				console.log(`${DIM}     -> ${f}${RESET}`);
			}
		}
		if (c.warnings?.length > 0) {
			for (const w of c.warnings) {
				console.log(`${DIM}     ~  ${w}${RESET}`);
			}
		}
	}

	console.log("");
	const s = run.summary;
	const d = run.dimensions;
	const grandTotal = totalCost + totalJudgeCost;
	const passRate = s.total > 0 ? Math.round((s.passed / s.total) * 100) : 0;
	const runnerErrors = run.cases.filter((c) =>
		c.failures.some((failure) => failure.startsWith("Runner error:"))
	).length;
	const runnerErrorStr =
		runnerErrors > 0 ? ` | Runner errors: ${runnerErrors}` : "";
	const costStr =
		grandTotal > 0
			? ` | Cost: $${grandTotal.toFixed(4)} (agent: $${totalCost.toFixed(4)}, judge: $${totalJudgeCost.toFixed(4)})`
			: "";
	console.log(
		`${BOLD}Summary:${RESET} ${s.passed}/${s.total} passed (${passRate}% pass rate, score ${s.score}) | Tools: ${d.tool_routing} | Behavioral: ${d.behavioral} | Quality: ${d.quality} | Format: ${d.format} | Perf: ${d.performance}${runnerErrorStr}${costStr}`
	);
	console.log("");
}
