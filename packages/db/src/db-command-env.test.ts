import { chmodSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, it } from "bun:test";
import manifest from "../../../package.json";

const dotenv = join(import.meta.dir, "../../../node_modules/dotenv-cli/cli.js");
const node = Bun.which("node");
if (!node) {
	throw new Error("Node is required to run the dotenv CLI");
}

it.each([
	"db:push",
	"db:studio",
] as const)("defaults %s after dotenv without changing explicit modes or arguments", async (command) => {
	const directory = mkdtempSync(join(tmpdir(), "databuddy-db-command-"));
	try {
		await Bun.write(
			join(directory, "dotenv"),
			'#!/bin/sh\nexec "$DB_COMMAND_NODE" "$DB_COMMAND_DOTENV" "$@"\n'
		);
		await Bun.write(
			join(directory, "turbo"),
			'#!/bin/sh\nexec "$DB_COMMAND_BUN" --no-env-file "$DB_COMMAND_PROBE" "$@"\n'
		);
		await Bun.write(
			join(directory, "probe.ts"),
			"console.log(JSON.stringify({ mode: process.env.NODE_ENV, args: process.argv.slice(2) }));\n"
		);
		chmodSync(join(directory, "dotenv"), 0o755);
		chmodSync(join(directory, "turbo"), 0o755);

		for (const [file, inherited, expected] of [
			["", undefined, "development"],
			["NODE_ENV=\n", undefined, "development"],
			["NODE_ENV=production\n", undefined, "production"],
			["NODE_ENV=test\n", undefined, "test"],
			["NODE_ENV=development\n", "production", "production"],
		] as const) {
			await Bun.write(join(directory, ".env"), file);
			const child = Bun.spawn(
				[
					"/bin/sh",
					"-c",
					`${manifest.scripts[command]} --dry-run "argument with spaces"`,
				],
				{
					cwd: directory,
					env: {
						PATH: `${directory}:/usr/bin:/bin`,
						DB_COMMAND_BUN: process.execPath,
						DB_COMMAND_NODE: node,
						DB_COMMAND_DOTENV: dotenv,
						DB_COMMAND_PROBE: join(directory, "probe.ts"),
						...(inherited === undefined ? {} : { NODE_ENV: inherited }),
					},
					stdout: "pipe",
					stderr: "pipe",
				}
			);
			expect(await child.exited).toBe(0);
			expect(await new Response(child.stdout).json()).toEqual({
				mode: expected,
				args: ["run", command, "--dry-run", "argument with spaces"],
			});
		}
	} finally {
		rmSync(directory, { recursive: true, force: true });
	}
});
