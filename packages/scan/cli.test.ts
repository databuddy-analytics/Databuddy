import assert from "node:assert/strict";
import {
	spawn,
	spawnSync,
	type SpawnSyncOptionsWithStringEncoding,
} from "node:child_process";
import { createHash } from "node:crypto";
import {
	access,
	mkdir,
	mkdtemp,
	readFile,
	readdir,
	realpath,
	rm,
	symlink,
	writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "bun:test";

type Runtime = "node" | "bun";
interface Attempt {
	error?: string;
	status: number | null;
}
interface ScanResult {
	calls: { attempts: Attempt[]; error?: string }[];
	rows: {
		path: string;
		action?: {
			label: string;
			sites: { path: string; start: number; end: number }[];
			issues: string[];
		};
	}[];
	summary: {
		root: string;
		classifiedFiles: number;
		failures: number;
		requestAttempts: number;
		cachedBatches: number;
		missingCostReports: number;
		unknownFailedCallCosts: number;
		interrupted?: boolean;
	};
}
interface Inventory {
	files: { path: string; status: string; reason?: string }[];
	root: string;
}
interface Captured {
	body: {
		state: { segments: { source: string }[] };
		providerOptions: { gateway: { zeroDataRetention: boolean } };
	};
	headers: Record<string, string>;
	mode: string;
	sequence: number;
	url: string;
}
interface PackageInfo {
	bin: Record<string, string>;
	dependencies: Record<string, string>;
	engines: { node: string };
	files: string[];
	name: string;
	scripts: { build: string };
	version: string;
}
const packageDir = dirname(fileURLToPath(import.meta.url));
const scanner = join(packageDir, "dist/cli.js");

async function exists(path: string) {
	try {
		await access(path);
		return true;
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === "ENOENT") {
			return false;
		}
		throw error;
	}
}

// Build first. Package-manager checks use the normal npm cache, or SCAN_TEST_NPM_CACHE.
// If offline installation reports ENOTCACHED, install this package tarball once with npm
// into a temporary directory to seed runtime dependencies, then rerun these tests.
test("compiled CLI scans safely, resumes, and runs from a standalone npm package", async () => {
	const temporary = await mkdtemp(join(tmpdir(), "databuddy-scan-test-"));
	const outside = join(temporary, "outside"),
		cache = join(temporary, "cache");
	const capturePath = join(temporary, "requests.ndjson"),
		preload = join(temporary, "mock-fetch.mjs");
	const env: NodeJS.ProcessEnv = {
		PATH: process.env.PATH,
		TERM: "dumb",
		NO_COLOR: "1",
		XDG_CACHE_HOME: cache,
		AI_GATEWAY_API_KEY: "synthetic-key-no-network",
		SCAN_TEST_CAPTURE: capturePath,
	};
	function command(
		binary: string,
		args: string[],
		options: SpawnSyncOptionsWithStringEncoding = { encoding: "utf8" }
	) {
		const result = spawnSync(binary, args, {
			cwd: outside,
			env,
			timeout: 20_000,
			maxBuffer: 8 * 1024 * 1024,
			...options,
			encoding: "utf8",
		});
		assert.ifError(result.error);
		assert.equal(result.signal, null, `${binary} was interrupted`);
		return result;
	}
	function ok(
		binary: string,
		args: string[],
		options?: SpawnSyncOptionsWithStringEncoding
	) {
		const result = command(binary, args, options);
		assert.equal(
			result.status,
			0,
			`${binary} failed:\n${result.stderr}\n${result.stdout}`
		);
		return result.stdout;
	}
	function cli(
		runtime: Runtime,
		args: string[],
		{ cwd = outside, mode = "forbid", status = 0 } = {}
	) {
		const result = command(
			runtime,
			[runtime === "bun" ? "--preload" : "--import", preload, scanner, ...args],
			{ cwd, env: { ...env, SCAN_TEST_MODE: mode }, encoding: "utf8" }
		);
		assert.equal(
			result.status,
			status,
			`${runtime} ${args.join(" ")}:\n${result.stderr}\n${result.stdout}`
		);
		assert.ok(
			!result.stdout.includes("\x1b"),
			"Plain/JSON output contains terminal controls"
		);
		return result;
	}
	async function requests(): Promise<Captured[]> {
		return (await exists(capturePath))
			? (await readFile(capturePath, "utf8"))
					.trim()
					.split("\n")
					.filter(Boolean)
					.map((line) => JSON.parse(line) as Captured)
			: [];
	}
	try {
		await mkdir(outside);
		assert.ok(
			await exists(scanner),
			"Run the package build before these integration tests"
		);
		const packageInfo = JSON.parse(
			await readFile(join(packageDir, "package.json"), "utf8")
		) as PackageInfo;
		assert.equal(packageInfo.name, "@databuddy/scan");
		assert.equal(
			packageInfo.bin["databuddy-scan"]?.replace(/^\.\//, ""),
			"dist/cli.js"
		);
		assert.deepEqual(packageInfo.files, ["dist"]);
		assert.equal(packageInfo.engines.node, ">=22");
		for (const dependency of [
			"commander",
			"zod",
			"chalk",
			"log-update",
			"p-limit",
			"typescript",
		]) {
			assert.ok(
				packageInfo.dependencies[dependency],
				`${dependency} must be a runtime dependency`
			);
		}
		assert.ok(packageInfo.scripts.build);
		assert.ok(
			(await readFile(scanner, "utf8")).startsWith("#!/usr/bin/env node\n")
		);
		await writeFile(
			preload,
			`import {appendFileSync} from 'node:fs';
let sequence=0;
globalThis.fetch=async(url,options)=>{
 const mode=process.env.SCAN_TEST_MODE;
 if(mode==='forbid')throw Error('NETWORK_FORBIDDEN');
 const body=JSON.parse(options.body);
 appendFileSync(process.env.SCAN_TEST_CAPTURE,JSON.stringify({mode,sequence:++sequence,url,headers:options.headers,body})+'\\n');
 if(mode==='retry-once'&&sequence===1)return Response.json({error:{type:'service_unavailable_error',message:'DO_NOT_LOG_PROVIDER_BODY'}},{status:503});
 if(mode==='interrupt'&&sequence>1)return new Promise((resolve,reject)=>{const timer=setTimeout(()=>reject(Error('Mock wait expired')),10000);const abort=()=>{clearTimeout(timer);reject(options.signal.reason)};if(options.signal.aborted)abort();else options.signal.addEventListener('abort',abort,{once:true});});
 const answers={};for(let i=0;i<body.state.segments.length;i++){answers['coverage_'+i]={choice:'missing',probabilities:{missing:1}};answers['category_'+i]={choice:'activation',probabilities:{activation:1}};answers['priority_'+i]={score:2,probabilities:{2:1}};}
 if(mode==='invalid-probabilities')answers.coverage_0.probabilities.missing=2;
 if(mode==='invalid-answers')return Response.json(null);
 return Response.json({answers,usage:{inputTokens:10,outputTokens:5},providerMetadata:{gateway:{cost:0.001}}});
};\n`
		);
		for (const runtime of ["node", "bun"] as const) {
			assert.match(cli(runtime, ["--help"]).stdout, /--dry-run/);
			assert.equal(
				cli(runtime, ["--version"]).stdout.trim(),
				packageInfo.version
			);
			assert.equal(
				await exists(join(cache, "databuddy/scan")),
				false,
				"Metadata commands created scan output"
			);
		}
		const repoPath = join(temporary, "repo");
		await mkdir(join(repoPath, "src"), { recursive: true });
		const repo = await realpath(repoPath),
			sourceMarker = "SYNTHETIC_PRODUCT_SOURCE";
		await writeFile(
			join(repo, "src/checkout.ts"),
			`export async function buy() { return checkout.purchase('${sourceMarker}'); }\n`
		);
		await writeFile(
			join(repo, "src/settings.tsx"),
			"export function Settings() { return <button onClick={() => saveSettings()}>Save settings</button>; }\n"
		);
		await writeFile(
			join(repo, "src/analytics.ts"),
			"export function completed() { capture('fixture_completed'); }\n"
		);
		await writeFile(join(repo, ".env"), "DO_NOT_SEND=ENV_CONTENT_MARKER\n");
		await writeFile(
			join(repo, "src/private.ts"),
			`export const key = 'sk_live_${"S".repeat(32)}'; // EMBEDDED_SECRET_MARKER\n`
		);
		await writeFile(
			join(temporary, "external.ts"),
			"export const external = 'OUTSIDE_SOURCE_MARKER';\n"
		);
		await symlink(join(temporary, "external.ts"), join(repo, "src/linked.ts"));
		const ancestorLinks = [
			{
				path: "src/escaped/nested.ts",
				target: join(temporary, "external-directory"),
				marker: "OUTSIDE_ANCESTOR_SOURCE_MARKER",
			},
			{
				path: "src/internal-link/nested.ts",
				target: join(repo, "untracked-target"),
				marker: "INTERNAL_ANCESTOR_SOURCE_MARKER",
			},
		];
		for (const link of ancestorLinks) {
			await mkdir(dirname(join(repo, link.path)), { recursive: true });
			await writeFile(join(repo, link.path), "export const before = true;\n");
		}
		ok("git", ["init", "--quiet"], { cwd: repo, encoding: "utf8" });
		ok("git", ["add", "."], { cwd: repo, encoding: "utf8" });
		ok(
			"git",
			[
				"-c",
				"user.name=Fixture",
				"-c",
				"user.email=fixture@example.com",
				"-c",
				"commit.gpgsign=false",
				"-c",
				"core.hooksPath=/dev/null",
				"commit",
				"--quiet",
				"-m",
				"Synthetic source",
			],
			{ cwd: repo, encoding: "utf8" }
		);
		// Tracked regular leaf files must remain excluded when an ancestor becomes a symlink.
		for (const link of ancestorLinks) {
			await mkdir(link.target, { recursive: true });
			await writeFile(
				join(link.target, "nested.ts"),
				`export const redirected = '${link.marker}';\n`
			);
			const ancestor = dirname(join(repo, link.path));
			await rm(ancestor, { recursive: true });
			await symlink(link.target, ancestor);
		}
		const output = join(temporary, "output"),
			common = [
				repo,
				`--output=${output}`,
				"--batch-files=1",
				"--no-actions",
				"--json",
			];
		const preview = JSON.parse(
			cli("node", ["--json", "--dry-run", "--no-actions"], {
				cwd: join(repo, "src"),
			}).stdout
		) as { files: string[]; sent: boolean };
		assert.equal(preview.files.length, 3);
		assert.equal(preview.sent, false);
		const defaultOutput = join(
			cache,
			"databuddy/scan",
			createHash("sha256").update(repo).digest("hex").slice(0, 16)
		);
		const inventory = JSON.parse(
			await readFile(join(defaultOutput, "inventory.json"), "utf8")
		) as Inventory;
		assert.equal(
			inventory.root,
			repo,
			"Nested cwd did not resolve to Git root"
		);
		assert.deepEqual(
			inventory.files
				.filter((file) => file.status === "included")
				.map((file) => file.path)
				.sort(),
			["src/analytics.ts", "src/checkout.ts", "src/settings.tsx"]
		);
		for (const path of [
			"src/linked.ts",
			...ancestorLinks.map((link) => link.path),
		]) {
			assert.equal(
				inventory.files.find((file) => file.path === path)?.status,
				"excluded",
				`${path} was not excluded`
			);
		}
		assert.equal((await requests()).length, 0);
		for (const name of [
			"inventory.json",
			"results.json",
			"responses",
			"progress.ndjson",
			"ranked-files.md",
		]) {
			assert.equal(
				await exists(join(packageDir, name)),
				false,
				`Output leaked into package: ${name}`
			);
		}

		const first = JSON.parse(
			cli("node", [...common, "--fresh", "--concurrency=2"], {
				mode: "valid",
			}).stdout
		) as ScanResult;
		assert.equal(first.summary.root, repo);
		assert.equal(first.summary.classifiedFiles, 3);
		assert.equal(first.summary.failures, 0);
		assert.equal(first.summary.requestAttempts, 3);
		assert.equal(first.rows.length, 3);
		const captured = await requests();
		assert.equal(captured.length, 3);
		const payload = JSON.stringify(captured.map((request) => request.body));
		assert.ok(payload.includes(sourceMarker));
		assert.ok(
			payload.includes("fixture_completed"),
			"Repository tracking candidates missing"
		);
		for (const forbidden of [
			"ENV_CONTENT_MARKER",
			"EMBEDDED_SECRET_MARKER",
			"OUTSIDE_SOURCE_MARKER",
			...ancestorLinks.map((link) => link.marker),
			"packages/rpc/src",
			"SELF_ANALYTICS_WEBSITE_ID",
			"first_review_started",
			"agent_activity",
			"Autumn",
			"runTracked",
			"configureApiInstrumentation",
		]) {
			assert.ok(
				!payload.includes(forbidden),
				`Excluded/foreign facts leaked: ${forbidden}`
			);
		}
		for (const request of captured) {
			assert.equal(
				request.url,
				"https://ai-gateway.vercel.sh/v4/ai/evaluation-model"
			);
			assert.equal(
				request.headers.Authorization,
				"Bearer synthetic-key-no-network"
			);
			assert.equal(
				request.body.providerOptions.gateway.zeroDataRetention,
				true
			);
		}
		const savedPath = join(output, "results.json"),
			saved = await readFile(savedPath, "utf8");
		assert.deepEqual(JSON.parse(saved), first);
		const replayFiles = ["results.json", "inventory.json", "progress.ndjson"];
		const beforeReplay = await Promise.all(
			replayFiles.map((name) => readFile(join(output, name), "utf8"))
		);
		const cached = JSON.parse(
			cli("bun", [...common, "--cache-only"]).stdout
		) as ScanResult;
		assert.equal(cached.summary.cachedBatches, 3);
		assert.equal(cached.summary.requestAttempts, 0);
		const emptyCache = join(temporary, "empty-cache");
		const missingCache = JSON.parse(
			cli("node", ["--cache-only", "--json", repo, `--output=${emptyCache}`], {
				status: 1,
			}).stdout
		) as ScanResult;
		assert.equal(missingCache.summary.requestAttempts, 0);
		assert.equal(missingCache.summary.missingCostReports, 0);
		assert.equal(missingCache.summary.unknownFailedCallCosts, 0);
		assert.equal(await exists(emptyCache), false);
		assert.deepEqual(
			await Promise.all(
				replayFiles.map((name) => readFile(join(output, name), "utf8"))
			),
			beforeReplay,
			"Cache-only replay changed saved output"
		);
		const resumed = JSON.parse(cli("node", common).stdout) as ScanResult;
		assert.equal(resumed.summary.requestAttempts, 0);
		assert.equal(resumed.summary.cachedBatches, 3);
		assert.equal((await requests()).length, 3);
		const bunRun = JSON.parse(
			cli(
				"bun",
				[
					repo,
					`--output=${join(temporary, "bun-output")}`,
					"--no-actions",
					"--json",
				],
				{ mode: "valid" }
			).stdout
		) as ScanResult;
		assert.equal(bunRun.summary.classifiedFiles, 3);
		assert.equal(bunRun.summary.requestAttempts, 1);

		for (const [runtime, mode] of [
			["node", "invalid-probabilities"],
			["bun", "invalid-answers"],
		] as const) {
			const invalidOutput = join(temporary, mode);
			cli(
				runtime,
				[
					repo,
					`--output=${invalidOutput}`,
					"--fresh",
					"--no-actions",
					"--json",
				],
				{ mode, status: 1 }
			);
			const rejected = JSON.parse(
				await readFile(join(invalidOutput, "results.json"), "utf8")
			) as ScanResult;
			assert.equal(rejected.summary.failures, 1);
			assert.equal(rejected.summary.requestAttempts, 1);
			assert.equal(rejected.rows.length, 0);
			assert.match(
				rejected.calls.find((call) => call.error)?.error ?? "",
				/invalid|response|probabilit|answers/i
			);
			assert.deepEqual(await readdir(join(invalidOutput, "responses")), []);
		}
		const retryOutput = join(temporary, "retry-once");
		const retried = JSON.parse(
			cli("node", [repo, `--output=${retryOutput}`, "--no-actions", "--json"], {
				mode: "retry-once",
			}).stdout
		) as ScanResult;
		assert.equal(retried.summary.requestAttempts, 2);
		assert.equal(retried.summary.classifiedFiles, 3);
		const log = await readFile(join(retryOutput, "progress.ndjson"), "utf8");
		for (const secret of [
			sourceMarker,
			"synthetic-key-no-network",
			"DO_NOT_LOG_PROVIDER_BODY",
		]) {
			assert.ok(!log.includes(secret), `Request log leaked ${secret}`);
		}

		const interruptedOutput = join(temporary, "interrupted");
		const child = spawn(
			"node",
			[
				"--import",
				preload,
				scanner,
				repo,
				`--output=${interruptedOutput}`,
				"--no-actions",
				"--json",
				"--batch-files=1",
				"--concurrency=1",
			],
			{
				cwd: outside,
				env: { ...env, SCAN_TEST_MODE: "interrupt" },
				stdio: ["ignore", "pipe", "pipe"],
			}
		);
		let childOut = "",
			childError = "";
		child.stdout.on("data", (chunk) => {
			childOut += chunk.toString();
		});
		child.stderr.on("data", (chunk) => {
			childError += chunk.toString();
		});
		const closed = new Promise<number | null>((resolve, reject) => {
			child.once("error", reject);
			child.once("close", resolve);
		});
		try {
			const deadline = Date.now() + 5000;
			while (
				!(await requests()).some(
					(request) => request.mode === "interrupt" && request.sequence === 2
				)
			) {
				assert.ok(
					Date.now() < deadline,
					`Interrupt fixture did not reach second request: ${childError}`
				);
				await new Promise((resolve) => setTimeout(resolve, 10));
			}
			child.kill("SIGINT");
			const timer = setTimeout(() => child.kill("SIGKILL"), 5000);
			try {
				assert.equal(await closed, 130, childError);
			} finally {
				clearTimeout(timer);
			}
			const stopped = JSON.parse(childOut) as ScanResult;
			assert.equal(stopped.summary.interrupted, true);
			assert.equal(stopped.summary.classifiedFiles, 1);
			assert.deepEqual(
				JSON.parse(
					await readFile(join(interruptedOutput, "results.json"), "utf8")
				),
				stopped
			);
			assert.equal(
				(await readdir(join(interruptedOutput, "responses"))).length,
				1
			);
		} finally {
			if (child.exitCode === null && child.signalCode === null) {
				child.kill("SIGKILL");
				await closed;
			}
		}

		const actionRepo = join(temporary, "action-repo");
		await mkdir(actionRepo);
		const actionSource = `import { copyReport } from "./copy";
import { secretPrepare } from "./secret";
import { externalPrepare } from "./linked";
export function Report() {
  const request = useMutation({ mutationFn: api.requestReport,
    onSuccess(result) { if (result.status === "queued") showQueued(); }
  });
  function submitReport() {
    secretPrepare();
    externalPrepare();
    request.mutate({ reportId });
  }
  return <section>
    <button onClick={submitReport}>Generate report</button>
    <button onClick={copyReport}>Copy report</button>
  </section>;
}`;
		await writeFile(join(actionRepo, "page.tsx"), actionSource);
		await writeFile(
			join(actionRepo, "copy.ts"),
			`export async function copyReport() {
  await navigator.clipboard.writeText("SYNTHETIC_IMPORTED_COPY");
  showCopied();
}`
		);
		await writeFile(
			join(actionRepo, "secret.ts"),
			`export function secretPrepare() { return "sk_live_${"S".repeat(32)}_EXCLUDED_IMPORT_SECRET"; }`
		);
		await writeFile(
			join(temporary, "action-external.ts"),
			'export function externalPrepare() { return "EXCLUDED_SYMLINK_IMPORT"; }'
		);
		await symlink(
			join(temporary, "action-external.ts"),
			join(actionRepo, "linked.ts")
		);
		ok("git", ["init", "--quiet"], { cwd: actionRepo, encoding: "utf8" });
		ok("git", ["add", "."], { cwd: actionRepo, encoding: "utf8" });
		const actionArgs = [
			actionRepo,
			`--output=${join(temporary, "action-output")}`,
			"--json",
		];
		const beforeActions = (await requests()).length;
		const actionResult = JSON.parse(
			cli("node", actionArgs, { mode: "valid" }).stdout
		) as ScanResult;
		const groupedRows = actionResult.rows.filter(
			(row) => row.path === "page.tsx" && row.action
		);
		assert.equal(
			groupedRows.length,
			2,
			"Handler and mutation must not become separate recommendations"
		);
		const mutationLine = actionSource
			.slice(0, actionSource.indexOf("request.mutate("))
			.split("\n").length;
		const mutationRows = groupedRows.filter((row) =>
			row.action?.sites.some(
				(site) =>
					site.path === "page.tsx" &&
					site.start <= mutationLine &&
					site.end >= mutationLine
			)
		);
		assert.equal(mutationRows.length, 1);
		assert.ok(
			groupedRows.some((row) =>
				row.action?.sites.some((site) => site.path === "copy.ts")
			)
		);
		const actionRequests = (await requests()).slice(beforeActions);
		assert.ok(actionRequests.length > 0);
		const actionPayload = JSON.stringify(
			actionRequests.map((request) => request.body)
		);
		assert.ok(actionPayload.includes("SYNTHETIC_IMPORTED_COPY"));
		assert.ok(
			actionRequests.some((request) =>
				request.body.state.segments.some((segment) =>
					segment.source.includes('result.status === "queued"')
				)
			)
		);
		assert.ok(!actionPayload.includes("EXCLUDED_IMPORT_SECRET"));
		assert.ok(!actionPayload.includes("EXCLUDED_SYMLINK_IMPORT"));
		const actionReplay = JSON.parse(
			cli("bun", [...actionArgs, "--cache-only"]).stdout
		) as ScanResult;
		assert.equal(actionReplay.summary.requestAttempts, 0);
		assert.equal(
			actionReplay.rows.filter((row) => row.action).length,
			actionResult.rows.filter((row) => row.action).length
		);
		assert.equal(
			(await requests()).length,
			beforeActions + actionRequests.length
		);

		const npmCache =
			process.env.SCAN_TEST_NPM_CACHE ??
			ok("npm", ["config", "get", "cache"]).trim();
		const npmConfig = join(temporary, "npmrc");
		await writeFile(npmConfig, "");
		const npmFlags = [
			"--prefer-offline",
			"--ignore-scripts",
			`--cache=${npmCache}`,
			`--userconfig=${npmConfig}`,
		];
		const packed = (
			JSON.parse(
				ok(
					"npm",
					["pack", "--json", ...npmFlags, `--pack-destination=${temporary}`],
					{ cwd: packageDir, encoding: "utf8" }
				)
			) as { filename: string; files: { path: string }[] }[]
		)[0];
		assert.ok(packed);
		const packedPaths = packed.files.map((file) => file.path);
		assert.ok(packedPaths.includes("dist/cli.js"));
		assert.ok(
			packedPaths.every(
				(path) =>
					path.startsWith("dist/") ||
					["LICENSE", "README.md", "package.json"].includes(path)
			),
			`Unexpected published files: ${packedPaths.join(", ")}`
		);
		const tarball = join(temporary, packed.filename),
			execArgs = [
				"exec",
				...npmFlags,
				"--yes",
				`--package=${tarball}`,
				"--",
				"databuddy-scan",
			];
		assert.equal(
			ok("npm", [...execArgs, "--version"]).trim(),
			packageInfo.version
		);
		assert.match(ok("npm", [...execArgs, "--help"]), /--dry-run/);
		assert.equal(
			(
				JSON.parse(
					ok("npm", [
						...execArgs,
						repo,
						`--output=${join(temporary, "installed-output")}`,
						"--dry-run",
						"--json",
					])
				) as { files: string[] }
			).files.length,
			1
		);
		const installed = join(temporary, "installed");
		await mkdir(installed);
		ok("npm", [
			"install",
			...npmFlags,
			"--no-audit",
			"--no-fund",
			`--prefix=${installed}`,
			tarball,
		]);
		for (const dependency of Object.keys(packageInfo.dependencies)) {
			assert.ok(
				await exists(
					join(installed, "node_modules", dependency, "package.json")
				),
				`Standalone installation omitted ${dependency}`
			);
		}
		assert.equal(
			ok("bun", ["x", "--no-install", "--bun", "databuddy-scan", "--version"], {
				cwd: installed,
				encoding: "utf8",
			}).trim(),
			packageInfo.version
		);
		assert.match(
			ok("bun", ["x", "--no-install", "--bun", "databuddy-scan", "--help"], {
				cwd: installed,
				encoding: "utf8",
			}),
			/--dry-run/
		);
		for (const args of [
			["--self-test"],
			["--max-batches=1"],
			["--sample-segments=1"],
			["--opportunities"],
			["--unknown"],
			["--concurrency=0"],
			["--run"],
			["--report"],
			["--diagnostics"],
			["--root=."],
			["--cache-only", "--fresh"],
			["--output="],
		]) {
			cli("node", [repo, ...args], { status: 1 });
		}
		cli("node", [], { status: 1 });
	} finally {
		await rm(temporary, { recursive: true, force: true });
	}
}, 90_000);
