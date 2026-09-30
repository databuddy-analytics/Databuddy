import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { file } from "bun";
import { Command } from "commander";
import { db, desc, eq, shutdownPostgres, trackerVersions } from "@databuddy/db";
import {
	PRODUCTION_SCRIPTS,
	generateSriHash,
	getContentHash,
	versionedName,
} from "./deploy-utils";

const options = new Command()
	.name("deploy")
	.description("Deploy Databuddy tracker scripts to Bunny.net Storage")
	.option("-d, --dry-run", "Report what would change without uploading")
	.option("-f, --force", "Upload every file even if its hash matches")
	.parse(process.argv)
	.opts<{ dryRun?: boolean; force?: boolean }>();

const STORAGE_ZONE_NAME = process.env.BUNNY_STORAGE_ZONE_NAME;
const ACCESS_KEY = process.env.BUNNY_STORAGE_ACCESS_KEY;
const REGION = process.env.BUNNY_STORAGE_REGION;
const DISCORD_WEBHOOK_URL = process.env.DISCORD_WEBHOOK_URL;

if (!(STORAGE_ZONE_NAME && ACCESS_KEY)) {
	console.error(
		"Missing BUNNY_STORAGE_ZONE_NAME or BUNNY_STORAGE_ACCESS_KEY. Deploys run from the tracker-cdn GitHub environment."
	);
	process.exit(1);
}

const STORAGE_URL = `https://${REGION ? `${REGION}.` : ""}storage.bunnycdn.com/${STORAGE_ZONE_NAME}`;
const DIST_DIR = join(import.meta.dir, "dist");

interface ChangedFile {
	content: string;
	filename: string;
}

async function fetchStoredHash(filename: string): Promise<string | null> {
	const response = await fetch(`${STORAGE_URL}/${filename}`, {
		headers: { AccessKey: ACCESS_KEY as string },
	});
	if (response.status === 404) {
		return null;
	}
	if (!response.ok) {
		throw new Error(
			`Reading ${filename} from storage: HTTP ${response.status}`
		);
	}
	return getContentHash(await response.text());
}

async function upload(filename: string, content: string) {
	if (options.dryRun) {
		console.log(`[dry run] would upload ${filename}`);
		return;
	}
	const response = await fetch(`${STORAGE_URL}/${filename}`, {
		method: "PUT",
		headers: {
			AccessKey: ACCESS_KEY as string,
			"Content-Type": "application/javascript",
		},
		body: content,
	});
	if (!response.ok) {
		throw new Error(
			`Uploading ${filename}: HTTP ${response.status} ${await response.text()}`
		);
	}
	console.log(`uploaded ${filename}`);
}

async function findChangedFiles(): Promise<ChangedFile[]> {
	const filenames = (await readdir(DIST_DIR)).filter((f) => f.endsWith(".js"));
	if (filenames.length === 0) {
		throw new Error("dist/ has no scripts; build before deploying");
	}
	const changed: ChangedFile[] = [];
	for (const filename of filenames) {
		const content = await file(join(DIST_DIR, filename)).text();
		const stored = options.force ? null : await fetchStoredHash(filename);
		if (options.force || stored !== getContentHash(content)) {
			changed.push({ filename, content });
		}
	}
	return changed;
}

async function recordVersions(
	version: number,
	released: { filename: string; sriHash: string; sizeBytes: number }[]
) {
	await db.transaction(async (tx) => {
		for (const row of released) {
			await tx
				.update(trackerVersions)
				.set({ isCurrent: false })
				.where(eq(trackerVersions.filename, row.filename));
			await tx
				.insert(trackerVersions)
				.values({ version, ...row, isCurrent: true });
		}
	});
}

async function announce(version: number, filenames: string[]) {
	if (!DISCORD_WEBHOOK_URL || options.dryRun) {
		return;
	}
	const response = await fetch(DISCORD_WEBHOOK_URL, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			embeds: [
				{
					title: `Tracker Scripts Deployed (v${version})`,
					description:
						"A new version of the tracker scripts has been deployed to the CDN.",
					color: 5_763_719,
					fields: [
						{
							name: "Updated Files",
							value: filenames.map((f) => `- **${f}**`).join("\n"),
						},
					],
					timestamp: new Date().toISOString(),
					footer: { text: "Databuddy Tracker Deployment" },
				},
			],
		}),
	});
	if (!response.ok) {
		console.warn(`Discord announcement failed: HTTP ${response.status}`);
	}
}

async function deploy() {
	const changed = await findChangedFiles();
	if (changed.length === 0) {
		console.log("No changes. The CDN already serves this build.");
		return;
	}

	const [latest] = await db
		.select({ version: trackerVersions.version })
		.from(trackerVersions)
		.orderBy(desc(trackerVersions.version))
		.limit(1);
	const version = (latest?.version ?? 0) + 1;
	const released = changed.filter((f) =>
		PRODUCTION_SCRIPTS.includes(f.filename)
	);

	console.log(
		`v${version}: ${changed.map((f) => f.filename).join(", ")}${options.dryRun ? " (dry run)" : ""}`
	);

	for (const f of released) {
		await upload(versionedName(f.filename, version), f.content);
	}
	for (const f of changed) {
		await upload(f.filename, f.content);
	}

	if (options.dryRun || released.length === 0) {
		return;
	}

	const rows = await Promise.all(
		released.map(async (f) => ({
			filename: f.filename,
			sriHash: await generateSriHash(f.content),
			sizeBytes: Buffer.byteLength(f.content, "utf-8"),
		}))
	);
	await recordVersions(version, rows);
	for (const row of rows) {
		console.log(`recorded ${row.filename} v${version} ${row.sriHash}`);
	}
	await announce(
		version,
		changed.map((f) => f.filename)
	);
}

try {
	await deploy();
} catch (error) {
	console.error(error);
	process.exitCode = 1;
} finally {
	await shutdownPostgres();
}
