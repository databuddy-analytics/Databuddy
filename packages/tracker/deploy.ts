import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { file, spawn } from "bun";
import chalk from "chalk";
import { Command } from "commander";
import { db, desc, eq, trackerVersions } from "@databuddy/db";

const program = new Command();

program
	.name("deploy")
	.description("Deploy Databuddy tracker scripts to Bunny.net Storage")
	.option("-d, --dry-run", "Simulate the deployment without uploading files")
	.option("-y, --yes", "Skip confirmation prompt")
	.option("-f, --force", "Force upload even if hash matches")
	.option("-m, --message <text>", "Add a note to the deployment notification")
	.option("-s, --skip-notification", "Skip sending Discord notification")
	.option("-t, --skip-tests", "Skip running E2E tests before deployment")
	.option("-b, --skip-build", "Skip building before deployment")
	.option("-p, --purge", "Only purge cache, skip deployment")
	.option("-v, --verbose", "Enable verbose logging")
	.parse(process.argv);

const options = program.opts<{
	dryRun: boolean;
	yes: boolean;
	force: boolean;
	message?: string;
	skipNotification?: boolean;
	skipTests?: boolean;
	skipBuild?: boolean;
	purge?: boolean;
	verbose: boolean;
}>();

const STORAGE_ZONE_NAME = process.env.BUNNY_STORAGE_ZONE_NAME;
const ACCESS_KEY = process.env.BUNNY_STORAGE_ACCESS_KEY;
const API_KEY = process.env.BUNNY_API_KEY;
const PULL_ZONE_ID = process.env.BUNNY_PULL_ZONE_ID;
const REGION = process.env.BUNNY_STORAGE_REGION || "";
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;
const PUBLIC_CDN_URL = "https://databuddy.b-cdn.net";

if (!STORAGE_ZONE_NAME) {
	console.error(chalk.red("❌ Missing BUNNY_STORAGE_ZONE_NAME env var"));
	process.exit(1);
}

if (!ACCESS_KEY) {
	console.error(chalk.red("❌ Missing BUNNY_STORAGE_ACCESS_KEY env var"));
	process.exit(1);
}

const BASE_URL = REGION
	? `https://${REGION}.storage.bunnycdn.com`
	: "https://storage.bunnycdn.com";

const DIST_DIR = join(import.meta.dir, "dist");

import {
	PRODUCTION_SCRIPTS,
	generateSriHash,
	getContentHash,
	versionedName,
} from "./deploy-utils";

async function getNextVersion(): Promise<number> {
	const [latest] = await db
		.select({ version: trackerVersions.version })
		.from(trackerVersions)
		.orderBy(desc(trackerVersions.version))
		.limit(1);

	return (latest?.version ?? 0) + 1;
}

async function insertVersionRow(
	version: number,
	filename: string,
	sriHash: string,
	sizeBytes: number
) {
	await db
		.update(trackerVersions)
		.set({ isCurrent: false })
		.where(eq(trackerVersions.filename, filename));

	await db.insert(trackerVersions).values({
		version,
		filename,
		sriHash,
		sizeBytes,
		isCurrent: true,
	});
}

async function runTests() {
	console.log(chalk.blue("\n🧪 Running tests before deployment..."));
	const testProcess = spawn(["bun", "run", "test:e2e"], {
		stdout: "inherit",
		stderr: "inherit",
		cwd: import.meta.dir,
	});

	const exitCode = await testProcess.exited;

	if (exitCode !== 0) {
		console.error(chalk.red("\n❌ Tests failed! Deployment aborted."));
		process.exit(exitCode);
	}

	console.log(chalk.green("✅ Tests passed!"));
}

async function runBuild() {
	console.log(chalk.blue("\n🛠️  Building project..."));
	const buildProcess = spawn(["bun", "run", "build"], {
		stdout: "inherit",
		stderr: "inherit",
		cwd: import.meta.dir,
	});

	const exitCode = await buildProcess.exited;

	if (exitCode !== 0) {
		console.error(chalk.red("\n❌ Build failed! Deployment aborted."));
		process.exit(exitCode);
	}

	console.log(chalk.green("✅ Build successful!"));
}

async function fetchRemoteHash(filename: string): Promise<string | null> {
	try {
		const url = `${PUBLIC_CDN_URL}/${filename}`;
		const response = await fetch(url);
		if (!response.ok) {
			return null;
		}
		const text = await response.text();
		return getContentHash(text);
	} catch {
		return null;
	}
}

async function checkFileStatus(filename: string): Promise<{
	filename: string;
	status: "changed" | "same" | "new" | "error";
	size: number;
	content?: string;
}> {
	const filePath = join(DIST_DIR, filename);
	const fileContent = file(filePath);

	if (!(await fileContent.exists())) {
		return { filename, status: "error", size: 0 };
	}

	const content = await fileContent.text();
	const localHash = getContentHash(content);
	const remoteHash = await fetchRemoteHash(filename);
	const size = (await fileContent.size) / 1024;

	if (!remoteHash) {
		return { filename, status: "new", size, content };
	}

	if (remoteHash !== localHash || options.force) {
		return { filename, status: "changed", size, content };
	}

	return { filename, status: "same", size };
}

async function uploadFile(
	filename: string,
	content: string,
	size: number
): Promise<{
	filename: string;
	status: "uploaded" | "dry-run" | "error";
	size: number;
}> {
	const url = `${BASE_URL}/${STORAGE_ZONE_NAME}/${filename}`;

	if (options.dryRun) {
		console.log(
			chalk.cyan(`[DRY RUN] Would upload ${chalk.bold(filename)}`) +
				chalk.dim(` (${size.toFixed(2)} KB) to ${url}`)
		);
		return { filename, status: "dry-run", size };
	}

	if (options.verbose) {
		console.log(chalk.dim(`Uploading ${filename} (${size.toFixed(2)} KB)...`));
	}

	try {
		const start = performance.now();
		const response = await fetch(url, {
			method: "PUT",
			headers: {
				AccessKey: ACCESS_KEY as string,
				"Content-Type": "application/javascript",
			},
			body: content,
		});

		if (!response.ok) {
			const text = await response.text();
			throw new Error(`HTTP ${response.status}: ${text}`);
		}

		const duration = (performance.now() - start).toFixed(0);
		console.log(
			chalk.green(`✅ Uploaded ${filename}`) + chalk.dim(` in ${duration}ms`)
		);
		return { filename, status: "uploaded", size };
	} catch (error) {
		console.error(chalk.red(`❌ Failed to upload ${filename}:`), error);
		return { filename, status: "error", size };
	}
}

async function sendDiscordNotification(
	uploadedFiles: { filename: string; size: number }[],
	version: number,
	sriHashes: Map<string, string>,
	message?: string
) {
	if (!DISCORD_WEBHOOK_URL) {
		return;
	}

	try {
		const totalSize = uploadedFiles.reduce((acc, f) => acc + f.size, 0);
		const fileList = uploadedFiles
			.map((f) => `- **${f.filename}** (${f.size.toFixed(2)} KB)`)
			.join("\n");

		const sriList = [...sriHashes.entries()]
			.map(([name, hash]) => `- \`${name}\`: \`${hash.slice(0, 30)}...\``)
			.join("\n");

		const embed = {
			title: `Tracker Scripts Deployed (v${version})`,
			description: message
				? `> ${message}`
				: "A new version of the tracker scripts has been deployed to the CDN.",
			color: 5_763_719,
			fields: [
				{
					name: "Updated Files",
					value: fileList,
					inline: false,
				},
				{
					name: "SRI Hashes",
					value: sriList,
					inline: false,
				},
				{
					name: "Deployment Stats",
					value: `**Version:** v${version}\n**Total Size:** ${totalSize.toFixed(2)} KB\n**Files:** ${uploadedFiles.length}\n**Environment:** Production`,
					inline: false,
				},
			],
			timestamp: new Date().toISOString(),
			footer: {
				text: "Databuddy Tracker Deployment",
			},
		};

		await fetch(DISCORD_WEBHOOK_URL, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({ embeds: [embed] }),
		});
		console.log(chalk.blue("\n📨 Discord notification sent"));
	} catch (error) {
		console.error(
			chalk.yellow("⚠️ Failed to send Discord notification:"),
			error
		);
	}
}

async function purgePullZoneCache() {
	if (!(API_KEY && PULL_ZONE_ID)) {
		console.warn(
			chalk.yellow(
				"⚠️ Missing BUNNY_API_KEY or BUNNY_PULL_ZONE_ID. Skipping cache purge."
			)
		);
		return;
	}

	try {
		const url = `https://api.bunny.net/pullzone/${PULL_ZONE_ID}/purgeCache`;
		const response = await fetch(url, {
			method: "POST",
			headers: {
				AccessKey: API_KEY,
				"Content-Type": "application/json",
			},
		});

		if (response.status === 204 || response.ok) {
			console.log(chalk.green("🧹 Successfully purged Pull Zone cache"));
		} else {
			const text = await response.text();
			console.error(
				chalk.red(
					`❌ Failed to purge Pull Zone cache: ${response.status} - ${text}`
				)
			);
		}
	} catch (error) {
		console.error(chalk.red("❌ Failed to purge Pull Zone cache:"), error);
	}
}

async function deploy() {
	try {
		if (!options.skipBuild) {
			await runBuild();
		}

		if (!(options.skipTests || options.dryRun)) {
			await runTests();
		}

		const files = await readdir(DIST_DIR);
		const jsFiles = files.filter(
			(f) => f.endsWith(".js") || f.endsWith(".map")
		);

		if (jsFiles.length === 0) {
			console.log(chalk.yellow("⚠️ No files found in dist/ to upload."));
			return;
		}

		console.log(
			chalk.bold(
				`\n🚀 Preparing to deploy ${jsFiles.length} files to ${chalk.cyan(STORAGE_ZONE_NAME)}...`
			)
		);

		if (options.verbose) {
			console.log(chalk.dim(`Target URL Base: ${BASE_URL}`));
			console.log(chalk.dim(`Files: ${jsFiles.join(", ")}`));
		}

		console.log(chalk.dim("Checking for changes..."));
		const fileStatuses = await Promise.all(jsFiles.map(checkFileStatus));

		const changedFiles = fileStatuses.filter(
			(f) => f.status === "changed" || f.status === "new"
		);

		if (changedFiles.length === 0) {
			console.log(
				chalk.green("✨ No changes detected. Everything is up to date.")
			);
			return;
		}

		const version = await getNextVersion();

		console.log(
			chalk.bold(
				`\n📦 Version ${chalk.cyan(`v${version}`)} — ${changedFiles.length} files to update in ${chalk.cyan(STORAGE_ZONE_NAME)}:`
			)
		);

		const sriHashes = new Map<string, string>();

		for (const f of changedFiles) {
			const icon = f.status === "new" ? "🆕" : "🔄";
			const isProduction = PRODUCTION_SCRIPTS.includes(f.filename);

			if (isProduction && f.content) {
				const sri = await generateSriHash(f.content);
				sriHashes.set(f.filename, sri);
				console.log(
					` ${icon} ${chalk.white(f.filename)} ${chalk.dim(`(${f.size.toFixed(2)} KB)`)}` +
						chalk.dim(` → also uploading ${versionedName(f.filename, version)}`)
				);
				console.log(chalk.dim(`    SRI: ${sri}`));
			} else {
				console.log(
					` ${icon} ${chalk.white(f.filename)} ${chalk.dim(`(${f.size.toFixed(2)} KB)`)}`
				);
			}
		}

		const skipConfirmation = options.yes || options.dryRun;

		if (!skipConfirmation) {
			const { confirm } = await import("@inquirer/prompts");
			const answer = await confirm({
				message: "Do you want to proceed with the deployment?",
				default: true,
			});

			if (!answer) {
				console.log(chalk.yellow("Cancelled."));
				process.exit(0);
			}
		}

		const uploadResults: {
			filename: string;
			status: "uploaded" | "dry-run" | "error";
			size: number;
		}[] = [];

		for (const f of changedFiles) {
			if (!f.content) {
				continue;
			}

			const result = await uploadFile(f.filename, f.content, f.size);
			uploadResults.push(result);

			if (
				PRODUCTION_SCRIPTS.includes(f.filename) &&
				result.status !== "error"
			) {
				const versioned = versionedName(f.filename, version);
				const versionedResult = await uploadFile(versioned, f.content, f.size);
				uploadResults.push(versionedResult);
			}
		}

		const uploaded = uploadResults.filter((r) => r.status === "uploaded");

		if (options.dryRun) {
			console.log(
				chalk.cyan("\n✨ Dry run completed. No files were uploaded.")
			);
			console.log(
				chalk.cyan(
					`Would have recorded version v${version} with ${sriHashes.size} SRI hashes in database.`
				)
			);
		} else {
			if (uploaded.length > 0) {
				for (const [filename, sri] of sriHashes) {
					const f = changedFiles.find((cf) => cf.filename === filename);
					if (!f?.content) {
						continue;
					}
					await insertVersionRow(
						version,
						filename,
						sri,
						Buffer.byteLength(f.content, "utf-8")
					);
				}

				if (sriHashes.size > 0) {
					console.log(
						chalk.green(
							`\n📝 Recorded v${version} in database (${sriHashes.size} scripts)`
						)
					);
				}

				console.log(chalk.dim("\n🧹 Purging Pull Zone cache..."));
				await purgePullZoneCache();

				if (options.skipNotification) {
					console.log(
						chalk.gray("🔕 Skipping Discord notification (--skip-notification)")
					);
				} else {
					await sendDiscordNotification(
						uploaded,
						version,
						sriHashes,
						options.message
					);
				}
			}

			console.log(
				chalk.green(
					`\n✨ Deployment complete! v${version} (${uploaded.length} files updated)`
				)
			);
		}
	} catch (error) {
		console.error(chalk.red("❌ Deployment failed:"), error);
		process.exit(1);
	}
}

if (options.purge) {
	console.log(chalk.bold("\n🧹 Purging Pull Zone cache..."));
	purgePullZoneCache()
		.then(() => {
			process.exit(0);
		})
		.catch((error) => {
			console.error(chalk.red("❌ Purge failed:"), error);
			process.exit(1);
		});
} else {
	deploy();
}
