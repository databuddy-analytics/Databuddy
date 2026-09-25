#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, relative, resolve } from "node:path";
import { Command, CommanderError, Option } from "commander";
import { z } from "zod";
import { version } from "../package.json";
import { hash, scan, scanOptionsSchema } from "./scan";
import { createTerminal, privacy } from "./terminal";

const optionsSchema = scanOptionsSchema.extend({
	json: z.boolean().default(false),
});
const command = new Command()
	.name("databuddy-scan")
	.description(
		`Find where your product is missing analytics events.\n\n${privacy}\n\nResults are cached in ~/.cache/databuddy/scan, so unchanged code is not sent again.`
	)
	.version(version)
	.argument(
		"[path]",
		"directory or file to scan; code outside it is never sent",
		"."
	)
	.option("--dry-run", "list every line that would be sent, and send nothing")
	.option("--json", "print results as JSON")
	.addOption(new Option("--output <path>").hideHelp())
	.addOption(new Option("--concurrency <count>").hideHelp())
	.addOption(new Option("--batch-files <count>").hideHelp())
	.addOption(new Option("--cache-only").hideHelp())
	.addOption(new Option("--fresh").conflicts("cacheOnly").hideHelp())
	.addOption(new Option("--no-actions").hideHelp())
	.exitOverride();

async function main() {
	command.parse();
	const options = optionsSchema.parse({
		...command.opts(),
		root: command.args[0] ?? ".",
	});
	const terminal = createTerminal(options);
	try {
		let root: string, target: string;
		try {
			target = await realpath(resolve(options.root));
			root = await realpath(
				execFileSync("git", ["rev-parse", "--show-toplevel"], {
					cwd: (await stat(target)).isFile() ? dirname(target) : target,
					encoding: "utf8",
					stdio: ["ignore", "pipe", "pipe"],
				}).trim()
			);
		} catch {
			throw new Error(
				"Run inside a Git repository, or pass its path: databuddy-scan <path>"
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
		const result = await scan(
			{ ...options, root, output, scope: relative(root, target) },
			terminal.update,
			terminal.announce
		);
		if ("dryRun" in result) {
			terminal.dryRun(result);
			return;
		}
		terminal.finish(result);
		process.exitCode = result.summary.interrupted
			? 130
			: result.summary.failures || result.summary.unattemptedBatches
				? 1
				: 0;
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
	}).error(message);
	process.exitCode = 1;
});
