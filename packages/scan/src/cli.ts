#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { realpath } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { Command, CommanderError, Option } from "commander";
import { z } from "zod";
import { version } from "../package.json";
import { hash, readJSON, resultSchema, scan, scanOptionsSchema } from "./scan";
import { createTerminal } from "./terminal";

const optionsSchema = scanOptionsSchema.extend({
	report: z.boolean().default(false),
	diagnostics: z.boolean().default(false),
	plain: z.boolean().default(false),
	json: z.boolean().default(false),
	verbose: z.boolean().default(false),
});
const command = new Command()
	.name("databuddy-scan")
	.description(
		"Find product analytics gaps in your Git repository.\nPreview offline, or use --run to send source to Jev through Vercel AI Gateway."
	)
	.version(version)
	.option("--run", "Scan or resume")
	.option("--actions", "Group product actions with their evidence (default)")
	.option(
		"--no-actions",
		"Review whole files instead: slower, and weaker at spotting existing coverage"
	)
	.addOption(
		new Option("--fresh", "Scan without reusing responses").conflicts(
			"cacheOnly"
		)
	)
	.option("--cache-only", "Replay matching responses without network or writes")
	.addOption(
		new Option("--report", "Show saved findings").conflicts([
			"run",
			"fresh",
			"cacheOnly",
			"diagnostics",
		])
	)
	.addOption(
		new Option(
			"--diagnostics",
			"Explain request failures and output quality"
		).conflicts(["run", "fresh", "cacheOnly"])
	)
	.option("--root <path>", "Repository to scan (default: current repository)")
	.option(
		"--output <path>",
		"Results directory (default: per-repository user cache)"
	)
	.option("--concurrency <count>", "Concurrent requests (default: 8)")
	.option("--timeout-ms <milliseconds>", "Request timeout (default: 15000)")
	.option("--batch-files <count>", "Maximum segments per request (default: 4)")
	.option(
		"--max-request-bytes <count>",
		"Packing budget per request; one oversized segment still ships alone (default: 48000)"
	)
	.option("--verbose", "Show every source location and request details")
	.option("--plain", "Disable terminal control codes")
	.option("--json", "Write JSON without progress output")
	.addHelpText(
		"after",
		"\nExamples:\n  npx @databuddy/scan --run\n  bunx @databuddy/scan --report --verbose\n\nRequires AI_GATEWAY_API_KEY for new requests. Zero data retention is requested.\nCtrl+C saves completed work; repeat --run to resume."
	)
	.exitOverride();

async function main() {
	command.parse();
	const options = optionsSchema.parse(command.opts());
	const terminal = createTerminal(options);
	try {
		let root: string;
		try {
			root = await realpath(
				execFileSync("git", ["rev-parse", "--show-toplevel"], {
					cwd: resolve(options.root),
					encoding: "utf8",
					stdio: ["ignore", "pipe", "pipe"],
				}).trim()
			);
		} catch {
			throw new Error(
				"Run inside a Git repository, or use --root=/path/to/repository."
			);
		}
		const output = resolve(
			options.output ??
				join(
					process.env.XDG_CACHE_HOME ?? join(homedir(), ".cache"),
					"databuddy",
					"scan",
					hash(root).slice(0, 16)
				)
		);
		if (options.report || options.diagnostics) {
			const saved = await readJSON(join(output, "results.json"));
			if (!saved) {
				throw new Error("No saved scan for this repository. Use --run first.");
			}
			const parsed = resultSchema.safeParse(saved);
			if (!parsed.success) {
				throw new Error(
					"Saved results use an older or invalid format. Run --run to rebuild them using the cached responses."
				);
			}
			if (parsed.data.summary.root !== root) {
				throw new Error(
					"This output directory belongs to another repository. Choose another --output."
				);
			}
			if (options.diagnostics) {
				terminal.diagnostics(parsed.data, output);
			} else {
				terminal.finish(parsed.data, { saved: true, directory: output });
			}
			return;
		}
		const result = await scan({ ...options, root, output }, terminal.update);
		if ("summary" in result) {
			terminal.finish(result, { directory: output });
			process.exitCode = result.summary.interrupted
				? 130
				: result.summary.failures || result.summary.unattemptedBatches
					? 1
					: 0;
		} else {
			terminal.inventory(result);
		}
	} catch (error) {
		terminal.error(error instanceof Error ? error.message : "Scan failed");
		process.exitCode = 1;
	} finally {
		terminal.stop();
	}
}
main().catch((error) => {
	if (error instanceof CommanderError) {
		process.exitCode = error.exitCode;
		return;
	}
	const message =
		error instanceof z.ZodError
			? error.issues
					.map((issue) => `${issue.path.join(".")}: ${issue.message}`)
					.join("; ")
			: "Could not start the scanner.";
	createTerminal({
		json: command.opts<{ json?: boolean }>().json ?? false,
		plain: true,
		verbose: false,
	}).error(message);
	process.exitCode = 1;
});
