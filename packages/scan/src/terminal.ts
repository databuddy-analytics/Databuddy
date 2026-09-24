import { join } from "node:path";
import { stripVTControlCharacters } from "node:util";
import chalk, { Chalk, chalkStderr } from "chalk";
import { createLogUpdate } from "log-update";
import type { Row } from "./evaluate.js";
import type { Destination, ScanResult } from "./scan.js";

export interface Snapshot {
	active: number;
	batches: number;
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
export const clean = (value: string | number | null | undefined) =>
	stripVTControlCharacters(String(value ?? "")).replace(controls, "");
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
}

export function createTerminal({ json = false }: Options = {}) {
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
				`  ${progress.hex("#e3a514")("━".repeat(filled))}${progress.dim("─".repeat(28 - filled))} ${Math.round(fraction * 100)}%`,
				`  ${snapshot.classifiedFiles} / ${snapshot.includedFiles} files · ${elapsed(snapshot.elapsedSeconds)}`,
				"",
				progress.hex("#e3a514")(`  ${found.length} files to review`),
				...found
					.slice(0, 3)
					.map((row) => `  ${location(row)} · ${areas[row.category]}`),
			].join("\n")
		);
	}

	function announce({
		destination,
		files,
	}: {
		destination: Destination;
		files: number;
	}) {
		process.stderr.write(
			destination.kind === "databuddy"
				? `Sending ${files} files to Databuddy's scan API (${destination.host}). Jev classifies them with zero data retention; your source is never stored or logged. Set AI_GATEWAY_API_KEY to use your own Vercel AI Gateway instead.\n`
				: `Sending ${files} files directly to your Vercel AI Gateway account (${destination.host}) with zero data retention. Databuddy receives nothing.\n`
		);
	}

	function dryRun(result: {
		destination: Destination;
		files: string[];
		skippedFiles: number;
	}) {
		if (json) {
			return print([
				JSON.stringify({ ...result, sent: false, zeroDataRetention: true }),
			]);
		}
		print([
			"",
			title,
			"",
			`  Would send ${result.files.length} files to ${result.destination.host}. Nothing was sent.`,
			"",
			...result.files.map((path) => `  ${clean(path)}`),
			"",
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
			`  ${s.interrupted ? "Stopped" : "Scan complete"} · ${uniqueFiles(flagged).length} files to review · ${flagged.length} findings · ${elapsed(s.wallSeconds)}`,
			"",
			...visible.map(
				(row) =>
					`  ${location(row)} · ${row.action ? `${clean(row.action.label)} · ` : ""}${row.coverage} · ${areas[row.category]}`
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
				`  ${s.failures + s.unattemptedBatches} batches did not finish. Run again to retry them; finished work is kept.`
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
			const text = json
				? JSON.stringify({ error: clean(message) })
				: `Error: ${clean(message)}`;
			process.stderr.write(`${text}\n`);
		},
	};
}
