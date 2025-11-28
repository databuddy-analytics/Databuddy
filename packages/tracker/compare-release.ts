import { file, hash, spawn } from "bun";
import chalk from "chalk";

const REMOTE_BASE_URL = "https://databuddy.b-cdn.net";

const FILES_TO_COMPARE = ["databuddy.js", "vitals.js", "errors.js"];

function getHash(content: string): string {
	return hash(content).toString();
}

async function getRemoteFile(filename: string) {
	const url = `${REMOTE_BASE_URL}/${filename}`;
	try {
		const response = await fetch(url);
		if (!response.ok) {
			throw new Error(`Failed to fetch ${filename}: ${response.statusText}`);
		}
		const lastModified = response.headers.get("last-modified");
		const content = await response.text();
		return { content, lastModified, url };
	} catch (error) {
		console.error(chalk.red(`Error fetching ${filename}:`), error);
		return null;
	}
}

async function buildLocalScript() {
	const proc = spawn(["bun", "build.ts"], {
		stdout: "pipe",
		stderr: "pipe",
	});
	await proc.exited;

	if (proc.exitCode !== 0) {
		throw new Error("Build failed");
	}
}

async function getLocalFile(filename: string) {
	const fileContent = file(`./dist/${filename}`);
	if (!(await fileContent.exists())) {
		throw new Error(`Local file not found: ./dist/${filename}`);
	}
	return await fileContent.text();
}

async function compareFile(filename: string) {
	console.log(chalk.blue(`\nℹ️  Checking ${chalk.bold(filename)}...`));

	const remote = await getRemoteFile(filename);
	if (!remote) {
		return;
	}

	let localContent = "";
	try {
		localContent = await getLocalFile(filename);
	} catch (error) {
		console.error(chalk.red(`Failed to read local ${filename}:`), error);
		return;
	}

	const remoteHash = getHash(remote.content);
	const localHash = getHash(localContent);

	console.log(chalk.gray(`  Remote URL:     ${remote.url}`));
	console.log(
		chalk.gray(
			`  Last Modified:  ${remote.lastModified ? new Date(remote.lastModified).toLocaleString() : "Unknown"}`
		)
	);
	console.log(chalk.gray(`  Remote Hash:    ${remoteHash}`));
	console.log(chalk.gray(`  Local Hash:     ${localHash}`));

	if (remoteHash === localHash) {
		console.log(chalk.green("  ✅ Match"));
	} else {
		console.log(chalk.yellow("  ⚠️  Mismatch"));
	}
}

async function main() {
	console.log(chalk.bold("🔍 Databuddy Release Diff"));
	console.log(chalk.gray("──────────────────────────"));

	console.log(chalk.blue("ℹ️  Building local scripts..."));
	try {
		await buildLocalScript();
	} catch (error) {
		console.error(chalk.red("Build failed:"), error);
		process.exit(1);
	}

	for (const filename of FILES_TO_COMPARE) {
		await compareFile(filename);
	}
}

main();
