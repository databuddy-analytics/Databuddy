import { stripVTControlCharacters } from "node:util";
import chalk, { Chalk, chalkStderr } from "chalk";
import { createLogUpdate } from "log-update";
import { hostedScanUrl, type Row } from "./evaluate.js";
import type { ScanResult, scan } from "./scan.js";

export interface Snapshot {
	batches: number;
	classifiedFiles: number;
	completedBatches: number;
	elapsedSeconds: number;
	includedFiles: number;
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
};
export const privacy = `Code is sent to Databuddy's scan API (${new URL(hostedScanUrl).host}), which classifies it with the Jev model (typesafe-ai/jev) on Vercel AI Gateway under zero data retention: your source is never stored or logged. Only the actions it finds and the functions they call are sent, not whole files, except for Swift and any file it cannot parse; --dry-run lists every line without sending anything. Set AI_GATEWAY_API_KEY to send it to your own Vercel AI Gateway account instead, and Databuddy receives nothing. How the scanner handles your code: https://www.databuddy.cc/docs/privacy/event-scanner`;
// biome-ignore lint/suspicious/noControlCharactersInRegex: Source paths and provider labels must not control the terminal.
const controls = /[\x00-\x1f\x7f-\x9f\u202a-\u202e\u2066-\u2069]/g;
const clean = (value: string | number | null | undefined) =>
	stripVTControlCharacters(String(value ?? "")).replace(controls, "");
const gaps = (rows: Row[]) =>
	rows.filter(
		(row) => row.coverage === "missing" || row.coverage === "partial"
	);
function uniqueFiles(rows: Row[]) {
	const found = new Map<string, Row>();
	for (const row of rows) {
		if (!found.has(row.path)) {
			found.set(row.path, row);
		}
	}
	return [...found.values()];
}
const count = (value: number, one: string, many = `${one}s`) =>
	`${value} ${value === 1 ? one : many}`;
const elapsed = (seconds: number) =>
	seconds < 60
		? `${Math.round(seconds)}s`
		: `${Math.floor(seconds / 60)}m ${Math.floor(seconds % 60)}s`;
const location = (row: Row) => `${clean(row.path)}:${row.start}`;
const area = (row: Row) =>
	row.category !== "none" && (row.categoryProbability ?? 1) >= 0.5
		? ` · ${areas[row.category]}`
		: "";
const accent = "#e3a514";
type DryRun = Extract<Awaited<ReturnType<typeof scan>>, { dryRun: true }>;

export function createTerminal({ json = false }: { json?: boolean } = {}) {
	const interactive =
		process.stderr.isTTY && process.env.TERM !== "dumb" && !json;
	const noColor =
		json ||
		Object.hasOwn(process.env, "NO_COLOR") ||
		process.env.TERM === "dumb";
	const monochrome = new Chalk({ level: 0 });
	const output = noColor ? monochrome : chalk;
	const progress = noColor ? monochrome : chalkStderr;
	const live = createLogUpdate(process.stderr);
	const print = (lines: string[]) =>
		process.stdout.write(`${lines.join("\n")}\n`);
	const title = `  ${output.bold("databuddy.")} ${output.dim("/ event scan")}`;
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
		rendered = true;
		live(
			[
				title,
				"",
				`  ${progress.hex(accent)("━".repeat(filled))}${progress.dim("─".repeat(28 - filled))} ${Math.round(fraction * 100)}%`,
				`  ${snapshot.classifiedFiles} / ${snapshot.includedFiles} files · ${elapsed(snapshot.elapsedSeconds)}`,
				"",
				progress.hex(accent)(`  ${count(found.length, "file")} to review`),
				...found.slice(0, 3).map((row) => `  ${location(row)}${area(row)}`),
			].join("\n")
		);
	}

	function announce({
		destination,
		files,
	}: {
		destination: DryRun["destination"];
		files: number;
	}) {
		process.stderr.write(
			files === 0
				? "Nothing to send: every result is cached from an earlier scan.\n"
				: destination.kind === "databuddy"
					? `Sending code from ${count(files, "file")} to Databuddy's scan API (${destination.host}). Jev classifies it on Vercel AI Gateway with zero data retention; your source is never stored or logged. Preview with --dry-run, or set AI_GATEWAY_API_KEY to use your own gateway. https://www.databuddy.cc/docs/privacy/event-scanner\n`
					: `Sending code from ${count(files, "file")} directly to your Vercel AI Gateway account (${destination.host}) with zero data retention. Databuddy receives nothing.\n`
		);
	}

	function notes(warnings: string[]) {
		return warnings.flatMap((warning) => [
			`  ${output.hex(accent)("Warning:")} ${clean(warning)}`,
			"",
		]);
	}

	function dryRun(result: DryRun) {
		if (json) {
			return print([
				JSON.stringify({ ...result, sent: false, zeroDataRetention: true }),
			]);
		}
		const width = Math.max(0, ...result.files.map((file) => file.path.length));
		if (result.files.length === 0) {
			return print([
				"",
				title,
				"",
				`  Nothing to send: none of the ${count(result.skippedFiles, "file")} here has a user action to review. Scan a wider folder.`,
				"",
				...notes(result.warnings),
			]);
		}
		print([
			"",
			title,
			"",
			`  Would send these lines from ${count(result.files.length, "file")} to ${result.destination.host}. Nothing was sent.`,
			"",
			...result.files.map(
				(file) =>
					`  ${clean(file.path).padEnd(width)}  ${file.lines.map(([start, end]) => (start === end ? start : `${start}-${end}`)).join(", ")}`
			),
			"",
			`  Not sent: ${count(result.skippedFiles, "other file")} with nothing to review. --dry-run --json prints the exact payload.`,
			"",
			...notes(result.warnings),
		]);
	}

	function finish(result: ScanResult) {
		stop();
		if (json) {
			return print([JSON.stringify(result)]);
		}
		const { summary: s, rows } = result;
		const flagged = gaps(rows);
		const visible = interactive ? flagged.slice(0, 10) : flagged;
		const lines = [
			"",
			title,
			"",
			`  ${s.interrupted ? "Stopped" : "Scan complete"} · ${count(flagged.length, "finding")} in ${count(uniqueFiles(flagged).length, "file")} · ${elapsed(s.wallSeconds)}`,
			"",
			...notes(s.warnings),
			...visible.map(
				(row) =>
					`  ${location(row)} · ${row.action ? `${clean(row.action.label)} · ` : ""}${row.coverage}${area(row)}`
			),
		];
		if (flagged.length > visible.length) {
			lines.push(
				`  ${flagged.length - visible.length} more · databuddy-scan --json lists every finding`
			);
		}
		if (s.failures || s.unattemptedBatches || s.interrupted) {
			lines.push(
				"",
				`  ${count(s.failures + s.unattemptedBatches, "batch", "batches")} did not finish. Run again to retry them; finished work is kept.`
			);
		}
		print([...lines, ""]);
	}

	return {
		update,
		announce,
		dryRun,
		finish,
		stop,
		error(message: string) {
			stop();
			if (json) {
				process.stdout.write(`${JSON.stringify({ error: clean(message) })}\n`);
				return;
			}
			process.stderr.write(`Error: ${clean(message)}\n`);
		},
	};
}
