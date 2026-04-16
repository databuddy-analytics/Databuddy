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
	console.log("");
	console.log(`${BOLD}Agent Eval - ${run.timestamp}${RESET}`);
	console.log(`Model: ${run.model}`);
	console.log(`API: ${run.apiUrl}`);
	console.log(`Duration: ${(run.duration / 1000).toFixed(1)}s`);
	console.log("");

	// Header
	const header = ` # | ${pad("Case", 28)} | Pass | Tools | Behav | Qual  | Fmt   | Perf  | Time`;
	console.log(header);
	console.log("-".repeat(header.length));

	// Rows
	for (let i = 0; i < run.cases.length; i++) {
		const c = run.cases[i];
		const status = c.passed ? PASS : FAIL;
		const time = `${(c.metrics.latencyMs / 1000).toFixed(1)}s`;
		const row = `${pad(String(i + 1), 2)} | ${pad(c.id, 28)} | ${status} | ${padNum(c.scores.tool_routing)} | ${padNum(c.scores.behavioral)} | ${padNum(c.scores.quality)} | ${padNum(c.scores.format)} | ${padNum(c.scores.performance)} | ${time}`;
		console.log(row);

		// Print failures inline
		if (c.failures.length > 0) {
			for (const f of c.failures) {
				console.log(`${DIM}     -> ${f}${RESET}`);
			}
		}
	}

	console.log("");
	const s = run.summary;
	const d = run.dimensions;
	console.log(
		`${BOLD}Summary:${RESET} ${s.passed}/${s.total} passed (${s.score}%) | Tools: ${d.tool_routing} | Behavioral: ${d.behavioral} | Quality: ${d.quality} | Format: ${d.format} | Perf: ${d.performance}`
	);
	console.log("");
}
