import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import chalk, { Chalk, chalkStderr } from "chalk";
import { createLogUpdate } from "log-update";
import type { Row } from "./evaluate.js";
import type { ScanResult } from "./scan.js";

export interface Snapshot {
	active: number;
	batches: number;
	cacheOnly: boolean;
	classifiedFiles: number;
	completedBatches: number;
	elapsedSeconds: number;
	failures: number;
	includedFiles: number;
	retries: number;
	rows: Row[];
}

const areas = {
	revenue: "Payments",
	activation: "Setup & onboarding",
	investigation: "Core workflows",
	integration: "Integrations",
	agent: "AI features",
	analysis: "Analytics",
	retention: "Engagement",
	acquisition: "Acquisition",
	none: "Other actions",
};
// biome-ignore lint/suspicious/noControlCharactersInRegex: Source paths and provider labels must not control the terminal.
const controls = /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g;
export const clean = (value: unknown) =>
	stripVTControlCharacters(String(value ?? "")).replace(controls, "");
// Coverage and area are answered independently, so a gap with no product area is the model
// disagreeing with itself. Those rows measure weaker, so they rank below findings that agree.
const disputed = (row: Row) => (row.category === "none" ? 1 : 0);
const gaps = (rows: Row[]) =>
	rows
		.filter((row) => row.coverage === "missing" || row.coverage === "partial")
		.sort((a, b) => disputed(a) - disputed(b) || b.priority - a.priority);
function uniqueFiles(rows: Row[]) {
	const found = new Map<string, Row>();
	for (const row of rows) {
		if (!found.has(row.path)) {
			found.set(row.path, row);
		}
	}
	return [...found.values()];
}
const elapsed = (seconds: number) =>
	seconds < 60
		? `${Math.round(seconds)}s`
		: `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
const location = (row: Row, root = "") =>
	`${clean(root ? join(root, row.path) : row.path)}:${row.start}`;
interface Options {
	json?: boolean;
	plain?: boolean;
	verbose?: boolean;
}

export function createTerminal({
	json = false,
	plain = false,
	verbose = false,
}: Options = {}) {
	const interactive =
		process.stderr.isTTY && process.env.TERM !== "dumb" && !plain && !json;
	const noColor =
		plain ||
		json ||
		Object.hasOwn(process.env, "NO_COLOR") ||
		process.env.TERM === "dumb";
	const monochrome = new Chalk({ level: 0 });
	const output = noColor ? monochrome : chalk;
	const progress = noColor ? monochrome : chalkStderr;
	const live = createLogUpdate(process.stderr);
	const print = (lines: string[]) =>
		process.stdout.write(`${lines.join("\n")}\n`);
	const title = (suffix = "") =>
		`  ${output.bold("databuddy.")} ${output.dim(`/ event scan${suffix}`)}`;
	let rendered = false;

	function stop() {
		if (rendered) {
			live.clear();
			live.done();
			rendered = false;
		}
	}

	function update(snapshot: Snapshot) {
		if (!interactive) {
			return;
		}
		const found = uniqueFiles(gaps(snapshot.rows));
		const fraction = snapshot.batches
			? Math.min(1, snapshot.completedBatches / snapshot.batches)
			: 0;
		const filled = Math.round(fraction * 28);
		const lines = [
			`  ${progress.bold("databuddy.")} ${progress.dim("/ event scan")}`,
			"",
			`  ${snapshot.cacheOnly ? "Reading saved responses" : "Scanning your code"}`,
			`  ${progress.hex("#e3a514")("━".repeat(filled))}${progress.dim("─".repeat(28 - filled))} ${Math.round(fraction * 100)}%`,
			`  ${snapshot.classifiedFiles} / ${snapshot.includedFiles} files · ${elapsed(snapshot.elapsedSeconds)}`,
			"",
			progress.hex("#e3a514")(`  ${found.length} files to review`),
			...found
				.slice(0, 3)
				.map((row) => `  ${location(row)} · ${areas[row.category]}`),
		];
		if (verbose) {
			lines.push(
				`  ${snapshot.active} active · ${snapshot.retries} retries · ${snapshot.failures} failed`
			);
		}
		rendered = true;
		live(lines.join("\n"));
	}

	function finish(
		result: ScanResult,
		options: { saved?: boolean; directory?: string } = {}
	) {
		stop();
		if (json) {
			return print([JSON.stringify(result)]);
		}
		const { summary: s, rows } = result;
		const flagged = gaps(rows),
			found = uniqueFiles(flagged);
		const uncertain = rows.filter((row) => row.coverage === "uncertain");
		const incomplete =
			s.failures > 0 ||
			s.unattemptedBatches > 0 ||
			s.classifiedFiles < s.includedFiles;
		let status = incomplete ? "Scan incomplete" : "Scan complete";
		if (s.interrupted) {
			status = "Stopped";
		}
		const suffix = options.saved || s.cacheOnly ? " · saved results" : "";
		const lines = [
			"",
			title(suffix),
			"",
			`  ${output.hex("#e3a514")(status)} · ${s.classifiedFiles} / ${s.includedFiles} files · ${incomplete ? `${s.classifiedSegments} / ${s.segments} segments · ` : ""}${s.skippedFiles ? `${s.skippedFiles} skipped · ` : ""}${elapsed(s.wallSeconds)}`,
			"",
			output.hex("#e3a514")(`  ${found.length} files to review`),
		];
		if (flagged.length) {
			lines.push("  Potential gaps · review the source");
		}
		const visible = verbose ? flagged : found.slice(0, 3);
		for (const row of visible) {
			lines.push(
				`  ${location(row, verbose ? s.root : "")} · ${row.action ? `${clean(row.action.label)} · ` : ""}${row.coverage} · ${areas[row.category]}`
			);
		}
		if (!verbose && flagged.length > visible.length) {
			lines.push("  All locations: databuddy-scan --report --verbose");
		}
		if (uncertain.length) {
			lines.push(
				`  ${uniqueFiles(uncertain).length} files have uncertain segments`
			);
			if (verbose) {
				lines.push(
					...uncertain.map(
						(row) =>
							`  ${location(row, s.root)} · ${row.action ? `${clean(row.action.label)} · ` : ""}needs context`
					)
				);
			}
		}
		if (incomplete || s.interrupted) {
			lines.push(
				"",
				"  Progress saved. Continue: databuddy-scan --run",
				"  Diagnose: databuddy-scan --diagnostics"
			);
		}
		if (verbose) {
			for (const call of result.calls
				.filter((call) => call.error)
				.slice(0, 3)) {
				lines.push(`  Batch ${call.batch + 1}: ${clean(call.error)}`);
			}
			if (options.directory) {
				lines.push(`  Reports: ${clean(options.directory)}`);
			}
		}
		print([...lines, ""]);
	}

	function diagnostics(result: ScanResult, directory: string) {
		stop();
		const s = result.summary;
		const attempts = result.calls.flatMap((call) => call.attempts);
		const statuses = new Map<string, number>();
		for (const attempt of attempts) {
			const status =
				attempt.providerCode ?? attempt.error ?? String(attempt.status);
			statuses.set(status, (statuses.get(status) ?? 0) + 1);
		}
		const latency = attempts
			.map((attempt) => attempt.ms)
			.filter(Number.isFinite)
			.sort((a, b) => a - b);
		const percentile = (fraction: number) =>
			latency[Math.ceil(latency.length * fraction) - 1] ?? null;
		const data = {
			files: `${s.classifiedFiles}/${s.includedFiles}`,
			requests: attempts.length,
			retries: s.retries,
			cachedBatches: s.cachedBatches,
			failedBatches: s.failures,
			unattemptedBatches: s.unattemptedBatches,
			statuses: Object.fromEntries(statuses),
			latencyMs: { p50: percentile(0.5), p95: percentile(0.95) },
			batchLatencyMs: (() => {
				const spent = result.calls.map((call) => call.ms).sort((a, b) => a - b);
				return {
					p50: spent[Math.ceil(spent.length * 0.5) - 1] ?? null,
					p95: spent[Math.ceil(spent.length * 0.95) - 1] ?? null,
				};
			})(),
			skippedFiles: s.skippedFiles,
			oversizedBatches: s.oversizedBatches,
			splitBatches: s.splitBatches,
			reviewFiles: uniqueFiles(gaps(result.rows)).length,
			uncertainSegments: result.rows.filter(
				(row) => row.coverage === "uncertain"
			).length,
			reportedCostUsd: s.currentRunReportedCostUsd,
			unknownFailedCallCosts: s.unknownFailedCallCosts,
			missingCostReports: s.missingCostReports,
		};
		if (json) {
			return print([JSON.stringify(data)]);
		}
		const statusCounts = [...statuses]
			.map(([status, count]) => `${clean(status)}: ${count}`)
			.join(", ");
		print([
			"",
			title(" · diagnostics"),
			"",
			`  ${data.files} files · ${data.failedBatches} failed batches · ${data.unattemptedBatches} unattempted`,
			`  ${data.skippedFiles} files skipped with no detected action · listed in inventory.json`,
			`  ${data.requests} requests · ${data.retries} retries · ${statusCounts}`,
			`  ${data.splitBatches} batches split after a failure · ${data.oversizedBatches} single segments over the request limit`,
			`  Request latency: median ${data.latencyMs.p50 ?? "—"} ms · p95 ${data.latencyMs.p95 ?? "—"} ms`,
			`  Batch latency, retries included: median ${data.batchLatencyMs.p50 ?? "—"} ms · p95 ${data.batchLatencyMs.p95 ?? "—"} ms`,
			`  ${data.cachedBatches} cached responses · no new requests for cached results`,
			`  $${data.reportedCostUsd.toFixed(3)} reported this run · ${data.unknownFailedCallCosts} failed request costs unknown · ${data.missingCostReports} responses missing cost`,
			`  ${data.reviewFiles} files flagged · ${data.uncertainSegments} uncertain segments`,
			`  Request log: ${clean(join(directory, "progress.ndjson"))}`,
			"",
		]);
	}

	return {
		update,
		finish,
		diagnostics,
		stop,
		inventory(info: { includedFiles: number; skippedFiles: number }) {
			print(
				json
					? [JSON.stringify(info)]
					: [
							"",
							title(),
							"",
							`  ${info.includedFiles} files with product actions ready to scan${info.skippedFiles ? ` · ${info.skippedFiles} with none detected` : ""}. Start: databuddy-scan --run`,
							"",
						]
			);
		},
		error(message: string) {
			stop();
			const text = json
				? JSON.stringify({ error: clean(message) })
				: `Error: ${clean(message)}`;
			process.stderr.write(`${text}\n`);
		},
	};
}
